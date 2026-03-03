import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { assertString } from "./utils";
import { writeSystemLog } from "./monitoring";
import { getDepositRequestRef, getWithdrawalRequestRef } from "./walletState";
import { optionalString } from "./walletStore";

type ListReq = {
  limit?: number;
};

type RejectReq = {
  id: string;
  reason?: string;
};

async function requireAdminAudited(
  context: functions.https.CallableContext,
  action: string
): Promise<string> {
  const uid = optionalString(context.auth?.uid, 128);
  if (!uid) {
    await writeSystemLog({
      type: "admin_misuse_attempt",
      uid: null,
      message: `Unauthenticated admin access: ${action}`,
      severity: "critical"
    });
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }
  if (context.auth?.token?.admin !== true) {
    await writeSystemLog({
      type: "admin_misuse_attempt",
      uid,
      message: `Non-admin admin access: ${action}`,
      severity: "critical"
    });
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
  return uid;
}

function toMillis(value: unknown): number {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizePendingRow(
  id: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  return {
    id,
    uid: optionalString(row.uid, 128),
    amountCents: Number(row.amountCents ?? 0),
    status: optionalString(row.status, 40),
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
    proofImageUrl: optionalString(row.proofImageUrl, 1500),
    payoutDetails:
      row.payoutDetails && typeof row.payoutDetails === "object" ? row.payoutDetails : null
  };
}

export const adminListPendingDepositRequests = functions.https.onCall(
  async (data: ListReq, context) => {
    await requireAdminAudited(context, "adminListPendingDepositRequests");
    const requestedLimit = Number.isInteger(data?.limit) ? Number(data.limit) : 50;
    const cappedLimit = Math.max(1, Math.min(requestedLimit, 100));

    const snap = await getFirestore()
      .collection("depositRequests")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    return {
      ok: true,
      entries: snap.docs
        .map((doc) => normalizePendingRow(doc.id, doc.data() as Record<string, unknown>))
        .filter((row) => row.status === "pending")
        .slice(0, cappedLimit)
    };
  }
);

export const adminListPendingWithdrawalRequests = functions.https.onCall(
  async (data: ListReq, context) => {
    await requireAdminAudited(context, "adminListPendingWithdrawalRequests");
    const requestedLimit = Number.isInteger(data?.limit) ? Number(data.limit) : 50;
    const cappedLimit = Math.max(1, Math.min(requestedLimit, 100));

    const snap = await getFirestore()
      .collection("withdrawalRequests")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    return {
      ok: true,
      entries: snap.docs
        .map((doc) => normalizePendingRow(doc.id, doc.data() as Record<string, unknown>))
        .filter((row) => row.status === "pending")
        .slice(0, cappedLimit)
    };
  }
);

export const adminRejectDepositRequest = functions.https.onCall(
  async (data: RejectReq, context) => {
    const actorUid = await requireAdminAudited(context, "adminRejectDepositRequest");
    assertString("id", data?.id);

    const db = getFirestore();
    const requestRef = getDepositRequestRef(data.id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      throw new functions.https.HttpsError("not-found", "deposit request not found");
    }

    const reason = optionalString(data.reason, 240) || "rejected";

    await db.runTransaction(async (tx) => {
      const freshRequestSnap = await tx.get(requestRef);
      const freshRequest = freshRequestSnap.data() as Record<string, unknown> | undefined;
      if (!freshRequestSnap.exists || freshRequest?.status !== "pending") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "deposit request already processed"
        );
      }

      tx.update(requestRef, {
        status: "rejected",
        rejectedAt: FieldValue.serverTimestamp(),
        rejectedBy: actorUid,
        rejectReason: reason,
        updatedAt: FieldValue.serverTimestamp()
      });

      const uid = optionalString(freshRequest.uid, 128);
      const ledgerEntryId = optionalString(freshRequest.ledgerEntryId, 160);
      if (uid && ledgerEntryId) {
        tx.set(
          db.doc(`users/${uid}/ledger/${ledgerEntryId}`),
          {
            status: "rejected",
            rejectReason: reason,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    });

    await writeSystemLog({
      type: "deposit_request_rejected",
      uid: optionalString(requestSnap.data()?.uid, 128) || null,
      message: reason,
      severity: "info",
      meta: { requestId: data.id, actorUid }
    });

    return { ok: true };
  }
);

export const adminRejectWithdrawalRequest = functions.https.onCall(
  async (data: RejectReq, context) => {
    const actorUid = await requireAdminAudited(context, "adminRejectWithdrawalRequest");
    assertString("id", data?.id);

    const db = getFirestore();
    const requestRef = getWithdrawalRequestRef(data.id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      throw new functions.https.HttpsError("not-found", "withdrawal request not found");
    }

    const reason = optionalString(data.reason, 240) || "rejected";

    await db.runTransaction(async (tx) => {
      const freshRequestSnap = await tx.get(requestRef);
      const freshRequest = freshRequestSnap.data() as Record<string, unknown> | undefined;
      if (!freshRequestSnap.exists || freshRequest?.status !== "pending") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "withdrawal request already processed"
        );
      }

      tx.update(requestRef, {
        status: "rejected",
        rejectedAt: FieldValue.serverTimestamp(),
        rejectedBy: actorUid,
        rejectReason: reason,
        updatedAt: FieldValue.serverTimestamp()
      });

      const uid = optionalString(freshRequest.uid, 128);
      const ledgerEntryId = optionalString(freshRequest.ledgerEntryId, 160);
      if (uid && ledgerEntryId) {
        tx.set(
          db.doc(`users/${uid}/ledger/${ledgerEntryId}`),
          {
            status: "rejected",
            rejectReason: reason,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    });

    await writeSystemLog({
      type: "withdrawal_request_rejected",
      uid: optionalString(requestSnap.data()?.uid, 128) || null,
      message: reason,
      severity: "info",
      meta: { requestId: data.id, actorUid }
    });

    return { ok: true };
  }
);
