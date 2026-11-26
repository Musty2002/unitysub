import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  PhoneAuthProvider,
  RecaptchaVerifier,
  sendPasswordResetEmail,
  setPersistence,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  createProfileRecord,
  PREFERENCE_STORAGE_FIELDS,
  PROFILE_STORAGE_ENTRIES,
  normalizePhoneNumber,
} from "/unitysub-firebase-profile.js";

const firebaseConfig = {
  apiKey: "AIzaSyDVuW14qJQIfVATzZSCCb3wApFf45R00e4",
  authDomain: "unitysub-8d27a.firebaseapp.com",
  projectId: "unitysub-8d27a",
  storageBucket: "unitysub-8d27a.firebasestorage.app",
  messagingSenderId: "86794138019",
  appId: "1:86794138019:web:d4264f08fd5682d15baa16",
  measurementId: "G-X150S1BKX7",
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp, "us-central1");
const phonePasswordLogin = httpsCallable(functions, "signInWithPhoneAndPassword");
const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);
const appStorage = window.localStorage;
const ACTIVE_UID_KEY = "unitysub-active-user-id";
const PENDING_PROFILE_KEY = "unitysub-profile-sync-pending";
const PIN_HASH_KEY = "unitysub-device-pin-hash";
const LEGACY_ACCOUNT_KEY = "unitysub_local_demo_account";
const LEGACY_REMEMBER_KEY = "unitysub_device_login_enabled";
const RAW_GET = Storage.prototype.getItem;
const RAW_SET = Storage.prototype.setItem;
const RAW_REMOVE = Storage.prototype.removeItem;

let activeUid = RAW_GET.call(appStorage, ACTIVE_UID_KEY);
let initialAuthState = true;
let pendingSignup = false;
let suppressPreferenceSync = false;
let preferenceTimer;
let pendingPreferences = {};
let signupPhoneVerificationId = "";
let linkedPhoneVerificationId = "";
const phoneRecaptchaVerifiers = new Map();

try {
  RAW_REMOVE.call(appStorage, LEGACY_ACCOUNT_KEY);
  RAW_REMOVE.call(appStorage, LEGACY_REMEMBER_KEY);
} catch {
  // Browser storage can be unavailable in private browsing.
}

function isUnitySubStorageKey(key) {
  return typeof key === "string" &&
    (key.startsWith("unitysub-") || key.startsWith("unitysub_")) &&
    key !== ACTIVE_UID_KEY;
}

function resolvedStorageKey(storage, key) {
  if (storage !== appStorage || !activeUid || !isUnitySubStorageKey(key)) return key;
  return `unitysub-user:${activeUid}:${key}`;
}

Storage.prototype.getItem = function (key) {
  return RAW_GET.call(this, resolvedStorageKey(this, key));
};

Storage.prototype.setItem = function (key, value) {
  const result = RAW_SET.call(this, resolvedStorageKey(this, key), value);
  const field = PREFERENCE_STORAGE_FIELDS[key];
  if (this === appStorage && activeUid && field && !suppressPreferenceSync) {
    pendingPreferences[field] = String(value);
    schedulePreferenceSync();
  }
  return result;
};

Storage.prototype.removeItem = function (key) {
  return RAW_REMOVE.call(this, resolvedStorageKey(this, key));
};

function setActiveUser(uid) {
  activeUid = uid;
  try {
    if (uid) RAW_SET.call(appStorage, ACTIVE_UID_KEY, uid);
    else RAW_REMOVE.call(appStorage, ACTIVE_UID_KEY);
  } catch {
    // Authentication still works if browser storage is disabled.
  }
}

function element(id) {
  return document.getElementById(id);
}

function setMessage(id, message) {
  const target = element(id);
  if (target) target.textContent = message;
}

function toast(message) {
  if (typeof window.showToast === "function") window.showToast(message);
}

