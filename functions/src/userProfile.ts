import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { requireAuthed } from "./utils";

type UpsertProfileReq = {
  email?: string;
  displayName?: string;
  phone?: string;
  dob?: string;
};

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export const vvUpsertUserProfile = functions.https.onCall(async (data: UpsertProfileReq, context) => {
  const uid = requireAuthed(context);
  const email = cleanString(data?.email, 220) || cleanString(context.auth?.token?.email, 220);
  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "email required");
  }

  const displayName = cleanString(data?.displayName, 120);
  const phone = cleanString(data?.phone, 60);
  const dob = cleanString(data?.dob, 40);
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const profileUpdates: Record<string, string | null | FieldValue> = {
      uid,
      email,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (displayName) profileUpdates.displayName = displayName;
    if (phone) profileUpdates.phone = phone;
    if (dob) profileUpdates.dob = dob;

    if (snap.exists) {
      tx.set(userRef, profileUpdates, { merge: true });
      return;
    }

    tx.set(userRef, {
      ...profileUpdates,
      displayName: displayName || null,
      phone: phone || null,
      dob: dob || null,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return { ok: true, uid };
});
