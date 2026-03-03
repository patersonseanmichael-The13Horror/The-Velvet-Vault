import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { writeSystemLog } from "./monitoring";

type AdminNotificationKind = "deposit_request" | "withdrawal_request";

type AdminNotificationInput = {
  kind: AdminNotificationKind;
  uid: string;
  amountCents: number;
  requestId: string;
  proofImageUrl?: string | null;
  payid?: string | null;
  payoutMethod?: string | null;
};

function sendGridHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function sendAdminEmail(input: AdminNotificationInput) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !adminEmail || !fromEmail) {
    return false;
  }

  const subject =
    input.kind === "deposit_request"
      ? `Velvet Vault deposit request ${input.requestId}`
      : `Velvet Vault withdrawal request ${input.requestId}`;

  const lines = [
    `Type: ${input.kind}`,
    `UID: ${input.uid}`,
    `Amount: ${input.amountCents}`,
    `Request ID: ${input.requestId}`
  ];

  if (input.proofImageUrl) lines.push(`Proof: ${input.proofImageUrl}`);
  if (input.payid) lines.push(`PayID: ${input.payid}`);
  if (input.payoutMethod) lines.push(`Method: ${input.payoutMethod}`);

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: sendGridHeaders(apiKey),
    body: JSON.stringify({
      personalizations: [{ to: [{ email: adminEmail }] }],
      from: { email: fromEmail },
      subject,
      content: [{ type: "text/plain", value: lines.join("\n") }]
    })
  });

  if (!response.ok) {
    throw new Error(`SendGrid email failed: ${response.status}`);
  }

  return true;
}

export async function notifyAdminOfRequest(input: AdminNotificationInput) {
  const db = getFirestore();
  const notificationRef = db.collection("adminNotifications").doc();

  await notificationRef.set({
    type: input.kind,
    uid: input.uid,
    amountCents: input.amountCents,
    requestId: input.requestId,
    payid: input.payid || null,
    payoutMethod: input.payoutMethod || null,
    proofImageUrl: input.proofImageUrl || null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp()
  });

  try {
    await sendAdminEmail(input);
  } catch (error) {
    await writeSystemLog({
      type: "admin_notification_failed",
      uid: input.uid,
      message: error instanceof Error ? error.message : "Admin email failed",
      severity: "warn",
      meta: {
        kind: input.kind,
        requestId: input.requestId
      }
    });
  }
}