function authError(error) {
  const code = error?.code;
  if (code === "functions/unauthenticated") return "Email or phone number or password is incorrect.";
  if (code === "functions/not-found") return "Phone/password sign-in is not deployed in Firebase yet. Deploy the UNITYSUB sign-in function.";
  if (code === "functions/failed-precondition") {
    return `Email/Password sign-in is disabled for Firebase project ${firebaseConfig.projectId}. Confirm it is enabled in that project.`;
  }
  if (code === "functions/unavailable") return "Phone/password sign-in is temporarily unavailable. Try again.";
  if (code === "auth/invalid-phone-number") return "Enter a valid phone number, including its country code.";
  if (code === "auth/captcha-check-failed") return "Phone verification could not be completed. Please try again.";
  if (code === "auth/quota-exceeded") return "SMS verification is temporarily unavailable. Please try again later.";
  if (code === "auth/credential-already-in-use" || code === "auth/phone-number-already-exists") {
    return "This phone number is already linked to another account.";
  }
  if (code === "auth/invalid-verification-code" || code === "auth/code-expired") {
    return "That verification code is invalid or expired. Request a new code and try again.";
  }
  if (code === "auth/operation-not-allowed") {
    return `Firebase reports that the requested sign-in method is disabled for project ${firebaseConfig.projectId}. Confirm the provider is enabled in that exact project.`;
  }
  if (code === "auth/email-already-in-use") return "An account with this email already exists. Please log in.";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Email or phone number or password is incorrect.";
  }
  if (code === "auth/weak-password") return "Choose a stronger password with at least 8 characters.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a moment and try again.";
  if (code === "auth/network-request-failed" || code === "unavailable") {
    return "Firebase could not be reached. Check your connection and try again.";
  }
  return "Sign-in could not be completed. Please try again.";
}

function clearPhoneRecaptcha(containerId) {
  const verifier = phoneRecaptchaVerifiers.get(containerId);
  if (verifier) verifier.clear();
  phoneRecaptchaVerifiers.delete(containerId);
}

async function requestPhoneVerification(phoneNumber, containerId) {
  clearPhoneRecaptcha(containerId);
  const container = element(containerId);
  if (!container) throw new Error("Phone verification is unavailable on this screen.");
  const verifier = new RecaptchaVerifier(auth, container, { size: "invisible" });
  phoneRecaptchaVerifiers.set(containerId, verifier);
  try {
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber({ phoneNumber }, verifier);
    clearPhoneRecaptcha(containerId);
    return verificationId;
  } catch (error) {
    clearPhoneRecaptcha(containerId);
    throw error;
  }
}

function firestoreProfileRef(uid) {
  return doc(db, "users", uid);
}

function firestorePreferencesRef(uid) {
  return doc(db, "users", uid, "preferences", "app");
}

function saveProfileDocument(user, profile, isNew = false) {
  const record = {
    ...profile,
    email: user.email || profile.email,
    updatedAt: serverTimestamp(),
  };
  if (isNew) record.createdAt = serverTimestamp();
  return setDoc(firestoreProfileRef(user.uid), record, { merge: true });
}

function setLocalProfile(profile) {
  suppressPreferenceSync = true;
  for (const [storageKey, field] of PROFILE_STORAGE_ENTRIES) {
    localStorage.setItem(storageKey, typeof profile[field] === "string" ? profile[field] : "");
  }
  const greeting = element("dashboardGreeting");
  if (greeting) greeting.textContent = `Hi, ${profile.nickname || profile.displayName}`;
  suppressPreferenceSync = false;
}

function parsePendingProfile(user) {
  try {
    const raw = localStorage.getItem(PENDING_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.email !== user.email) return null;
    return createProfileRecord(parsed);
  } catch {
    return null;
  }
}

async function loadProfile(user) {
  const pending = parsePendingProfile(user);
  if (pending) {
    try {
      await saveProfileDocument(user, pending, true);
      localStorage.removeItem(PENDING_PROFILE_KEY);
      return { profile: pending, syncError: null };
    } catch (error) {
      return { profile: pending, syncError: error };
    }
  }

  try {
    const snapshot = await getDoc(firestoreProfileRef(user.uid));
    if (snapshot.exists()) {
      return { profile: createProfileRecord(snapshot.data()), syncError: null };
    }
    const profile = createProfileRecord({
      displayName: user.displayName || "UNITYSUB User",
      email: user.email || "",
    });
    await saveProfileDocument(user, profile, true);
    return { profile, syncError: null };
  } catch (error) {
    return {
      profile: createProfileRecord({
        displayName: user.displayName || "UNITYSUB User",
        email: user.email || "",
      }),
      syncError: error,
    };
  }
}

