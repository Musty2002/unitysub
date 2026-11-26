const text = (value) => (typeof value === "string" ? value.trim() : "");

export function normalizePhoneNumber(value) {
  let phone = text(value).replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^234\d{10}$/.test(phone)) phone = `+${phone}`;
  if (/^0\d{10}$/.test(phone)) phone = `+234${phone.slice(1)}`;
  if (/^\d{10}$/.test(phone)) phone = `+234${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

export function createProfileRecord(input) {
  const displayName = text(input.displayName || input.name);
  return {
    displayName,
    email: text(input.email).toLowerCase(),
    address: text(input.address),
    state: text(input.state),
    dateOfBirth: text(input.dateOfBirth || input.dob),
    gender: text(input.gender),
    phoneNumber: normalizePhoneNumber(input.phoneNumber),
    nickname: text(input.nickname).slice(0, 24) || displayName.slice(0, 24),
  };
}

export const PROFILE_STORAGE_ENTRIES = Object.freeze([
  ["unitysub-profile-full-name", "displayName"],
  ["unitysub-profile-identity", "email"],
  ["unitysub-profile-address", "address"],
  ["unitysub-profile-state", "state"],
  ["unitysub-profile-dob", "dateOfBirth"],
  ["unitysub-profile-gender", "gender"],
  ["unitysub-profile-nickname", "nickname"],
]);

export const PREFERENCE_STORAGE_FIELDS = Object.freeze({
  "unitysub-dark-mode": "darkMode",
  "unitysub-auto-logout": "autoLogout",
  "unitysub-login-fingerprint": "loginFingerprint",
  "unitysub-security-login-alerts": "loginAlerts",
  "unitysub-security-transaction-alerts": "transactionAlerts",
});