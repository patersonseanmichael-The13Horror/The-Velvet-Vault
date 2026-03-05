/**
 * functions/src/promotions.ts
 *
 * Promotion claim callables.
 * SAFE ADD: only adds/adjusts bonus fields, rollover target/progress, and
 * eligibility checks. Does NOT touch cashCents reserve/settle/cancel logic
 * or RNG/payout logic.
 */
import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { requireAuthed } from "./utils";
import {
  BONUS_ROLLOVER_MULTIPLIER,
  BONUS_WITHDRAWAL_CAP_CENTS,
  buildLedgerEntry,
  depositMatchPercent,
  readWalletState
} from "./walletState";
import { writeSystemLog } from "./monitoring";

// ── Constants ────────────────────────────────────────────────
const SIGNUP_BONUS_CENTS = 3_800; // $38.00
const SIGNUP_BONUS_ROLLOVER = 22; // x22 on bonus + wins

// ── Promo doc helpers ─────────────────────────────────────────
function getPromoRef(uid: string, promoId: string) {
  return getFirestore().doc(`users/${uid}/wallet/promos/${promoId}`);
}

// ── vvClaimSignupBonus ────────────────────────────────────────
/**
 * Claims the one-time $38 signup bonus.
 *
 * Requirements:
 *  - User must have at least one approved deposit request (approvedDepositCount >= 1)
 *    OR have deposited $5+ (amountCents >= 500 in an approved deposit)
 *  - One-time only (promos/signup doc must not exist)
 *
 * Writes:
 *  - users/{uid}/wallet/promos/signup  — claim record
 *  - users/{uid}/wallet/state          — bonusCents += 3800, rolloverTarget += 3800 * 22
 *  - users/{uid}/wallet/ledger/{id}    — bonus_credit entry
 */
export const vvClaimSignupBonus = functions.https.onCall(
  async (_data: unknown, context) => {
    const uid = requireAuthed(context);
    const db = getFirestore();
    const promoRef = getPromoRef(uid, "signup");
    const walletStateRef = db.doc(`users/${uid}/wallet/state`);
    const ledgerRef = db.collection(`users/${uid}/wallet/ledger`);

    await db.runTransaction(async (tx) => {
      // Check promo already claimed
      const promoSnap = await tx.get(promoRef);
      if (promoSnap.exists) {
        throw new functions.https.HttpsError(
          "already-exists",
          "Signup bonus already claimed."
        );
      }

      // Ensure wallet state exists
      const stateSnap = await tx.get(walletStateRef);
      const state = readWalletState(stateSnap.exists ? (stateSnap.data() ?? {}) : {});

      // Require at least one approved deposit
      if ((state.approvedDepositCount ?? 0) < 1) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "A deposit must be approved before claiming the signup bonus."
        );
      }

      const now = FieldValue.serverTimestamp();
      const newBonus = state.bonusCents + SIGNUP_BONUS_CENTS;
      const addedRollover = SIGNUP_BONUS_CENTS * SIGNUP_BONUS_ROLLOVER;
      const newRolloverTarget = state.rolloverTargetCents + addedRollover;

      // Write promo claim record
      tx.set(promoRef, {
        uid,
        tier: "signup",
        amountCents: SIGNUP_BONUS_CENTS,
        createdAt: now
      });

      // Update wallet state (bonus only, no cashCents change)
      tx.set(
        walletStateRef,
        {
          bonusCents: newBonus,
          rolloverTargetCents: newRolloverTarget,
          bonusWithdrawalCapCents: BONUS_WITHDRAWAL_CAP_CENTS,
          bonusLockActive: true,
          updatedAt: now
        },
        { merge: true }
      );

      // Ledger entry
      const entry = buildLedgerEntry({
        uid,
        type: "bonus_credit",
        amountCents: SIGNUP_BONUS_CENTS,
        balanceAfter: state.cashCents,
        meta: {
          label: "signup_bonus",
          bonusAfter: newBonus,
          rolloverAdded: addedRollover
        }
      });
      tx.set(ledgerRef.doc(), entry);
    });

    await writeSystemLog({
      type: "promo_claim",
      uid,
      message: `Signup bonus claimed: ${SIGNUP_BONUS_CENTS} cents`,
      severity: "info"
    });

    return { ok: true, amountCents: SIGNUP_BONUS_CENTS };
  }
);