async function loadPreferences(uid) {
  const snapshot = await getDoc(firestorePreferencesRef(uid));
  if (!snapshot.exists()) return;
  const preferences = snapshot.data();
  suppressPreferenceSync = true;
  for (const [storageKey, field] of Object.entries(PREFERENCE_STORAGE_FIELDS)) {
    if (typeof preferences[field] === "string") localStorage.setItem(storageKey, preferences[field]);
  }
  suppressPreferenceSync = false;
}

function schedulePreferenceSync() {
  window.clearTimeout(preferenceTimer);
  preferenceTimer = window.setTimeout(async () => {
    const uid = activeUid;
    const updates = pendingPreferences;
    pendingPreferences = {};
    if (!uid || Object.keys(updates).length === 0) return;
    try {
      await setDoc(firestorePreferencesRef(uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      // The app keeps the preference locally; Firebase rules can be published later.
    }
  }, 350);
}

function showLogin() {
  const authScreen = element("authScreen");
  const app = element("mainApp");
  const lock = element("pinLockScreen");
  if (app) app.style.display = "none";
  if (lock) {
    lock.style.display = "none";
    lock.classList.remove("visible");
  }
  if (authScreen) {
    authScreen.style.display = "";
    authScreen.classList.add("visible");
    authScreen.setAttribute("aria-hidden", "false");
  }
  if (typeof window.showAuth === "function") window.showAuth("login");
}

function showPinLock() {
  const authScreen = element("authScreen");
  const app = element("mainApp");
  const lock = element("pinLockScreen");
  if (authScreen) {
    authScreen.style.display = "none";
    authScreen.classList.remove("visible");
  }
  if (app) app.style.display = "none";
  if (lock) {
    lock.style.display = "flex";
    lock.classList.add("visible");
    lock.setAttribute("aria-hidden", "false");
  }
}

function showApp(user, profile) {
  const authScreen = element("authScreen");
  const app = element("mainApp");
  const lock = element("pinLockScreen");
  if (authScreen) {
    authScreen.style.display = "none";
    authScreen.classList.remove("visible");
    authScreen.setAttribute("aria-hidden", "true");
  }
  if (lock) {
    lock.style.display = "none";
    lock.classList.remove("visible");
    lock.setAttribute("aria-hidden", "true");
  }
  if (app) app.style.display = "";
  const name = profile.nickname || profile.displayName || user.displayName || "UNITYSUB User";
  const greeting = element("dashboardGreeting");
  if (greeting) greeting.textContent = `Hi, ${name}`;
  if (typeof window.go === "function") window.go("home");
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivePinHash(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: 120000,
    hash: "SHA-256",
  }, key, 256);
  return new Uint8Array(bits);
}

async function saveDevicePin(pin) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePinHash(pin, salt);
    localStorage.setItem(PIN_HASH_KEY, `${toHex(salt)}:${toHex(hash)}`);
  } catch {
    // The account remains usable without an optional local PIN lock.
  }
}

async function verifyDevicePin(pin) {
  const stored = localStorage.getItem(PIN_HASH_KEY) || "";
  const [saltHex, expected] = stored.split(":");
  if (!saltHex || !expected) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) || []);
  if (salt.length !== 16) return false;
  return toHex(await derivePinHash(pin, salt)) === expected;
}

function clearSignupSecrets() {
  for (const id of ["createPassword", "createConfirm", "createPin", "createPinConfirm"]) {
    const field = element(id);
    if (field) field.value = "";
  }
}

