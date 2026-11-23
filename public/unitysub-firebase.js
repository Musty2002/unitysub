import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
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
  if (code === "auth/operation-not-allowed") {
    return "Email/password sign-in is not enabled in Firebase yet. Enable it under Authentication → Sign-in method.";
  }
  if (code === "auth/email-already-in-use") return "An account with this email already exists. Please log in.";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Email or password is incorrect.";
  }
  if (code === "auth/weak-password") return "Choose a stronger password with at least 8 characters.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a moment and try again.";
  if (code === "auth/network-request-failed" || code === "unavailable") {
    return "Firebase could not be reached. Check your connection and try again.";
  }
  return "Sign-in could not be completed. Please try again.";
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
  const email = (element("loginIdentity")?.value || "").trim().toLowerCase();
  const password = element("loginPassword")?.value || "";
  if (!email || !password) return setMessage("loginError", "Enter your email address and password.");
  try {
    await authPersistenceReady;
    await signInWithEmailAndPassword(auth, email, password);
    if (element("loginPassword")) element("loginPassword").value = "";
  } catch (error) {
    setMessage("loginError", authError(error));
  }
};

window.finishLocalDemoSignup = async function (event) {
  if (event) event.preventDefault();
  setMessage("createError", "");
  const value = (id) => (element(id)?.value || "").trim();
  const name = value("createName");
  const email = value("createIdentity").toLowerCase();
  const password = element("createPassword")?.value || "";
  const confirm = element("createConfirm")?.value || "";
  const pin = element("createPin")?.value || "";
  const pinConfirm = element("createPinConfirm")?.value || "";

  if (!name) return setMessage("createError", "Enter your full name in Step 1.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage("createError", "Enter a valid email address in Step 1.");
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
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    const profile = createProfileRecord({
      displayName: name,
      email,
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
    clearSignupSecrets();
    setLocalProfile(profile);
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

onAuthStateChanged(auth, async (user) => {
  const isInitialState = initialAuthState;
  initialAuthState = false;
  if (!user) {
    setActiveUser(null);
    showLogin();
    return;
  }
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