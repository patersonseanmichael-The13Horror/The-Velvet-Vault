import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { assertInt, assertString, requireAuthed } from "./utils";
import { ensureUserDoc, optionalString } from "./walletStore";
import {
  buildLedgerEntry,
  ensureWalletState,
  hasBonusRestriction,
  nextRolloverProgress,
  readWalletState,
  withdrawalCapForState
} from "./walletState";
import {
  getSpinSessionRef,
  queueSpinSessionReserve,
  queueSpinSessionResolve,
  readSpinSessionMeta,
  writeSystemLog
} from "./monitoring";

type ReserveReq = { roundId: string; amount: number; meta?: unknown };
type SettleReq = { roundId: string; payout: number; meta?: unknown };
type CancelReq = { roundId: string; reason?: string };

function toMillis(value: unknown): number {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const vvReserveBet = functions.https.onCall(async (data: ReserveReq, context) => {
  const uid = requireAuthed(context);
  assertString("roundId", data?.roundId);
  assertInt("amount", data?.amount, { min: 0, allowZero: true });

  const db = getFirestore();
  const userRef = await ensureUserDoc(uid);
  const walletStateRef = await ensureWalletState(uid);
  const roundRef = userRef.collection("rounds").doc(data.roundId);
  const ledgerCol = userRef.collection("ledger");

  try {
    return await db.runTransaction(
      async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new functions.https.HttpsError("not-found", "user not found");
        }
        const user = userSnap.data() as Record<string, unknown>;
        const walletStateSnap = await tx.get(walletStateRef);
        const walletState = readWalletState(
          walletStateSnap.data() as Record<string, unknown> | undefined
        );

        if (user.frozen) {
          throw new functions.https.HttpsError("failed-precondition", "Account frozen");
        }

        const roundSnap = await tx.get(roundRef);
        if (roundSnap.exists) {
          const round = roundSnap.data() as Record<string, unknown>;
          return {
            ok: true,
            status: round.status ?? "reserved",
            existing: true,
            amount: round.amount ?? 0
          };
        }

        const balance = Number(user.balance ?? 0);
        const locked = Number(user.locked ?? 0);
        if (balance < data.amount) {
          throw new functions.https.HttpsError("failed-precondition", "insufficient funds");
        }
        const lastSpinAt = toMillis(user.lastSpinAt);
        if (lastSpinAt && Date.now() - lastSpinAt < 500) {
          throw new functions.https.HttpsError("resource-exhausted", "Too many spins");
        }

        tx.update(userRef, {
          balance: balance - data.amount,
          locked: locked + data.amount,
          lastSpinAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        const rolloverProgressCents = nextRolloverProgress(walletState, data.amount);
        const nextWalletState = {
          ...walletState,
          rolloverProgressCents
        };
        const bonusRestricted = hasBonusRestriction(nextWalletState);
        tx.set(
          walletStateRef,
          {
            cashCents: balance - data.amount,
            rolloverProgressCents,
            bonusLockActive: bonusRestricted,
            bonusWithdrawalCapCents: bonusRestricted ? withdrawalCapForState(nextWalletState) : 0,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        tx.set(roundRef, {
          amount: data.amount,
          status: "reserved",
          meta: data.meta ?? null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        const spinSession = readSpinSessionMeta(data.meta);
        const meta =
          data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
            ? (data.meta as Record<string, unknown>)
            : null;
        if (spinSession) {
          queueSpinSessionReserve(tx, {
            spinSessionId: spinSession.spinSessionId,
            uid,
            roundId: data.roundId,
            betCents: data.amount,
            machineId: spinSession.machineId || optionalString(meta?.machineId, 80) || undefined
          });
        }

        tx.create(ledgerCol.doc(), {
          ...buildLedgerEntry({
            uid,
            type: "bet",
            amountCents: -data.amount,
            status: "accepted",
            roundId: data.roundId,
            meta: data.meta as Record<string, unknown> | null,
            balanceAfter: balance - data.amount,
            lockedAfter: locked + data.amount,
            actorUid: uid
          })
        });

        return {
          ok: true,
          status: "reserved",
          balance: balance - data.amount,
          locked: locked + data.amount
        };
      },
      { maxAttempts: 3 }
    );
  } catch (error) {
    if (error instanceof functions.https.HttpsError && error.code === "resource-exhausted") {
      await writeSystemLog({
        type: "spin_rate_block",
        uid,
        message: error.message,
        severity: "warn",
        meta: {
          roundId: data.roundId,
          amountCents: data.amount
        }
      });
    }
    throw error;
  }
});

export const vvSettleBet = functions.https.onCall(async (data: SettleReq, context) => {
  const uid = requireAuthed(context);
  assertString("roundId", data?.roundId);
  assertInt("payout", data?.payout, { min: 0, allowZero: true });

  const db = getFirestore();
  const userRef = await ensureUserDoc(uid);
  const walletStateRef = await ensureWalletState(uid);
  const roundRef = userRef.collection("rounds").doc(data.roundId);
  const ledgerCol = userRef.collection("ledger");
  const spinSession = readSpinSessionMeta(data.meta);
  const spinSessionRef = spinSession ? getSpinSessionRef(spinSession.spinSessionId) : null;

  try {
    return await db.runTransaction(
      async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError("not-found", "user not found");
      }
      const user = userSnap.data() as Record<string, unknown>;

      const balance = Number(user.balance ?? 0);
      const locked = Number(user.locked ?? 0);
      const walletStateSnap = await tx.get(walletStateRef);
      const walletState = readWalletState(
        walletStateSnap.data() as Record<string, unknown> | undefined
      );
      const spinSessionSnap = spinSessionRef ? await tx.get(spinSessionRef) : null;

      const roundSnap = await tx.get(roundRef);
      if (!roundSnap.exists) {
        throw new functions.https.HttpsError("failed-precondition", "round not reserved");
      }

      const round = roundSnap.data() as Record<string, unknown>;
      if (round.status === "settled") {
        return { ok: true, status: "settled", existing: true, balance, locked };
      }
      if (round.status !== "reserved") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `round status ${String(round.status)}`
        );
      }
      if (spinSession && spinSessionSnap?.exists) {
        const session = spinSessionSnap.data() as Record<string, unknown>;
        if (String(session.status || "") === "settled") {
          throw new functions.https.HttpsError(
            "already-exists",
            "spinSessionId already processed"
          );
        }
      }

      const amount = Number(round.amount ?? 0);
      if (locked < amount) {
        throw new functions.https.HttpsError("failed-precondition", "locked underflow");
      }

      tx.update(userRef, {
        locked: locked - amount,
        balance: balance + data.payout,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.update(roundRef, {
        status: "settled",
        payout: data.payout,
        meta: data.meta ?? round.meta ?? null,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.set(
        walletStateRef,
        {
          cashCents: balance + data.payout,
          bonusLockActive: hasBonusRestriction(walletState),
          bonusWithdrawalCapCents: hasBonusRestriction(walletState)
            ? withdrawalCapForState(walletState)
            : 0,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      if (data.payout > 0) {
        tx.create(
          ledgerCol.doc(),
          buildLedgerEntry({
            uid,
            type: "win",
            amountCents: data.payout,
            status: "approved",
            roundId: data.roundId,
            meta: data.meta as Record<string, unknown> | null,
            actorUid: uid,
            balanceAfter: balance + data.payout,
            lockedAfter: locked - amount
          })
        );
      }

      if (spinSession) {
        queueSpinSessionResolve(tx, {
          spinSessionId: spinSession.spinSessionId,
          uid,
          roundId: data.roundId,
          winCents: data.payout,
          status: "settled",
          resultHash: spinSession.resultHash
        });
      }

      return {
        ok: true,
        status: "settled",
        balance: balance + data.payout,
        locked: locked - amount
      };
      },
      { maxAttempts: 3 }
    );
  } catch (error) {
    if (error instanceof functions.https.HttpsError && error.code === "already-exists") {
      await writeSystemLog({
        type: "spin_session_duplicate_attempt",
        uid,
        message: error.message,
        severity: "warn",
        meta: {
          roundId: data.roundId,
          spinSessionId: spinSession?.spinSessionId || null
        }
      });
    }
    throw error;
  }
});

export const vvCancelBet = functions.https.onCall(async (data: CancelReq, context) => {
  const uid = requireAuthed(context);
  assertString("roundId", data?.roundId);

  const db = getFirestore();
  const userRef = await ensureUserDoc(uid);
  const walletStateRef = await ensureWalletState(uid);
  const roundRef = userRef.collection("rounds").doc(data.roundId);
  const ledgerCol = userRef.collection("ledger");

  return db.runTransaction(
    async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        return { ok: true, status: "noop", balance: 0, locked: 0 };
      }
      const user = userSnap.data() as Record<string, unknown>;
      const walletStateSnap = await tx.get(walletStateRef);
      const walletState = readWalletState(
        walletStateSnap.data() as Record<string, unknown> | undefined
      );

      const balance = Number(user.balance ?? 0);
      const locked = Number(user.locked ?? 0);

      const roundSnap = await tx.get(roundRef);
      if (!roundSnap.exists) {
        return { ok: true, status: "noop", balance, locked };
      }

      const round = roundSnap.data() as Record<string, unknown>;
      if (round.status === "cancelled") {
        return { ok: true, status: "cancelled", existing: true, balance, locked };
      }
      if (round.status === "settled") {
        return { ok: true, status: "settled", existing: true, balance, locked };
      }
      if (round.status !== "reserved") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `round status ${String(round.status)}`
        );
      }

      const amount = Number(round.amount ?? 0);
      if (locked < amount) {
        throw new functions.https.HttpsError("failed-precondition", "locked underflow");
      }

      tx.update(userRef, {
        locked: locked - amount,
        balance: balance + amount,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.update(roundRef, {
        status: "cancelled",
        cancelReason: data.reason ?? null,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.set(
        walletStateRef,
        {
          cashCents: balance + amount,
          bonusLockActive: hasBonusRestriction(walletState),
          bonusWithdrawalCapCents: hasBonusRestriction(walletState)
            ? withdrawalCapForState(walletState)
            : 0,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      tx.create(
        ledgerCol.doc(),
        buildLedgerEntry({
          uid,
          type: "cancel",
          amountCents: 0,
          status: "cancelled",
          roundId: data.roundId,
          reason: data.reason ?? null,
          meta: {
            refundCents: amount
          },
          actorUid: uid,
          balanceAfter: balance + amount,
          lockedAfter: locked - amount
        })
      );

      const spinSession = readSpinSessionMeta(round.meta);
      if (spinSession) {
        queueSpinSessionResolve(tx, {
          spinSessionId: spinSession.spinSessionId,
          uid,
          roundId: data.roundId,
          winCents: 0,
          status: "cancelled",
          reason: data.reason ?? null
        });
      }

      return {
        ok: true,
        status: "cancelled",
        balance: balance + amount,
        locked: locked - amount
      };
    },
    { maxAttempts: 3 }
  );
});
