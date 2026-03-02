import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { assertInt, assertString, requireAdmin, requireAuthed } from "./utils";
import { ensureUserDoc, getUserRef, optionalString } from "./walletStore";
import {
  ALLOWED_DEPOSIT_AMOUNTS,
  BONUS_ROLLOVER_MULTIPLIER,
  REBATE_ROLLOVER_MULTIPLIER,
  BONUS_WITHDRAWAL_CAP_CENTS,
  buildLedgerEntry,
  depositMatchPercent,
  ensureWalletState,
  getDepositRequestRef,
  getWithdrawalRequestRef,
  hasBonusRestriction,
  hiddenTreasureMultiplier,
  readWalletState,
  walletWindowForRebate,
  withdrawalCapForState
} from "./walletState";

type DepositRequestReq = {
  amountCents: number;
  proofImageUrl: string;
  proofStoragePath?: string;
};

type WithdrawalDetails = {
  accountName?: string;
  accountNameConfirm?: string;
  payoutDestination?: string;
  payoutDestinationConfirm?: string;
  method?: string;
};

type WithdrawalRequestReq = {
  amountCents: number;
  payoutDetails?: WithdrawalDetails;
};

type ApproveRequestReq = {
  id: string;
};

function normalizeSignedCents(value: number): number {
  return value >= 0 ? Math.floor(value) : -Math.floor(Math.abs(value));
}

function sanitizePayoutDetails(input: WithdrawalDetails | undefined) {
  const accountName = optionalString(input?.accountName, 160);
  const accountNameConfirm = optionalString(input?.accountNameConfirm, 160);
  const payoutDestination = optionalString(input?.payoutDestination, 220);
  const payoutDestinationConfirm = optionalString(input?.payoutDestinationConfirm, 220);
  const method = optionalString(input?.method, 60) || "payid";

  return {
    accountName,
    accountNameConfirm,
    payoutDestination,
    payoutDestinationConfirm,
    method
  };
}

function assertAllowedDepositAmount(amountCents: number) {
  if (!ALLOWED_DEPOSIT_AMOUNTS.includes(amountCents)) {
    throw new functions.https.HttpsError("invalid-argument", "Amount not allowed");
  }
}

function assertValidProofUrl(value: string, uid: string) {
  const proof = optionalString(value, 1500);
  if (!proof) {
    throw new functions.https.HttpsError("invalid-argument", "proofImageUrl required");
  }
  if (!/^https?:\/\//i.test(proof) && !proof.startsWith(`uploads/${uid}/`)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid proofImageUrl");
  }
  return proof;
}

function calculateDepositBonus(amountCents: number, approvedDepositCount: number) {
  if (amountCents > 15_000) {
    const multiplier = hiddenTreasureMultiplier();
    return {
      bonusCents: Math.floor(amountCents * multiplier),
      rolloverMultiplier: BONUS_ROLLOVER_MULTIPLIER,
      label: "hidden_treasure",
      multiplier
    };
  }

  const matchPercent = depositMatchPercent(approvedDepositCount);
  if (matchPercent <= 0) {
    return {
      bonusCents: 0,
      rolloverMultiplier: BONUS_ROLLOVER_MULTIPLIER,
      label: "",
      multiplier: 0
    };
  }

  return {
    bonusCents: Math.floor(amountCents * matchPercent),
    rolloverMultiplier: BONUS_ROLLOVER_MULTIPLIER,
    label: `deposit_match_${approvedDepositCount + 1}`,
    multiplier: matchPercent
  };
}

