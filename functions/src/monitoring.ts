import * as functions from "firebase-functions";
import { FieldValue, Transaction, getFirestore } from "firebase-admin/firestore";
import { assertString, requireAuthed } from "./utils";
import { optionalString } from "./walletStore";

type LiveFeedReq = {
  limit?: number;
};

type ClientEventReq = {
  type: string;
  message: string;
  meta?: unknown;
};

type SystemLogArgs = {
  type: string;
  uid?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
  severity?: "info" | "warn" | "critical";
};

type SpinSessionReserveArgs = {
  spinSessionId: string;
  uid: string;
  roundId: string;
  betCents: number;
  machineId?: string;
};

type SpinSessionResolveArgs = {
  spinSessionId: string;
  uid: string;
  roundId: string;
  winCents: number;
  status: "settled" | "cancelled";
  reason?: string | null;
  resultHash?: string;
};

const CLIENT_EVENT_TYPES = new Set(["spin_error", "deposit_error", "withdrawal_error"]);

function sanitizeMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toMillis(value: unknown): number {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function readSpinSessionMeta(value: unknown) {
  const meta = sanitizeMeta(value);
  if (!meta) return null;

  const spinSessionId = optionalString(meta.spinSessionId, 160);
  if (!spinSessionId) return null;

  return {
    spinSessionId,
    machineId: optionalString(meta.machineId, 80) || undefined,
    resultHash: optionalString(meta.resultHash, 160) || undefined
  };
}

export async function writeSystemLog(args: SystemLogArgs) {
  await getFirestore().collection("systemLogs").add({
    type: optionalString(args.type, 80) || "unknown",
    uid: optionalString(args.uid, 128) || null,
    message: optionalString(args.message, 500),
    severity: optionalString(args.severity, 20) || "info",
    meta: sanitizeMeta(args.meta) ?? null,
    createdAt: FieldValue.serverTimestamp()
  });
}

export function getSpinSessionRef(spinSessionId: string) {
  return getFirestore().collection("spinSessions").doc(spinSessionId);
}

export function queueSpinSessionReserve(tx: Transaction, args: SpinSessionReserveArgs) {
  const ref = getSpinSessionRef(args.spinSessionId);
  tx.set(
    ref,
    {
      uid: args.uid,
      roundId: args.roundId,
      betCents: Math.max(0, Math.floor(args.betCents)),
      winCents: 0,
      machineId: args.machineId ?? null,
      status: "reserved",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export function queueSpinSessionResolve(tx: Transaction, args: SpinSessionResolveArgs) {
  const ref = getSpinSessionRef(args.spinSessionId);
  tx.set(
    ref,
    {
      uid: args.uid,
      roundId: args.roundId,
      winCents: Math.max(0, Math.floor(args.winCents)),
      resultHash: args.resultHash ?? null,
      reason: args.reason ?? null,
      status: args.status,
      updatedAt: FieldValue.serverTimestamp(),
      settledAt: args.status === "settled" ? FieldValue.serverTimestamp() : null,
      cancelledAt: args.status === "cancelled" ? FieldValue.serverTimestamp() : null
    },
    { merge: true }
  );
}

export function queueLiveFeedEntry(
  tx: Transaction,
  args: { uid: string; type: string; amountCents: number; requestId?: string }
) {
  const amountCents = Math.max(0, Math.floor(Math.abs(args.amountCents)));
  const isDeposit = args.type === "deposit" && amountCents > 10_000;
  const isWithdrawal = args.type === "withdrawal_paid" && amountCents > 250_000;
  if (!isDeposit && !isWithdrawal) {
    return;
  }

  const ref = getFirestore().collection("liveFeed").doc();
  tx.create(ref, {
    uid: args.uid,
    type: args.type,
    amountCents,
    requestId: args.requestId ?? null,
    createdAt: FieldValue.serverTimestamp()
  });
}

export const vvGetLiveFeed = functions.https.onCall(async (data: LiveFeedReq, context) => {
  requireAuthed(context);

  const requestedLimit = Number.isInteger(data?.limit) ? Number(data.limit) : 20;
  const cappedLimit = Math.max(1, Math.min(requestedLimit, 40));
  const snap = await getFirestore()
    .collection("liveFeed")
    .orderBy("createdAt", "desc")
    .limit(cappedLimit)
    .get();

  return {
    ok: true,
    entries: snap.docs.map((doc) => {
      const row = doc.data();
      return {
        id: doc.id,
        uid: optionalString(row.uid, 128),
        type: optionalString(row.type, 80),
        amountCents: Number(row.amountCents ?? 0),
        createdAt: toMillis(row.createdAt),
        requestId: optionalString(row.requestId, 160)
      };
    })
  };
});

export const vvLogClientEvent = functions.https.onCall(async (data: ClientEventReq, context) => {
  const uid = requireAuthed(context);
  assertString("type", data?.type);
  assertString("message", data?.message);

  const type = optionalString(data.type, 80);
  if (!CLIENT_EVENT_TYPES.has(type)) {
    throw new functions.https.HttpsError("invalid-argument", "Unsupported log type");
  }

  await writeSystemLog({
    type,
    uid,
    message: data.message,
    meta: sanitizeMeta(data.meta),
    severity: type === "spin_error" ? "warn" : "info"
  });

  return { ok: true };
});
