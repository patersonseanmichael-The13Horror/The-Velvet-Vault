import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getUserRef } from "./walletStore";

export type WalletState = {
  bonusCents: number;
  rolloverTargetCents: number;
  rolloverProgressCents: number;
  bonusWithdrawalCapCents: number;
  approvedDepositCount: number;
  bonusLockActive: boolean;
  noWinDepositStreak: number;
  lastRebateAt: Timestamp | null;
};

export const ALLOWED_DEPOSIT_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];
export const DEFAULT_WITHDRAWAL_CAP_CENTS = 20_000_000;
export const BONUS_WITHDRAWAL_CAP_CENTS = 300_000;
export const BONUS_ROLLOVER_MULTIPLIER = 22;
export const REBATE_ROLLOVER_MULTIPLIER = 22;

export function toCents(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function getWalletStateRef(uid: string) {
  return getUserRef(uid).collection("wallet").doc("state");
}

export async function ensureWalletState(uid: string) {
  const ref = getWalletStateRef(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(defaultWalletStateWrite(), { merge: true });
  }
  return ref;
}

export function defaultWalletStateWrite() {
  return {
    bonusCents: 0,
    rolloverTargetCents: 0,
    rolloverProgressCents: 0,
    bonusWithdrawalCapCents: 0,
    approvedDepositCount: 0,
    bonusLockActive: false,
    noWinDepositStreak: 0,
    updatedAt: FieldValue.serverTimestamp()
  };
}

export function readWalletState(data: Record<string, unknown> | undefined): WalletState {
  return {
    bonusCents: toCents(data?.bonusCents),
    rolloverTargetCents: toCents(data?.rolloverTargetCents),
    rolloverProgressCents: toCents(data?.rolloverProgressCents),
    bonusWithdrawalCapCents: toCents(data?.bonusWithdrawalCapCents),
    approvedDepositCount: toCents(data?.approvedDepositCount),
    bonusLockActive: Boolean(data?.bonusLockActive),
    noWinDepositStreak: toCents(data?.noWinDepositStreak),
    lastRebateAt: data?.lastRebateAt instanceof Timestamp ? data.lastRebateAt : null
  };
}

export function hasBonusRestriction(state: WalletState): boolean {
  return (
    state.bonusLockActive ||
    state.bonusCents > 0 ||
    state.rolloverTargetCents > state.rolloverProgressCents
  );
}

export function withdrawalCapForState(state: WalletState): number {
  return hasBonusRestriction(state) ? BONUS_WITHDRAWAL_CAP_CENTS : DEFAULT_WITHDRAWAL_CAP_CENTS;
}

export function nextRolloverProgress(state: WalletState, incrementCents: number): number {
  if (incrementCents <= 0) return state.rolloverProgressCents;
  return Math.min(
    state.rolloverTargetCents,
    state.rolloverProgressCents + Math.max(0, Math.floor(incrementCents))
  );
}

export function hiddenTreasureMultiplier(): number {
  const value = 0.5 + Math.random() * 1.99;
  return Math.round(value * 100) / 100;
}

export function depositMatchPercent(approvedDepositCount: number): number {
  if (approvedDepositCount === 0) return 1;
  if (approvedDepositCount === 1) return 0.75;
  if (approvedDepositCount === 2) return 0.5;
  return 0;
}

export function buildLedgerEntry(args: {
  uid: string;
  type: string;
  amountCents: number;
  meta?: Record<string, unknown> | null;
  status?: string | null;
  balanceAfter?: number;
  lockedAfter?: number;
  note?: string;
  game?: string;
  roundId?: string;
  actorUid?: string;
  reason?: string | null;
}) {
  return {
    uid: args.uid,
    type: args.type,
    amountCents: Math.floor(args.amountCents),
    amount: Math.abs(Math.floor(args.amountCents)),
    meta: args.meta ?? null,
    status: args.status ?? null,
    note: args.note ?? "",
    game: args.game ?? "",
    roundId: args.roundId ?? "",
    actorUid: args.actorUid ?? args.uid,
    reason: args.reason ?? null,
    balanceAfter:
      typeof args.balanceAfter === "number" ? Math.floor(args.balanceAfter) : undefined,
    lockedAfter: typeof args.lockedAfter === "number" ? Math.floor(args.lockedAfter) : undefined,
    createdAt: FieldValue.serverTimestamp(),
    ts: FieldValue.serverTimestamp()
  };
}

export function walletWindowForRebate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const end = new Date(
    `${parts.year}-${parts.month}-${parts.day}T01:57:00+10:00`
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

export function getDepositRequestRef(id: string) {
  return getFirestore().collection("depositRequests").doc(id);
}

export function getWithdrawalRequestRef(id: string) {
  return getFirestore().collection("withdrawalRequests").doc(id);
}
