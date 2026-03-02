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

type BalanceReq = Record<string, never>;
type DebitReq = { amount: number; game?: string; roundId?: string; note?: string };
type CreditReq = { amount: number; game?: string; roundId?: string; note?: string };
type TransferReq = {
  amount: number;
  note?: string;
  source?: string;
  destination?: string;
  idempotencyKey?: string;
};

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = optionalString(value, 160);
    if (cleaned) return cleaned;
  }
  return "";
}

export const vvGetBalanceCallable = functions.https.onCall(
  async (_data: BalanceReq, context) => {
    const uid = requireAuthed(context);
    const userRef = await ensureUserDoc(uid);
    const walletStateRef = await ensureWalletState(uid);
    const [snap, walletStateSnap] = await Promise.all([userRef.get(), walletStateRef.get()]);
    const walletState = readWalletState(
      walletStateSnap.data() as Record<string, unknown> | undefined
    );
    return {
      ok: true,
      cashCents: Number(snap.data()?.balance ?? 0),
      balance: Number(snap.data()?.balance ?? 0),
      locked: Number(snap.data()?.locked ?? 0),
      bonusCents: walletState.bonusCents,
      rolloverTargetCents: walletState.rolloverTargetCents,
      rolloverProgressCents: walletState.rolloverProgressCents,
      bonusWithdrawalCapCents: hasBonusRestriction(walletState)
        ? withdrawalCapForState(walletState)
        : 0
    };
  }
);

export const vvDebit = functions.https.onCall(async (data: DebitReq, context) => {
  const uid = requireAuthed(context);
  assertInt("amount", data?.amount, { min: 1 });

  const amount = data.amount;
  const game = optionalString(data?.game, 40) || "unknown";
  const roundId = optionalString(data?.roundId, 120);
  const note = firstText(data?.note, data?.game);

  const db = getFirestore();
  const userRef = await ensureUserDoc(uid);
  const walletStateRef = await ensureWalletState(uid);
  const ledgerRef = userRef.collection("ledger").doc();
  const lockRef = roundId ? db.doc(`debitLocks/${uid}_${roundId}`) : null;

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const walletStateSnap = await tx.get(walletStateRef);
    const user = userSnap.data() || {};
    const walletState = readWalletState(
      walletStateSnap.data() as Record<string, unknown> | undefined
    );
    const balance = Number(user.balance ?? 0);

    if (balance < amount) {
      throw new functions.https.HttpsError("failed-precondition", "Insufficient funds");
    }

    if (lockRef) {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return {
          ok: true,
          balance,
          existing: true
        };
      }
      tx.set(lockRef, { uid, roundId, amount, game, createdAt: FieldValue.serverTimestamp() });
    }

    const nextBalance = balance - amount;
    tx.update(userRef, {
      balance: nextBalance,
      updatedAt: FieldValue.serverTimestamp()
    });
    const rolloverProgressCents = nextRolloverProgress(walletState, amount);
    const nextWalletState = {
      ...walletState,
      rolloverProgressCents
    };
    const bonusRestricted = hasBonusRestriction(nextWalletState);
    tx.set(
      walletStateRef,
      {
        cashCents: nextBalance,
        rolloverProgressCents,
        bonusLockActive: bonusRestricted,
        bonusWithdrawalCapCents: bonusRestricted ? withdrawalCapForState(nextWalletState) : 0,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.create(
      ledgerRef,
      buildLedgerEntry({
        uid,
        type: "bet",
        amountCents: -amount,
        note,
        game,
        roundId,
        balanceAfter: nextBalance,
        actorUid: uid,
        status: "approved"
      })
    );

    return {
      ok: true,
      balance: nextBalance
    };
  });
});

