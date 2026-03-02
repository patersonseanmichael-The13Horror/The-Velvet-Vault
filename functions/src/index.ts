import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export { adminCredit, adminDebit, adminFreeze, adminGetUserLedger, adminSetBalance } from "./admin";
export { vvCreateManualReview } from "./manualReview";
export { vvCancelBet, vvReserveBet, vvSettleBet } from "./walletAtomic";
export { vvCredit, vvDebit, vvDeposit, vvGetBalanceCallable, vvWithdraw } from "./walletCompat";
export {
  adminApproveDepositRequest,
  adminApproveWithdrawalRequest,
  vvApplyDailyRebate,
  vvCreateDepositRequest,
  vvCreateWithdrawalRequest
} from "./walletRequests";
