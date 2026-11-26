import { getAuth } from "firebase-admin/auth";
import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { firebaseWebApiKey } from "./firebase-config.js";
import {
  createPhonePasswordLogin,
  PHONE_LOGIN_INVALID_CREDENTIALS,
  PHONE_LOGIN_PROVIDER_DISABLED,
  PHONE_LOGIN_SERVICE_UNAVAILABLE,
} from "./auth-flow.js";

initializeApp();

const adminAuth = getAuth();

function markedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function verifyEmailPassword(email, password) {
  let response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseWebApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
  } catch {
    throw markedError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw markedError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
  }

  if (!response.ok) {
    if (result?.error?.message === "OPERATION_NOT_ALLOWED") {
      throw markedError(PHONE_LOGIN_PROVIDER_DISABLED);
    }
    if (["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS", "USER_DISABLED"]
      .includes(result?.error?.message)) {
      throw markedError(PHONE_LOGIN_INVALID_CREDENTIALS);
    }
    throw markedError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
  }

  if (typeof result?.localId !== "string" || result.localId.length === 0) {
    throw markedError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
  }
  return result.localId;
}

const phonePasswordLogin = createPhonePasswordLogin({
  findUserByPhone: async (phoneNumber) => {
    try {
      return await adminAuth.getUserByPhoneNumber(phoneNumber);
    } catch (error) {
      if (error?.code === "auth/user-not-found") throw error;
      throw markedError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
    }
  },
  verifyEmailPassword,
  createCustomToken: (uid) => adminAuth.createCustomToken(uid),
});

export const signInWithPhoneAndPassword = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      return await phonePasswordLogin(request.data);
    } catch (error) {
      if (error?.code === PHONE_LOGIN_PROVIDER_DISABLED) {
        throw new HttpsError(
          "failed-precondition",
          "Email/Password sign-in is disabled for this Firebase project.",
        );
      }
      if (error?.code === PHONE_LOGIN_SERVICE_UNAVAILABLE) {
        throw new HttpsError("unavailable", "Phone sign-in is temporarily unavailable. Try again.");
      }
      if (error?.code === PHONE_LOGIN_INVALID_CREDENTIALS) {
        throw new HttpsError("unauthenticated", "Email or phone number or password is incorrect.");
      }
      throw new HttpsError("internal", "Phone sign-in could not be completed.");
    }
  },
);