export const vvCreateDepositRequest = functions.https.onCall(
  async (data: DepositRequestReq, context) => {
    const uid = requireAuthed(context);
    assertInt("amountCents", data?.amountCents, { min: 1 });
    assertAllowedDepositAmount(data.amountCents);

    const db = getFirestore();
    const userRef = await ensureUserDoc(uid);
    const requestRef = db.collection("depositRequests").doc();
    const ledgerRef = userRef.collection("ledger").doc();
    const proofImageUrl = assertValidProofUrl(data?.proofImageUrl || "", uid);
    const proofStoragePath = optionalString(data?.proofStoragePath, 300);

    await db.runTransaction(async (tx) => {
      tx.set(requestRef, {
        uid,
        amountCents: data.amountCents,
        proofImageUrl,
        proofStoragePath: proofStoragePath || null,
        status: "pending",
        ledgerEntryId: ledgerRef.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.create(
        ledgerRef,
        buildLedgerEntry({
          uid,
          type: "deposit",
          amountCents: data.amountCents,
          status: "pending",
          meta: {
            proofImageUrl,
            proofStoragePath: proofStoragePath || null,
            requestId: requestRef.id
          }
        })
      );
    });

    return { ok: true, id: requestRef.id };
  }
);

export const vvCreateWithdrawalRequest = functions.https.onCall(
  async (data: WithdrawalRequestReq, context) => {
    const uid = requireAuthed(context);
    assertInt("amountCents", data?.amountCents, { min: 1 });

    const payoutDetails = sanitizePayoutDetails(data?.payoutDetails);
    if (
      !payoutDetails.accountName ||
      !payoutDetails.payoutDestination ||
      payoutDetails.accountName !== payoutDetails.accountNameConfirm ||
      payoutDetails.payoutDestination !== payoutDetails.payoutDestinationConfirm
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Payout detail confirmation fields must match"
      );
    }

    const db = getFirestore();
    const userRef = await ensureUserDoc(uid);
    const walletStateRef = await ensureWalletState(uid);
    const requestRef = db.collection("withdrawalRequests").doc();
    const ledgerRef = userRef.collection("ledger").doc();

    return db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const walletStateSnap = await tx.get(walletStateRef);
      const user = userSnap.data() || {};
      const state = readWalletState(walletStateSnap.data() as Record<string, unknown> | undefined);

      const balance = Number(user.balance ?? 0);
      const capCents = withdrawalCapForState(state);

      if (data.amountCents > capCents) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Withdrawal cap is ${capCents}`
        );
      }
      if (balance < data.amountCents) {
        throw new functions.https.HttpsError("failed-precondition", "Insufficient cash balance");
      }

      tx.set(requestRef, {
        uid,
        amountCents: data.amountCents,
        payoutDetails: {
          accountName: payoutDetails.accountName,
          payoutDestination: payoutDetails.payoutDestination,
          method: payoutDetails.method
        },
        status: "pending",
        withdrawalCapCents: capCents,
        bonusRestricted: hasBonusRestriction(state),
        ledgerEntryId: ledgerRef.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.create(
        ledgerRef,
        buildLedgerEntry({
          uid,
          type: "withdrawal_request",
          amountCents: normalizeSignedCents(-data.amountCents),
          status: "pending",
          meta: {
            requestId: requestRef.id,
            payoutMethod: payoutDetails.method
          }
        })
      );

      return {
        ok: true,
        id: requestRef.id,
        capCents
      };
    });
  }
);

export const adminApproveDepositRequest = functions.https.onCall(
  async (data: ApproveRequestReq, context) => {
    const actorUid = requireAdmin(context);
    assertString("id", data?.id);

    const db = getFirestore();
    const requestRef = getDepositRequestRef(data.id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      throw new functions.https.HttpsError("not-found", "deposit request not found");
    }
    const request = requestSnap.data() as Record<string, unknown>;
    const uid = optionalString(request.uid, 128);
    if (!uid) {
      throw new functions.https.HttpsError("failed-precondition", "request missing uid");
    }

    const userRef = await ensureUserDoc(uid);
    const walletStateRef = await ensureWalletState(uid);

    return db.runTransaction(async (tx) => {
      const freshRequestSnap = await tx.get(requestRef);
      const freshRequest = freshRequestSnap.data() as Record<string, unknown> | undefined;
      if (!freshRequestSnap.exists || freshRequest?.status !== "pending") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "deposit request already processed"
        );
      }

      const userSnap = await tx.get(userRef);
      const walletStateSnap = await tx.get(walletStateRef);
      const user = userSnap.data() || {};
      const walletState = readWalletState(
        walletStateSnap.data() as Record<string, unknown> | undefined
      );

      const amountCents = Number(freshRequest.amountCents ?? 0);
      assertAllowedDepositAmount(amountCents);

      const balance = Number(user.balance ?? 0);
      const nextBalance = balance + amountCents;
      const bonus = calculateDepositBonus(amountCents, walletState.approvedDepositCount);
      const nextBonus = walletState.bonusCents + bonus.bonusCents;
      const nextTarget =
        walletState.rolloverTargetCents + bonus.bonusCents * bonus.rolloverMultiplier;
      const ledgerEntryId = optionalString(freshRequest.ledgerEntryId, 160);

      tx.update(userRef, {
        balance: nextBalance,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.set(
        walletStateRef,
        {
          bonusCents: nextBonus,
          rolloverTargetCents: nextTarget,
          rolloverProgressCents: walletState.rolloverProgressCents,
          bonusWithdrawalCapCents:
            nextBonus > 0 || nextTarget > walletState.rolloverProgressCents
              ? BONUS_WITHDRAWAL_CAP_CENTS
              : walletState.bonusWithdrawalCapCents,
          approvedDepositCount: walletState.approvedDepositCount + 1,
          bonusLockActive:
            nextBonus > 0 || nextTarget > walletState.rolloverProgressCents,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      tx.update(requestRef, {
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: actorUid,
        bonusCents: bonus.bonusCents,
        bonusLabel: bonus.label || null,
        bonusMultiplier: bonus.multiplier || null,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (ledgerEntryId) {
        tx.set(
          userRef.collection("ledger").doc(ledgerEntryId),
          {
            status: "approved",
            balanceAfter: nextBalance,
            meta: {
              requestId: freshRequestSnap.id,
              proofImageUrl: freshRequest.proofImageUrl ?? null,
              proofStoragePath: freshRequest.proofStoragePath ?? null
            },
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      if (bonus.bonusCents > 0) {
        tx.create(
          userRef.collection("ledger").doc(),
          buildLedgerEntry({
            uid,
            type: "bonus_credit",
            amountCents: bonus.bonusCents,
            status: "approved",
            meta: {
              requestId: freshRequestSnap.id,
              label: bonus.label,
              multiplier: bonus.multiplier,
              rolloverMultiplier: bonus.rolloverMultiplier
            }
          })
        );
      }

      return {
        ok: true,
        balance: nextBalance,
        bonusCents: bonus.bonusCents
      };
    });
  }
);

export const adminApproveWithdrawalRequest = functions.https.onCall(
  async (data: ApproveRequestReq, context) => {
    const actorUid = requireAdmin(context);
    assertString("id", data?.id);

    const db = getFirestore();
    const requestRef = getWithdrawalRequestRef(data.id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      throw new functions.https.HttpsError("not-found", "withdrawal request not found");
    }

    const request = requestSnap.data() as Record<string, unknown>;
    const uid = optionalString(request.uid, 128);
    if (!uid) {
      throw new functions.https.HttpsError("failed-precondition", "request missing uid");
    }

    const userRef = await ensureUserDoc(uid);
    const walletStateRef = await ensureWalletState(uid);

    return db.runTransaction(async (tx) => {
      const freshRequestSnap = await tx.get(requestRef);
      const freshRequest = freshRequestSnap.data() as Record<string, unknown> | undefined;
      if (!freshRequestSnap.exists || freshRequest?.status !== "pending") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "withdrawal request already processed"
        );
      }

      const userSnap = await tx.get(userRef);
      const walletStateSnap = await tx.get(walletStateRef);
      const user = userSnap.data() || {};
      const walletState = readWalletState(
        walletStateSnap.data() as Record<string, unknown> | undefined
      );

      const amountCents = Number(freshRequest.amountCents ?? 0);
      const balance = Number(user.balance ?? 0);
      const capCents = withdrawalCapForState(walletState);

      if (amountCents > capCents) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Withdrawal cap is ${capCents}`
        );
      }
      if (balance < amountCents) {
        throw new functions.https.HttpsError("failed-precondition", "Insufficient cash balance");
      }

      const nextBalance = balance - amountCents;
      const ledgerEntryId = optionalString(freshRequest.ledgerEntryId, 160);

      tx.update(userRef, {
        balance: nextBalance,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.update(requestRef, {
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: actorUid,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (ledgerEntryId) {
        tx.set(
          userRef.collection("ledger").doc(ledgerEntryId),
          {
            status: "approved",
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      tx.create(
        userRef.collection("ledger").doc(),
        buildLedgerEntry({
          uid,
          type: "withdrawal_paid",
          amountCents: normalizeSignedCents(-amountCents),
          status: "approved",
          balanceAfter: nextBalance,
          meta: {
            requestId: freshRequestSnap.id,
            payoutMethod:
              (freshRequest.payoutDetails as { method?: string } | undefined)?.method || "payid"
          },
          actorUid
        })
      );

      return {
        ok: true,
        balance: nextBalance
      };
    });
  }
);

export const vvApplyDailyRebate = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("Australia/Brisbane")
  .onRun(async () => {
    const db = getFirestore();
    const { start, end } = walletWindowForRebate(new Date());
    const snap = await db
      .collectionGroup("ledger")
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .get();

    const aggregates = new Map<string, { bets: number; wins: number }>();
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const uid = optionalString(data.uid, 128);
      if (!uid) continue;

      const type = optionalString(data.type, 80);
      const amountCents = Number(data.amountCents ?? 0);
      if (type !== "bet" && type !== "win") continue;

      const current = aggregates.get(uid) || { bets: 0, wins: 0 };
      if (type === "bet") {
        current.bets += Math.abs(amountCents);
      } else {
        current.wins += Math.max(0, amountCents);
      }
      aggregates.set(uid, current);
    }

    for (const [uid, stats] of aggregates.entries()) {
      const netLossCents = stats.bets - stats.wins;
      if (netLossCents <= 0) continue;

      const rebateCents = Math.floor(netLossCents * 0.04);
      if (rebateCents <= 0) continue;

      await ensureUserDoc(uid);
      const walletStateRef = await ensureWalletState(uid);

      await db.runTransaction(async (tx) => {
        const walletStateSnap = await tx.get(walletStateRef);
        const walletState = readWalletState(
          walletStateSnap.data() as Record<string, unknown> | undefined
        );

        const nextBonus = walletState.bonusCents + rebateCents;
        const nextTarget =
          walletState.rolloverTargetCents + rebateCents * REBATE_ROLLOVER_MULTIPLIER;

        tx.set(
          walletStateRef,
          {
            bonusCents: nextBonus,
            rolloverTargetCents: nextTarget,
            bonusWithdrawalCapCents: BONUS_WITHDRAWAL_CAP_CENTS,
            bonusLockActive: true,
            lastRebateAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        tx.create(
          getUserRef(uid).collection("ledger").doc(),
          buildLedgerEntry({
            uid,
            type: "rebate_credit",
            amountCents: rebateCents,
            status: "approved",
            meta: {
              windowStart: start.toISOString(),
              windowEnd: end.toISOString(),
              netLossCents,
              rate: 0.04,
              rolloverMultiplier: REBATE_ROLLOVER_MULTIPLIER
            }
          })
        );
      });
    }

    return null;
  });
