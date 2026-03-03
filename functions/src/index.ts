import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export { adminCredit, adminDebit, adminFreeze, adminGetUserLedger, adminSetBalance } from "./admin";
export {
  adminListPendingDepositRequests,
  adminListPendingWithdrawalRequests,
  adminRejectDepositRequest,
  adminRejectWithdrawalRequest
} from "./adminRequests";
export { vvCreateManualReview } from "./manualReview";
export { vvResolveUidLoginEmail } from "./publicAuth";
export { vvUpsertUserProfile } from "./userProfile";
export { vvCancelBet, vvReserveBet, vvSettleBet } from "./walletAtomic";
export { vvCredit, vvDebit, vvDeposit, vvGetBalanceCallable, vvWithdraw } from "./walletCompat";
export { vvGetLiveFeed, vvLogClientEvent } from "./monitoring";
export {
  adminApproveDepositRequest,
  adminApproveWithdrawalRequest,
  vvApplyDailyRebate,
  vvCreateDepositRequest,
  vvCreateWithdrawalRequest
} from "./walletRequests";
