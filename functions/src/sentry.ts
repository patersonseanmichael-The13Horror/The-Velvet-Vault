/**
 * Velvet Vault — Admin Sentry System
 *
 * Provides risk scoring, duplicate detection, and AI-assisted deposit/withdrawal review.
 * All callables require admin custom claim (token.admin === true).
 */

import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { writeSystemLog } from "./monitoring";
import { optionalString } from "./walletStore";

// ── Helpers ────────────────────────────────────────────────────────────────

async function requireAdminAudited(
  context: functions.https.CallableContext,
  action: string
): Promise<string> {
  const uid = optionalString(context.auth?.uid, 128);
  if (!uid) {
    await writeSystemLog({
      type: "admin_misuse_attempt",
      uid: null,
      message: `Unauthenticated sentry access: ${action}`,
      severity: "critical"
    });
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }
  if (context.auth?.token?.admin !== true) {
    await writeSystemLog({
      type: "admin_misuse_attempt",
      uid,
      message: `Non-admin sentry access: ${action}`,
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

// ── Risk scoring ────────────────────────────────────────────────────────────

interface RiskResult {
  uid: string;
  riskScore: number;
  flags: string[];
  reason: string;
}

async function computeRiskScore(uid: string): Promise<RiskResult> {
  const db = getFirestore();
  const flags: string[] = [];
  let score = 0;

  // 1. Check for multiple accounts with same phone
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() ?? {};
  const phone = optionalString(userData.phone, 30);

  if (phone) {
    const phoneKey = phone.replace(/\D/g, "");
    const phoneIndexSnap = await db.collection("phoneIndex").doc(phoneKey).get();
    if (phoneIndexSnap.exists) {
      const phoneData = phoneIndexSnap.data() ?? {};
      const uids: string[] = Array.isArray(phoneData.uids) ? phoneData.uids : [];
      if (uids.length > 1) {
        flags.push(`duplicate_phone:${uids.length}_accounts`);
        score += 40;
      }
    }
  }

  // 2. Check for rapid deposit requests (> 3 in 24h)
  const oneDayAgo = Date.now() - 86_400_000;
  const depositSnap = await db
    .collection("depositRequests")
    .where("uid", "==", uid)
    .where("createdAt", ">=", oneDayAgo)
    .limit(10)
    .get();
  if (depositSnap.size >= 3) {
    flags.push(`rapid_deposits:${depositSnap.size}_in_24h`);
    score += 20;
  }

  // 3. Check for rejected requests
  const rejectedSnap = await db
    .collection("depositRequests")
    .where("uid", "==", uid)
    .where("status", "==", "rejected")
    .limit(5)
    .get();
  if (rejectedSnap.size >= 2) {
    flags.push(`rejected_deposits:${rejectedSnap.size}`);
    score += 15;
  }

  // 4. Check for frozen account
  const walletSnap = await db
    .collection("users")
    .doc(uid)
    .collection("wallet")
    .doc("state")
    .get();
  if (walletSnap.exists && walletSnap.data()?.frozen === true) {
    flags.push("account_frozen");
    score += 25;
  }

  // 5. Check for high withdrawal frequency
  const withdrawSnap = await db
    .collection("withdrawalRequests")
    .where("uid", "==", uid)
    .where("createdAt", ">=", oneDayAgo)
    .limit(10)
    .get();
  if (withdrawSnap.size >= 3) {
    flags.push(`rapid_withdrawals:${withdrawSnap.size}_in_24h`);
    score += 20;
  }

  const reason =
    flags.length > 0
      ? `Risk factors: ${flags.join(", ")}`
      : "No significant risk factors detected";

  return { uid, riskScore: Math.min(score, 100), flags, reason };
}

// ── Callables ──────────────────────────────────────────────────────────────

interface SentryEvaluateReq {
  uid?: string;
}

export const adminSentryEvaluateUser = functions.https.onCall(
  async (data: SentryEvaluateReq, context) => {
    const actorUid = await requireAdminAudited(context, "adminSentryEvaluateUser");
    const targetUid = optionalString(data?.uid, 128);
    if (!targetUid) {
      throw new functions.https.HttpsError("invalid-argument", "uid is required");
    }

    const result = await computeRiskScore(targetUid);

    // Persist flag if score >= 30
    if (result.riskScore >= 30) {
      await getFirestore()
        .collection("sentryFlags")
        .doc(targetUid)
        .set(
          {
            uid: targetUid,
            riskScore: result.riskScore,
            flags: result.flags,
            reason: result.reason,
            evaluatedBy: actorUid,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
    }

    await writeSystemLog({
      type: "admin_sentry_evaluate",
      uid: actorUid,
      message: `Sentry evaluated ${targetUid}: score=${result.riskScore}`,
      severity: result.riskScore >= 50 ? "warn" : "info",
      meta: { targetUid, riskScore: result.riskScore, flags: result.flags }
    });

    return { ok: true, ...result };
  }
);

interface SentryListReq {
  limit?: number;
  minScore?: number;
}

export const adminSentryListFlagged = functions.https.onCall(
  async (data: SentryListReq, context) => {
    await requireAdminAudited(context, "adminSentryListFlagged");

    const limit = Math.max(1, Math.min(Number(data?.limit) || 50, 200));
    const minScore = Math.max(0, Math.min(Number(data?.minScore) || 0, 100));

    let query = getFirestore()
      .collection("sentryFlags")
      .orderBy("riskScore", "desc")
      .limit(limit);

    if (minScore > 0) {
      query = query.where("riskScore", ">=", minScore) as typeof query;
    }

    const snap = await query.get();
    const entries = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        uid: optionalString(d.uid, 128),
        riskScore: Number(d.riskScore ?? 0),
        flags: Array.isArray(d.flags) ? d.flags : [],
        reason: optionalString(d.reason, 500),
        updatedAt: toMillis(d.updatedAt)
      };
    });

    return { ok: true, entries };
  }
);

interface AssistReq {
  id?: string;
}

interface AssistResult {
  ok: boolean;
  id: string;
  uid: string | null;
  amountCents: number;
  status: string | null;
  createdAt: number;
  riskScore: number;
  flags: string[];
  recommendation: string;
  proofImageUrl?: string | null;
  payoutDetails?: Record<string, unknown> | null;
}

export const adminDepositAssist = functions.https.onCall(
  async (data: AssistReq, context) => {
    const actorUid = await requireAdminAudited(context, "adminDepositAssist");
    const id = optionalString(data?.id, 160);
    if (!id) {
      throw new functions.https.HttpsError("invalid-argument", "id is required");
    }

    const db = getFirestore();
    const snap = await db.collection("depositRequests").doc(id).get();
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Deposit request not found");
    }

    const row = snap.data() ?? {};
    const uid = optionalString(row.uid, 128) ?? "";

    // Run risk evaluation
    const risk = uid ? await computeRiskScore(uid) : { riskScore: 0, flags: [], reason: "Unknown user" };

    // Build recommendation
    let recommendation = "APPROVE";
    if (risk.riskScore >= 60) {
      recommendation = "REJECT — high risk score";
    } else if (risk.riskScore >= 30) {
      recommendation = "REVIEW — moderate risk, verify proof manually";
    } else if (!row.proofImageUrl) {
      recommendation = "REVIEW — no proof image attached";
    }

    await writeSystemLog({
      type: "admin_deposit_assist",
      uid: actorUid,
      message: `Deposit assist for request ${id} (uid=${uid}): ${recommendation}`,
      severity: "info",
      meta: { requestId: id, targetUid: uid, riskScore: risk.riskScore }
    });

    const result: AssistResult = {
      ok: true,
      id,
      uid,
      amountCents: Number(row.amountCents ?? 0),
      status: optionalString(row.status, 40),
      createdAt: toMillis(row.createdAt),
      riskScore: risk.riskScore,
      flags: risk.flags,
      recommendation,
      proofImageUrl: optionalString(row.proofImageUrl, 1500)
    };

    return result;
  }
);

export const adminWithdrawAssist = functions.https.onCall(
  async (data: AssistReq, context) => {
    const actorUid = await requireAdminAudited(context, "adminWithdrawAssist");
    const id = optionalString(data?.id, 160);
    if (!id) {
      throw new functions.https.HttpsError("invalid-argument", "id is required");
    }

    const db = getFirestore();
    const snap = await db.collection("withdrawalRequests").doc(id).get();
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Withdrawal request not found");
    }

    const row = snap.data() ?? {};
    const uid = optionalString(row.uid, 128) ?? "";

    // Run risk evaluation
    const risk = uid ? await computeRiskScore(uid) : { riskScore: 0, flags: [], reason: "Unknown user" };

    // Build recommendation
    let recommendation = "APPROVE";
    if (risk.riskScore >= 60) {
      recommendation = "REJECT — high risk score";
    } else if (risk.riskScore >= 30) {
      recommendation = "REVIEW — moderate risk, verify payout details manually";
    }

    const payout =
      row.payoutDetails && typeof row.payoutDetails === "object"
        ? (row.payoutDetails as Record<string, unknown>)
        : null;

    await writeSystemLog({
      type: "admin_withdraw_assist",
      uid: actorUid,
      message: `Withdraw assist for request ${id} (uid=${uid}): ${recommendation}`,
      severity: "info",
      meta: { requestId: id, targetUid: uid, riskScore: risk.riskScore }
    });

    const result: AssistResult = {
      ok: true,
      id,
      uid,
      amountCents: Number(row.amountCents ?? 0),
      status: optionalString(row.status, 40),
      createdAt: toMillis(row.createdAt),
      riskScore: risk.riskScore,
      flags: risk.flags,
      recommendation,
      payoutDetails: payout
    };

    return result;
  }
);
