import {
  buildPasswordCredentials,
  createProfileRecord,
  normalizePhoneNumber,
  PREFERENCE_STORAGE_FIELDS,
  PROFILE_STORAGE_ENTRIES,
} from "/unitysub-profile.js";

const ACTIVE_UID_KEY = "unitysub-active-user-id";
const PIN_HASH_KEY = "unitysub-device-pin-hash";
const LEGACY_ACCOUNT_KEY = "unitysub_local_demo_account";
const LEGACY_REMEMBER_KEY = "unitysub_device_login_enabled";
const appStorage = window.localStorage;
const RAW_GET = Storage.prototype.getItem;
const RAW_SET = Storage.prototype.setItem;
const RAW_REMOVE = Storage.prototype.removeItem;

let activeUid = RAW_GET.call(appStorage, ACTIVE_UID_KEY);
let currentUser = null;
let initialAuthState = true;
let pendingSignup = false;
let suppressPreferenceSync = false;
let preferenceTimer;
let pendingPreferences = {};
let signupPhoneNumber = "";
let signupOtpPending = false;
let linkedPhoneNumber = "";
let bridgePromise;

try {
  RAW_REMOVE.call(appStorage, LEGACY_ACCOUNT_KEY);
  RAW_REMOVE.call(appStorage, LEGACY_REMEMBER_KEY);
} catch {
  // Authentication still works when browser storage is unavailable.
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
    pendingPreferences[key] = String(value);
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
    // Authentication remains available without the optional device cache.
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

async function getCloudBridge() {
  if (!bridgePromise) {
    bridgePromise = (async () => {
      for (let attempt = 0; attempt < 160; attempt += 1) {
        try {
          const bridge = window.parent.unitySubCloudBridge;
          if (bridge) return bridge;
        } catch {
          throw new Error("UNITYSUB could not connect to Lovable Cloud.");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      }
      throw new Error("Lovable Cloud could not be reached. Refresh and try again.");
    })();
  }
  return bridgePromise;
}

function authError(error) {
  const code = error?.code || "";
  const message = String(error?.message || "").toLowerCase();
  if (code === "invalid_credentials" || code === "auth_session_missing") {
    return "Email or phone number or password is incorrect.";
  }
  if (code === "user_already_exists" || code === "phone_exists" || code === "email_exists") {
    return "This phone number or email is already linked to an account. Sign in instead.";
  }
  if ((message.includes("phone") || message.includes("sms")) &&
      (message.includes("disabled") || message.includes("not configured") || message.includes("provider"))) {
    return "Phone sign-in is not enabled in Lovable Cloud yet. Enable Phone sign-in and SMS delivery in Auth settings.";
  }
  if (code.includes("rate_limit") || message.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (message.includes("password") && message.includes("8")) {
    return "Choose a stronger password with at least 8 characters.";
  }
  if (message.includes("email") && message.includes("already")) {
    return "This email is already in use. Sign in with the account that owns it.";
  }
  if (message.includes("phone") && message.includes("already")) {
    return "This phone number is already linked to another account.";
  }
  if (message.includes("invalid") && message.includes("token")) {
    return "That verification code is invalid or expired. Request a new code and try again.";
  }
  return "Sign-in could not be completed. Check your details and try again.";
}

function setLocalProfile(profile) {
  suppressPreferenceSync = true;
  for (const [storageKey, field] of PROFILE_STORAGE_ENTRIES) {
    localStorage.setItem(storageKey, typeof profile[field] === "string" ? profile[field] : "");
  }
  localStorage.setItem("unitysub-user", JSON.stringify({
    fullName: profile.displayName,
    name: profile.displayName,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
  }));
  const greeting = element("dashboardGreeting");
  if (greeting) greeting.textContent = `Hi, ${profile.nickname || profile.displayName}`;
  suppressPreferenceSync = false;
}

async function loadProfile(user) {
  try {
    const profile = await (await getCloudBridge()).loadProfile();
    return { profile: createProfileRecord({ ...profile, email: user.email, phoneNumber: user.phoneNumber }), syncError: null };
  } catch (error) {
    return {
      profile: createProfileRecord({
        displayName: user.displayName || "UNITYSUB User",
        email: user.email,
        phoneNumber: user.phoneNumber,
      }),
      syncError: error,
    };
  }
}

async function loadPreferences() {
  const values = await (await getCloudBridge()).loadPreferences();
  suppressPreferenceSync = true;
  for (const [storageKey, field] of Object.entries(PREFERENCE_STORAGE_FIELDS)) {
    if (typeof values[storageKey] === "string") localStorage.setItem(storageKey, values[storageKey]);
  }
  suppressPreferenceSync = false;
}

function schedulePreferenceSync() {
  window.clearTimeout(preferenceTimer);
  preferenceTimer = window.setTimeout(async () => {
    const updates = pendingPreferences;
    pendingPreferences = {};
    if (!activeUid || Object.keys(updates).length === 0) return;
    try {
      await (await getCloudBridge()).savePreferences(updates);
    } catch {
      // Preferences remain on this device and will be written again after the next change.
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

async function finishSignup(user, email, profile, pin) {
  currentUser = user;
  setActiveUser(user.uid);
  const finalProfile = createProfileRecord({ ...profile, email, phoneNumber: user.phoneNumber });
  await saveDevicePin(pin);

  let profileSyncError = null;
  try {
    await (await getCloudBridge()).saveProfile(finalProfile);
  } catch (error) {
    profileSyncError = error;
  }

  let emailPending = false;
  try {
    currentUser = await (await getCloudBridge()).updateEmail(email);
    emailPending = true;
  } catch {
    // Phone sign-in remains available if the email is already used or needs attention.
  }

  setLocalProfile(finalProfile);
  window.unitySubUser = currentUser;
  try {
    await loadPreferences();
  } catch {
    // Preferences can be created on the next settings change.
  }
  signupOtpPending = false;
  signupPhoneNumber = "";
  clearSignupSecrets();
  if (element("unitysubSignupSmsCode")) element("unitysubSignupSmsCode").value = "";
  const otpWrap = element("unitysubSignupOtp");
  if (otpWrap) otpWrap.hidden = true;
  showApp(currentUser, finalProfile);

  if (profileSyncError) {
    toast("Account created. Some profile details could not be saved; try again from My Profile.");
  } else if (emailPending) {
    toast("Account created. Confirm the email link to enable email sign-in; phone sign-in is ready.");
  } else {
    toast("Account created with phone sign-in. Add or confirm your email later in My Profile.");
  }
}

window.handleUnitySubLogin = async function (event) {
  if (event) event.preventDefault();
  setMessage("loginError", "");
  const identity = (element("loginIdentity")?.value || "").trim();
  const password = element("loginPassword")?.value || "";
  const credentials = buildPasswordCredentials(identity, password);
  if (!identity || !password) return setMessage("loginError", "Enter your email or phone number and password.");
  if (!credentials) return setMessage("loginError", "Enter a valid email address or phone number.");
  const submitButton = element("loginForm")?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    currentUser = await (await getCloudBridge()).signInWithPassword(credentials);
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
  if (!signupOtpPending && !["createState", "createDob", "createGender"].every((id) => value(id))) {
    return setMessage("createError", "Complete your state, date of birth and gender in Step 2.");
  }
  if (!/^\d{4}$/.test(pin) || pin !== pinConfirm) return setMessage("createError", "Enter the same valid 4-digit PIN in both fields.");
  if (signupOtpPending && phoneNumber !== signupPhoneNumber) {
    signupOtpPending = false;
    return setMessage("createError", "The phone number changed. Submit again to request a new code.");
  }

  const submitButton = document.querySelector('#createForm button[onclick="finishLocalDemoSignup(event)"]');
  if (submitButton) submitButton.disabled = true;
  pendingSignup = true;
  try {
    const cloud = await getCloudBridge();
    if (!signupOtpPending) {
      const profile = createProfileRecord({
        displayName: name,
        email,
        state: value("createState"),
        dateOfBirth: value("createDob"),
        gender: value("createGender"),
        nickname: name.slice(0, 24),
      });
      const result = await cloud.signUpWithPhone({ phone: phoneNumber, password, profile });
      signupPhoneNumber = phoneNumber;
      if (result.hasSession) {
        await finishSignup(result.user, email, profile, pin);
        return;
      }
      signupOtpPending = true;
      const otpWrap = element("unitysubSignupOtp");
      if (otpWrap) otpWrap.hidden = false;
      if (submitButton) submitButton.textContent = "Verify phone number";
      setMessage("createPhoneStatus", `A 6-digit code was sent to ${phoneNumber}. Enter it to finish creating your account.`);
      return;
    }

    const smsCode = value("unitysubSignupSmsCode");
    if (!/^\d{6}$/.test(smsCode)) {
      return setMessage("createError", "Enter the 6-digit code sent to your phone.");
    }
    const user = await cloud.verifySignupPhone({ phone: signupPhoneNumber, token: smsCode });
    const profile = createProfileRecord({
      displayName: name,
      email,
      state: value("createState"),
      dateOfBirth: value("createDob"),
      gender: value("createGender"),
      phoneNumber: user.phoneNumber,
      nickname: name.slice(0, 24),
    });
    await finishSignup(user, email, profile, pin);
  } catch (error) {
    setMessage("createError", authError(error));
  } finally {
    pendingSignup = false;
    if (submitButton) submitButton.disabled = false;
  }
};

window.resendUnitySubSignupPhoneCode = async function () {
  if (!signupPhoneNumber) return setMessage("createError", "Submit your phone number first.");
  try {
    await (await getCloudBridge()).resendSignupPhone(signupPhoneNumber);
    setMessage("createPhoneStatus", `A new 6-digit code was sent to ${signupPhoneNumber}.`);
  } catch (error) {
    setMessage("createError", authError(error));
  }
};

function refreshPhoneLinkPanel() {
  const user = currentUser;
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
  if (sendButton) sendButton.disabled = !user?.id || Boolean(user.phoneNumber);
}

window.sendUnitySubPhoneLinkCode = async function () {
  setMessage("unitysubPhoneLinkError", "");
  if (!currentUser?.id) return setMessage("unitysubPhoneLinkError", "Sign in before linking a phone number.");
  if (currentUser.phoneNumber) return setMessage("unitysubPhoneLinkError", "A verified phone number is already linked to this account.");
  const phoneNumber = normalizePhoneNumber(element("unitysubPhoneLinkNumber")?.value || "");
  if (!phoneNumber) return setMessage("unitysubPhoneLinkError", "Enter a valid phone number, including its country code.");
  try {
    await (await getCloudBridge()).requestPhoneChange(phoneNumber);
    linkedPhoneNumber = phoneNumber;
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
  if (!linkedPhoneNumber) return setMessage("unitysubPhoneLinkError", "Request a verification code first.");
  if (!/^\d{6}$/.test(code)) return setMessage("unitysubPhoneLinkError", "Enter the 6-digit code sent to your phone.");
  try {
    currentUser = await (await getCloudBridge()).verifyPhoneChange({ phone: linkedPhoneNumber, token: code });
    window.unitySubUser = currentUser;
    linkedPhoneNumber = "";
    const codeWrap = element("unitysubPhoneLinkCodeWrap");
    if (codeWrap) codeWrap.hidden = true;
    refreshPhoneLinkPanel();
    const loaded = await loadProfile(currentUser);
    const profile = createProfileRecord({ ...loaded.profile, phoneNumber: currentUser.phoneNumber });
    setLocalProfile(profile);
    setMessage("unitysubPhoneLinkError", "Phone verification complete. You can now sign in with this number.");
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
    await (await getCloudBridge()).requestPasswordReset(email);
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
    const user = await (await getCloudBridge()).getCurrentUser();
    if (!user) return showLogin();
    currentUser = user;
    const result = await loadProfile(user);
    setLocalProfile(result.profile);
    showApp(user, result.profile);
  } catch {
    if (error) error.textContent = "PIN unlock is unavailable. Sign in with your email or phone and password.";
  }
};

window.demoLogout = async function () {
  try {
    await (await getCloudBridge()).signOut();
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
    if (!currentUser || nickname.length < 2) return;
    void getCloudBridge()
      .then((cloud) => cloud.updateProfile({ nickname: nickname.slice(0, 24) }))
      .catch(() => toast("Nickname saved on this device; Cloud sync could not be completed."));
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

async function handleAuthChange(user) {
  const isInitialState = initialAuthState;
  initialAuthState = false;
  if (!user) {
    currentUser = null;
    window.unitySubUser = null;
    setActiveUser(null);
    showLogin();
    return;
  }
  currentUser = user;
  window.unitySubUser = user;
  setActiveUser(user.uid);
  if (pendingSignup) return;

  const hadDevicePin = isInitialState && Boolean(localStorage.getItem(PIN_HASH_KEY));
  const result = await loadProfile(user);
  setLocalProfile(result.profile);
  try {
    await loadPreferences();
  } catch {
    // The account remains available if the preference row has not been created.
  }
  if (hadDevicePin) showPinLock();
  else showApp(user, result.profile);
  if (result.syncError) toast("Your account is signed in, but profile details could not be refreshed.");
}

void getCloudBridge()
  .then((cloud) => {
    const subscriptionId = cloud.subscribe((user) => {
      void handleAuthChange(user).catch(() => {
        toast("Your account is signed in, but saved details could not be refreshed.");
      });
    });
    window.addEventListener("pagehide", () => cloud.unsubscribe(subscriptionId), { once: true });
  })
  .catch((error) => {
    setMessage("loginError", authError(error));
  });