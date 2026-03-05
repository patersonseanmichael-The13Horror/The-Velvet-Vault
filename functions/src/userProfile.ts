/**
 * functions/src/userProfile.ts
 *
 * User profile callables.
 * - vvUpsertUserProfile: update profile fields (existing, unchanged)
 * - vvCreateUserProfile: create profile with phone uniqueness enforcement
 */
import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { requireAuthed } from "./utils";
import { writeSystemLog } from "./monitoring";

type UpsertProfileReq = {
  email?: string;
  displayName?: string;
  phone?: string;
  dob?: string;
};

type CreateProfileReq = {
  name?: string;
  phoneRaw?: string;
  phoneNormalized?: string;
};

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePhoneServer(raw: string): string {
  const stripped = raw.replace(/[\s\-().]/g, "");
  if (stripped.startsWith("+")) {
    return "+" + stripped.slice(1).replace(/\D/g, "");
  }
  return stripped.replace(/\D/g, "");
}

// ── vvUpsertUserProfile (existing, unchanged) ─────────────────
export const vvUpsertUserProfile = functions.https.onCall(
  async (data: UpsertProfileReq, context) => {
    const uid = requireAuthed(context);
    const email =
      cleanString(data?.email, 220) || cleanString(context.auth?.token?.email, 220);
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
  }
);

// ── vvCreateUserProfile (new — phone uniqueness) ──────────────
/**
 * Called during signup to register the phone number as Player ID.
 *
 * Inputs: { name, phoneRaw, phoneNormalized }
 *
 * Writes:
 *  - users/{uid}.playerId = phoneNormalized
 *  - phoneIndex/{phoneNormalized} = { uid, createdAt }  (uniqueness index)
 *
 * Throws:
 *  - already-exists  if phoneNormalized already taken (message: "PHONE_TAKEN")
 *  - invalid-argument if phone is missing or malformed
 */
export const vvCreateUserProfile = functions.https.onCall(
  async (data: CreateProfileReq, context) => {
    const uid = requireAuthed(context);
    const db = getFirestore();

    const name = cleanString(data?.name, 120);
    const phoneRaw = cleanString(data?.phoneRaw, 80);
    const phoneNormalizedInput = cleanString(data?.phoneNormalized, 80);

    // Prefer the client-normalized value, fall back to server normalization
    const phoneNormalized = phoneNormalizedInput || normalizePhoneServer(phoneRaw);

    if (!phoneNormalized || phoneNormalized.length < 6) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "A valid phone number is required as your Player ID."
      );
    }

    const phoneIndexRef = db.doc(`phoneIndex/${phoneNormalized}`);
    const userRef = db.doc(`users/${uid}`);

    await db.runTransaction(async (tx) => {
      // Check phone uniqueness
      const phoneSnap = await tx.get(phoneIndexRef);
      if (phoneSnap.exists) {
        const existingUid = phoneSnap.data()?.uid;
        if (existingUid && existingUid !== uid) {
          throw new functions.https.HttpsError("already-exists", "PHONE_TAKEN");
        }
      }

      const now = FieldValue.serverTimestamp();

      // Register phone index
      tx.set(phoneIndexRef, { uid, phoneNormalized, createdAt: now }, { merge: true });

      // Update user profile with playerId
      const userSnap = await tx.get(userRef);
      const profilePatch: Record<string, unknown> = {
        uid,
        playerId: phoneNormalized,
        phone: phoneNormalized,
        updatedAt: now
      };
      if (name) profilePatch.displayName = name;

      if (userSnap.exists) {
        tx.set(userRef, profilePatch, { merge: true });
      } else {
        tx.set(userRef, {
          ...profilePatch,
          email: context.auth?.token?.email || null,
          createdAt: now
        });
      }
    });

    await writeSystemLog({
      type: "profile_created",
      uid,
      message: `Player ID registered: ${phoneNormalized}`,
      severity: "info"
    });

    return { ok: true, uid, playerId: phoneNormalized };
  }
);
