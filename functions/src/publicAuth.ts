import * as functions from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { assertString } from "./utils";

type ResolveUidReq = {
  uid: string;
};

function normalizeUid(uid: string) {
  return uid.trim();
}

export const vvResolveUidLoginEmail = functions.https.onCall(async (data: ResolveUidReq) => {
  assertString("uid", data?.uid);
  const uid = normalizeUid(data.uid);
  if (uid.length < 20 || uid.length > 128 || /\s/.test(uid)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid User ID");
  }

  try {
    const userDoc = await getFirestore().doc(`users/${uid}`).get();
    const profileEmail = String(userDoc.data()?.email || "").trim();
    if (profileEmail) {
      return { ok: true, email: profileEmail };
    }

    const user = await getAuth().getUser(uid);
    const email = String(user.email || "").trim();
    if (!email) {
      throw new functions.https.HttpsError("not-found", "User not found");
    }
    return { ok: true, email };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("not-found", "User not found");
  }
});