window.handleUnitySubLogin = async function (event) {
  if (event) event.preventDefault();
  setMessage("loginError", "");
  const identity = (element("loginIdentity")?.value || "").trim();
  const password = element("loginPassword")?.value || "";
  if (!identity || !password) return setMessage("loginError", "Enter your email or phone number and password.");
  const isEmail = identity.includes("@");
  const email = identity.toLowerCase();
  const phoneNumber = isEmail ? "" : normalizePhoneNumber(identity);
  if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return setMessage("loginError", "Enter a valid email address or phone number.");
  }
  if (!isEmail && !phoneNumber) return setMessage("loginError", "Enter a valid email address or phone number.");
  const submitButton = element("loginForm")?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    await authPersistenceReady;
    if (isEmail) {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      const result = await phonePasswordLogin({ phoneNumber, password });
      const customToken = result.data?.customToken;
      if (typeof customToken !== "string" || customToken.length === 0) {
        throw new Error("Phone sign-in did not return a valid session.");
      }
      await signInWithCustomToken(auth, customToken);
    }
    if (element("loginPassword")) element("loginPassword").value = "";
  } catch (error) {
    setMessage("loginError", authError(error));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

window.finishLocalDemoSignup = async function (event) {
  if (event) event.preventDefault();
  setMessage("createError", "");
  setMessage("createPhoneStatus", "");
  const value = (id) => (element(id)?.value || "").trim();
  const name = value("createName");
  const email = value("createIdentity").toLowerCase();
  const phoneNumber = normalizePhoneNumber(value("createPhone"));
  const password = element("createPassword")?.value || "";
  const confirm = element("createConfirm")?.value || "";
  const pin = element("createPin")?.value || "";
  const pinConfirm = element("createPinConfirm")?.value || "";

  if (!name) return setMessage("createError", "Enter your full name in Step 1.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage("createError", "Enter a valid email address in Step 1.");
  if (!phoneNumber) return setMessage("createError", "Enter a valid phone number with country code in Step 1.");
  if (password.length < 8 || password !== confirm) return setMessage("createError", "Check that your password is at least 8 characters and both entries match.");
  if (!["createAddress", "createState", "createDob", "createGender"].every((id) => value(id))) {
    return setMessage("createError", "Complete your residential address, state, date of birth and gender in Step 2.");
  }
  if (!/^\d{4}$/.test(pin) || pin !== pinConfirm) return setMessage("createError", "Enter the same valid 4-digit PIN in both fields.");

  const submitButton = document.querySelector('#createForm button[onclick="finishLocalDemoSignup(event)"]');
  if (submitButton) submitButton.disabled = true;
  pendingSignup = true;
  try {
    await authPersistenceReady;
    if (!signupPhoneVerificationId) {
      signupPhoneVerificationId = await requestPhoneVerification(phoneNumber, "unitysubSignupRecaptcha");
      const otpWrap = element("unitysubSignupOtp");
      if (otpWrap) otpWrap.hidden = false;
      if (submitButton) submitButton.textContent = "Verify phone number";
      setMessage("createPhoneStatus", `A 6-digit code was sent to ${phoneNumber}. Enter it to finish creating your account.`);
      pendingSignup = false;
      return;
    }
    const smsCode = value("unitysubSignupSmsCode");
    if (!/^\d{6}$/.test(smsCode)) {
      pendingSignup = false;
      return setMessage("createError", "Enter the 6-digit code sent to your phone.");
    }
    const phoneCredential = PhoneAuthProvider.credential(signupPhoneVerificationId, smsCode);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    let user = credential.user;
    try {
      const linkedCredential = await linkWithCredential(user, phoneCredential);
      user = linkedCredential.user;
      await user.getIdToken(true);
    } catch (error) {
      try {
        await deleteUser(user);
      } catch {
        // The registration error below remains the useful message for the user.
      }
      await signOut(auth).catch(() => undefined);
      throw error;
    }
    const profile = createProfileRecord({
      displayName: name,
      email,
      phoneNumber: user.phoneNumber || phoneNumber,
      address: value("createAddress"),
      state: value("createState"),
      dateOfBirth: value("createDob"),
      gender: value("createGender"),
    });
    setActiveUser(user.uid);
    localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile));
    await saveDevicePin(pin);
    try {
      await updateProfile(user, { displayName: profile.displayName });
    } catch {
      // Firestore retains the profile name if the Auth display-name update is unavailable.
    }
    let profileSyncError = null;
    try {
      await saveProfileDocument(user, profile, true);
      localStorage.removeItem(PENDING_PROFILE_KEY);
    } catch (error) {
      profileSyncError = error;
    }
    pendingSignup = false;
    signupPhoneVerificationId = "";
    clearSignupSecrets();
    if (element("unitysubSignupSmsCode")) element("unitysubSignupSmsCode").value = "";
    setLocalProfile(profile);
    window.unitySubUser = user;
    try {
      await loadPreferences(user.uid);
    } catch {
      // Cloud preferences are optional until Firestore is configured.
    }
    showApp(user, profile);
    toast(profileSyncError
      ? "Account created. Profile sync is waiting for Firestore setup and its security rules."
      : "UNITYSUB account created successfully.");
  } catch (error) {
    pendingSignup = false;
    setMessage("createError", authError(error));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

window.resendUnitySubSignupPhoneCode = async function () {
  const phoneNumber = normalizePhoneNumber(element("createPhone")?.value || "");
  if (!phoneNumber) return setMessage("createError", "Enter a valid phone number with country code in Step 1.");
  try {
    signupPhoneVerificationId = await requestPhoneVerification(phoneNumber, "unitysubSignupRecaptcha");
    setMessage("createPhoneStatus", `A new 6-digit code was sent to ${phoneNumber}.`);
  } catch (error) {
    setMessage("createError", authError(error));
  }
};

function refreshPhoneLinkPanel() {
  const user = auth.currentUser;
  const phoneLabel = element("unitysubLinkedPhone");
  if (phoneLabel) phoneLabel.textContent = user?.phoneNumber || "No verified phone number linked";
  const profilePhone = element("unitysubVerifiedPhoneValue");
  if (profilePhone) profilePhone.textContent = user?.phoneNumber || "Not linked";
  const numberInput = element("unitysubPhoneLinkNumber");
  if (numberInput && user?.phoneNumber) {
    numberInput.value = user.phoneNumber;
    numberInput.disabled = true;
  }
  const sendButton = element("unitysubPhoneLinkSend");
  if (sendButton) sendButton.disabled = !user?.email || Boolean(user.phoneNumber);
}

window.sendUnitySubPhoneLinkCode = async function () {
  setMessage("unitysubPhoneLinkError", "");
  const user = auth.currentUser;
  if (!user?.email) return setMessage("unitysubPhoneLinkError", "Sign in with your email account before linking a phone number.");
  if (user.phoneNumber) return setMessage("unitysubPhoneLinkError", "A verified phone number is already linked to this account.");
  const phoneNumber = normalizePhoneNumber(element("unitysubPhoneLinkNumber")?.value || "");
  if (!phoneNumber) return setMessage("unitysubPhoneLinkError", "Enter a valid phone number, including its country code.");
  try {
    linkedPhoneVerificationId = await requestPhoneVerification(phoneNumber, "unitysubPhoneLinkRecaptcha");
    const codeWrap = element("unitysubPhoneLinkCodeWrap");
    if (codeWrap) codeWrap.hidden = false;
    setMessage("unitysubPhoneLinkError", `A 6-digit code was sent to ${phoneNumber}.`);
  } catch (error) {
    setMessage("unitysubPhoneLinkError", authError(error));
  }
};

window.confirmUnitySubPhoneLink = async function () {
  setMessage("unitysubPhoneLinkError", "");
  const code = (element("unitysubPhoneLinkCode")?.value || "").trim();
  if (!linkedPhoneVerificationId) return setMessage("unitysubPhoneLinkError", "Request a verification code first.");
  if (!/^\d{6}$/.test(code)) return setMessage("unitysubPhoneLinkError", "Enter the 6-digit code sent to your phone.");
  const user = auth.currentUser;
  if (!user?.email) return setMessage("unitysubPhoneLinkError", "Sign in with your email account before linking a phone number.");
  try {
    const phoneCredential = PhoneAuthProvider.credential(linkedPhoneVerificationId, code);
    const linkedCredential = await linkWithCredential(user, phoneCredential);
    const linkedUser = linkedCredential.user;
    await linkedUser.getIdToken(true);
    window.unitySubUser = linkedUser;
    linkedPhoneVerificationId = "";
    const codeWrap = element("unitysubPhoneLinkCodeWrap");
    if (codeWrap) codeWrap.hidden = true;
    refreshPhoneLinkPanel();
    const loaded = await loadProfile(linkedUser);
    const profile = createProfileRecord({ ...loaded.profile, phoneNumber: linkedUser.phoneNumber || "" });
    setLocalProfile(profile);
    try {
      await saveProfileDocument(linkedUser, profile);
      setMessage("unitysubPhoneLinkError", "Phone verification complete. You can now sign in with this number.");
    } catch {
      setMessage("unitysubPhoneLinkError", "Phone verification is complete. Profile syncing will retry when Firestore is ready.");
    }
  } catch (error) {
    setMessage("unitysubPhoneLinkError", authError(error));
  }
};

window.handleUnitySubForgot = async function (event) {
  if (event) event.preventDefault();
  setMessage("forgotError", "");
  const email = (element("forgotIdentity")?.value || "").trim().toLowerCase();
  if (!email) return setMessage("forgotError", "Enter your email address.");
  try {
    await sendPasswordResetEmail(auth, email, { url: window.location.origin });
    setMessage("forgotError", "If an account uses this email, a password reset link will arrive shortly.");
  } catch (error) {
    setMessage("forgotError", authError(error));
  }
};

window.unlockDemoApp = async function (event) {
  if (event) event.preventDefault();
  const pin = element("unlockPinInput")?.value || "";
  const error = element("unlockPinError");
  try {
    if (!/^\d{4}$/.test(pin) || !(await verifyDevicePin(pin))) {
      if (error) error.textContent = "Incorrect PIN. Try again.";
      if (element("unlockPinInput")) element("unlockPinInput").value = "";
      return;
    }
    if (error) error.textContent = "";
    const user = auth.currentUser;
    if (!user) return showLogin();
    const result = await loadProfile(user);
    setLocalProfile(result.profile);
    showApp(user, result.profile);
  } catch {
    if (error) error.textContent = "PIN unlock is unavailable. Sign in with your email and password.";
  }
};

window.demoLogout = async function () {
  try {
    await signOut(auth);
  } catch {
    toast("Could not sign out. Please try again.");
  }
};
window.lockScreenLogout = window.demoLogout;
window.demoFingerprintUnlock = function () {
  const error = element("unlockPinError");
  if (error) error.textContent = "Fingerprint unlock is not connected. Enter your 4-digit PIN.";
};

const originalSaveNickname = window.saveUnitySubNickname;
if (typeof originalSaveNickname === "function") {
  window.saveUnitySubNickname = function () {
    originalSaveNickname.apply(this, arguments);
    const nickname = (element("unitysubNicknameInput")?.value || "").trim().replace(/\s+/g, " ");
    const user = auth.currentUser;
    if (!user || nickname.length < 2) return;
    void setDoc(firestoreProfileRef(user.uid), {
      nickname: nickname.slice(0, 24),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => toast("Nickname saved on this device; Firebase sync needs Firestore access."));
  };
}

const originalSettingAction = window.settingAction;
if (typeof originalSettingAction === "function") {
  window.settingAction = function () {
    const result = originalSettingAction.apply(this, arguments);
    if (arguments[0] === "My Profile") window.setTimeout(refreshPhoneLinkPanel, 0);
    return result;
  };
}

onAuthStateChanged(auth, async (user) => {
  const isInitialState = initialAuthState;
  initialAuthState = false;
  if (!user) {
    window.unitySubUser = null;
    setActiveUser(null);
    showLogin();
    return;
  }
  window.unitySubUser = user;
  setActiveUser(user.uid);
  if (pendingSignup) return;

  const hadDevicePin = isInitialState && Boolean(localStorage.getItem(PIN_HASH_KEY));
  const result = await loadProfile(user);
  setLocalProfile(result.profile);
  try {
    await loadPreferences(user.uid);
  } catch {
    // The account remains available if the optional preferences document is absent.
  }
  if (hadDevicePin) showPinLock();
  else showApp(user, result.profile);
  if (result.syncError) {
    toast("Your account is signed in. Profile sync is waiting for Firestore setup and its security rules.");
  }
});