export const vvCredit = functions.https.onCall(async (data: CreditReq, context) => {
  const uid = requireAuthed(context);
  assertInt("amount", data?.amount, { min: 1 });
  assertString("roundId", data?.roundId);

  const amount = data.amount;
  const game = optionalString(data?.game, 40) || "unknown";
  const roundId = optionalString(data?.roundId, 120);
  const note = firstText(data?.note, data?.game);

  const db = getFirestore();
  const userRef = await ensureUserDoc(uid);
  const walletStateRef = await ensureWalletState(uid);
  const ledgerRef = userRef.collection("ledger").doc();
  const lockRef = db.doc(`payoutLocks/${uid}_${roundId}`);

  return db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    const userSnap = await tx.get(userRef);
    const walletStateSnap = await tx.get(walletStateRef);
    const user = userSnap.data() || {};
    const walletState = readWalletState(
      walletStateSnap.data() as Record<string, unknown> | undefined
    );
    const balance = Number(user.balance ?? 0);

    if (lockSnap.exists) {
      return {
        ok: true,
        alreadyPaid: true,
        balance
      };
    }

    const nextBalance = balance + amount;
    tx.set(lockRef, {
      uid,
      roundId,
      amount,
      game,
      createdAt: FieldValue.serverTimestamp()
    });
    tx.update(userRef, {
      balance: nextBalance,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(
      walletStateRef,
      {
        cashCents: nextBalance,
        bonusLockActive: hasBonusRestriction(walletState),
        bonusWithdrawalCapCents: hasBonusRestriction(walletState)
          ? withdrawalCapForState(walletState)
          : 0,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    tx.create(
      ledgerRef,
      buildLedgerEntry({
        uid,
        type: "win",
        amountCents: amount,
        note,
        game,
        roundId,
        balanceAfter: nextBalance,
        actorUid: uid,
        status: "approved"
      })
    );

    return {
      ok: true,
      alreadyPaid: false,
      balance: nextBalance
    };
  });
});

export const vvDeposit = functions.https.onCall(async (data: TransferReq, context) => {
  const uid = requireAuthed(context);
  assertInt("amount", data?.amount, { min: 1 });

  const amount = data.amount;
  const note = firstText(data?.note, data?.source, data?.destination);
  const idempotencyKey = optionalString(data?.idempotencyKey, 120);

  const db = getFirestore();
  const userRef = await ensureUserDoc(uid);
  const walletStateRef = await ensureWalletState(uid);
  const ledgerRef = userRef.collection("ledger").doc();
  const lockRef = idempotencyKey ? db.doc(`depositLocks/${uid}_${idempotencyKey}`) : null;

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const walletStateSnap = await tx.get(walletStateRef);
    const user = userSnap.data() || {};
    const walletState = readWalletState(
      walletStateSnap.data() as Record<string, unknown> | undefined
    );
    const balance = Number(user.balance ?? 0);

    if (lockRef) {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return { ok: true, existing: true, balance };
      }
      tx.set(lockRef, { uid, idempotencyKey, amount, createdAt: FieldValue.serverTimestamp() });
    }

    const nextBalance = balance + amount;
    tx.update(userRef, {
      balance: nextBalance,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(
      walletStateRef,
      {
        cashCents: nextBalance,
        bonusLockActive: hasBonusRestriction(walletState),
        bonusWithdrawalCapCents: hasBonusRestriction(walletState)
          ? withdrawalCapForState(walletState)
          : 0,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    tx.create(
      ledgerRef,
      buildLedgerEntry({
        uid,
        type: "deposit",
        amountCents: amount,
        note,
        balanceAfter: nextBalance,
        actorUid: uid,
        status: "approved",
        meta: {
          source: optionalString(data?.source, 120),
          destination: optionalString(data?.destination, 120)
        }
      })
    );

    return { ok: true, balance: nextBalance };
  });
});

export const vvWithdraw = functions.https.onCall(async (data: TransferReq, context) => {
  const uid = requireAuthed(context);
  assertInt("amount", data?.amount, { min: 1 });

  const amount = data.amount;
  const note = firstText(data?.note, data?.destination, data?.source);
  const idempotencyKey = optionalString(data?.idempotencyKey, 120);

  const db = getFirestore();
  const userRef = await ensureUserDoc(uid);
  const walletStateRef = await ensureWalletState(uid);
  const ledgerRef = userRef.collection("ledger").doc();
  const lockRef = idempotencyKey ? db.doc(`withdrawLocks/${uid}_${idempotencyKey}`) : null;

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const walletStateSnap = await tx.get(walletStateRef);
    const user = userSnap.data() || {};
    const walletState = readWalletState(
      walletStateSnap.data() as Record<string, unknown> | undefined
    );
    const balance = Number(user.balance ?? 0);
    const capCents = withdrawalCapForState(walletState);

    if (balance < amount) {
      throw new functions.https.HttpsError("failed-precondition", "Insufficient funds");
    }
    if (amount > capCents) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Withdrawal cap is ${capCents}`
      );
    }

    if (lockRef) {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return { ok: true, existing: true, balance };
      }
      tx.set(lockRef, { uid, idempotencyKey, amount, createdAt: FieldValue.serverTimestamp() });
    }

    const nextBalance = balance - amount;
    tx.update(userRef, {
      balance: nextBalance,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(
      walletStateRef,
      {
        cashCents: nextBalance,
        bonusLockActive: hasBonusRestriction(walletState),
        bonusWithdrawalCapCents: hasBonusRestriction(walletState)
          ? withdrawalCapForState(walletState)
          : 0,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    tx.create(
      ledgerRef,
      buildLedgerEntry({
        uid,
        type: "withdrawal_paid",
        amountCents: -amount,
        note,
        balanceAfter: nextBalance,
        actorUid: uid,
        status: "approved",
        meta: {
          source: optionalString(data?.source, 120),
          destination: optionalString(data?.destination, 120)
        }
      })
    );

    return { ok: true, balance: nextBalance };
  });
});