// ── vvClaimDepositBonus ───────────────────────────────────────
/**
 * Claims the deposit match bonus for the current deposit tier.
 * Tiers: 1st deposit = 100%, 2nd = 75%, 3rd = 50%
 *
 * Inputs: { tier: 1 | 2 | 3 }
 *
 * Requirements:
 *  - approvedDepositCount must be >= tier
 *  - promos/deposit_N must not exist
 *
 * The bonus amount is calculated from the most recent approved deposit amount
 * stored in wallet state (lastApprovedDepositCents).
 */
export const vvClaimDepositBonus = functions.https.onCall(
  async (data: { tier?: number }, context) => {
    const uid = requireAuthed(context);
    const db = getFirestore();

    const tier = Number(data?.tier ?? 1);
    if (![1, 2, 3].includes(tier)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "tier must be 1, 2, or 3"
      );
    }

    const promoId = `deposit_${tier}`;
    const promoRef = getPromoRef(uid, promoId);
    const walletStateRef = db.doc(`users/${uid}/wallet/state`);
    const ledgerRef = db.collection(`users/${uid}/wallet/ledger`);

    await db.runTransaction(async (tx) => {
      // Check promo already claimed
      const promoSnap = await tx.get(promoRef);
      if (promoSnap.exists) {
        throw new functions.https.HttpsError(
          "already-exists",
          `Deposit bonus tier ${tier} already claimed.`
        );
      }

      const stateSnap = await tx.get(walletStateRef);
      const state = readWalletState(stateSnap.exists ? (stateSnap.data() ?? {}) : {});

      // Require sufficient approved deposits
      if ((state.approvedDepositCount ?? 0) < tier) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `You need at least ${tier} approved deposit(s) to claim this bonus.`
        );
      }

      // Calculate bonus from last approved deposit amount
      const lastDepositCents = Number(
        (stateSnap.data() as Record<string, unknown>)?.lastApprovedDepositCents ?? 0
      );
      if (lastDepositCents <= 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "No deposit amount found. Contact support."
        );
      }

      const matchPercent = depositMatchPercent(tier - 1);
      const bonusCentsToAdd = Math.floor(lastDepositCents * matchPercent);
      if (bonusCentsToAdd <= 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "No bonus available for this tier."
        );
      }

      const now = FieldValue.serverTimestamp();
      const newBonus = state.bonusCents + bonusCentsToAdd;
      const addedRollover = bonusCentsToAdd * BONUS_ROLLOVER_MULTIPLIER;
      const newRolloverTarget = state.rolloverTargetCents + addedRollover;

      // Write promo claim record
      tx.set(promoRef, {
        uid,
        tier: promoId,
        amountCents: bonusCentsToAdd,
        depositCents: lastDepositCents,
        matchPercent,
        createdAt: now
      });

      // Update wallet state
      tx.set(
        walletStateRef,
        {
          bonusCents: newBonus,
          rolloverTargetCents: newRolloverTarget,
          bonusWithdrawalCapCents: BONUS_WITHDRAWAL_CAP_CENTS,
          bonusLockActive: true,
          updatedAt: now
        },
        { merge: true }
      );

      // Ledger entry
      const entry = buildLedgerEntry({
        uid,
        type: "bonus_credit",
        amountCents: bonusCentsToAdd,
        balanceAfter: state.cashCents,
        meta: {
          label: `deposit_bonus_tier_${tier}`,
          bonusAfter: newBonus,
          matchPercent,
          depositCents: lastDepositCents,
          rolloverAdded: addedRollover
        }
      });
      tx.set(ledgerRef.doc(), entry);
    });

    await writeSystemLog({
      type: "promo_claim",
      uid,
      message: `Deposit bonus tier ${tier} claimed`,
      severity: "info"
    });

    return { ok: true, tier };
  }
);
