export const PHONE_LOGIN_INVALID_CREDENTIALS = "invalid-credentials";
export const PHONE_LOGIN_SERVICE_UNAVAILABLE = "service-unavailable";
export const PHONE_LOGIN_PROVIDER_DISABLED = "provider-disabled";

export function normalizePhoneNumber(value) {
  if (typeof value !== "string") return "";
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^234\d{10}$/.test(phone)) phone = `+${phone}`;
  if (/^0\d{10}$/.test(phone)) phone = `+234${phone.slice(1)}`;
  if (/^\d{10}$/.test(phone)) phone = `+234${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

function loginError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isUnavailable(error) {
  return error?.code === PHONE_LOGIN_SERVICE_UNAVAILABLE ||
    error?.message === PHONE_LOGIN_SERVICE_UNAVAILABLE;
}

function isProviderDisabled(error) {
  return error?.code === PHONE_LOGIN_PROVIDER_DISABLED ||
    error?.message === PHONE_LOGIN_PROVIDER_DISABLED;
}

export function createPhonePasswordLogin({
  findUserByPhone,
  verifyEmailPassword,
  createCustomToken,
}) {
  if (
    typeof findUserByPhone !== "function" ||
    typeof verifyEmailPassword !== "function" ||
    typeof createCustomToken !== "function"
  ) {
    throw new TypeError("Phone password login dependencies are required.");
  }

  return async function signInWithPhoneAndPassword(input) {
    const phoneNumber = normalizePhoneNumber(input?.phoneNumber);
    const password = input?.password;
    if (!phoneNumber || typeof password !== "string" || password.length === 0 || password.length > 1024) {
      throw loginError(PHONE_LOGIN_INVALID_CREDENTIALS);
    }

    let user;
    try {
      user = await findUserByPhone(phoneNumber);
    } catch (error) {
      if (isUnavailable(error)) throw loginError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
      throw loginError(PHONE_LOGIN_INVALID_CREDENTIALS);
    }
    if (!user?.uid || !user.email || user.disabled) {
      throw loginError(PHONE_LOGIN_INVALID_CREDENTIALS);
    }

    let authenticatedUid;
    try {
      authenticatedUid = await verifyEmailPassword(user.email, password);
    } catch (error) {
      if (isProviderDisabled(error)) throw loginError(PHONE_LOGIN_PROVIDER_DISABLED);
      if (isUnavailable(error)) throw loginError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
      throw loginError(PHONE_LOGIN_INVALID_CREDENTIALS);
    }
    if (authenticatedUid !== user.uid) throw loginError(PHONE_LOGIN_INVALID_CREDENTIALS);

    try {
      const customToken = await createCustomToken(user.uid);
      if (typeof customToken !== "string" || customToken.length === 0) {
        throw loginError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
      }
      return { customToken };
    } catch {
      throw loginError(PHONE_LOGIN_SERVICE_UNAVAILABLE);
    }
  };
}