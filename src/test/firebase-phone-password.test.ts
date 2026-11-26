import { describe, expect, it, vi } from "vitest";
import {
  createPhonePasswordLogin,
  normalizePhoneNumber,
  PHONE_LOGIN_INVALID_CREDENTIALS,
  PHONE_LOGIN_PROVIDER_DISABLED,
  PHONE_LOGIN_SERVICE_UNAVAILABLE,
} from "../../firebase/functions/auth-flow.js";

const linkedAccount = {
  uid: "firebase-uid-123",
  email: "member@example.com",
  disabled: false,
};

describe("Firebase phone/password sign-in", () => {
  it("normalizes Nigerian phone numbers to E.164", () => {
    expect(normalizePhoneNumber("08012345678")).toBe("+2348012345678");
    expect(normalizePhoneNumber("2348012345678")).toBe("+2348012345678");
    expect(normalizePhoneNumber("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhoneNumber("12345")).toBe("");
  });

  it("verifies the linked account password and returns only a custom token", async () => {
    const findUserByPhone = vi.fn(async () => linkedAccount);
    const verifyEmailPassword = vi.fn(async () => linkedAccount.uid);
    const createCustomToken = vi.fn(async () => "firebase-custom-token");
    const login = createPhonePasswordLogin({ findUserByPhone, verifyEmailPassword, createCustomToken });

    const result = await login({ phoneNumber: "08012345678", password: "correct-password" });

    expect(findUserByPhone).toHaveBeenCalledWith("+2348012345678");
    expect(verifyEmailPassword).toHaveBeenCalledWith(linkedAccount.email, "correct-password");
    expect(createCustomToken).toHaveBeenCalledWith(linkedAccount.uid);
    expect(result).toEqual({ customToken: "firebase-custom-token" });
    expect(result).not.toHaveProperty("email");
  });

  it("uses the same generic error for an unknown phone and an incorrect password", async () => {
    const unknownPhoneLogin = createPhonePasswordLogin({
      findUserByPhone: async () => { throw new Error("auth/user-not-found"); },
      verifyEmailPassword: async () => linkedAccount.uid,
      createCustomToken: async () => "should-not-be-created",
    });
    const incorrectPasswordLogin = createPhonePasswordLogin({
      findUserByPhone: async () => linkedAccount,
      verifyEmailPassword: async () => { throw new Error("INVALID_LOGIN_CREDENTIALS"); },
      createCustomToken: async () => "should-not-be-created",
    });

    await expect(unknownPhoneLogin({ phoneNumber: "08012345678", password: "x" }))
      .rejects.toMatchObject({ code: PHONE_LOGIN_INVALID_CREDENTIALS });
    await expect(incorrectPasswordLogin({ phoneNumber: "08012345678", password: "wrong" }))
      .rejects.toMatchObject({ code: PHONE_LOGIN_INVALID_CREDENTIALS });
  });

  it("rejects phone-only or disabled accounts before checking a password", async () => {
    const verifyEmailPassword = vi.fn(async () => linkedAccount.uid);
    const login = createPhonePasswordLogin({
      findUserByPhone: async () => ({ ...linkedAccount, email: "", disabled: true }),
      verifyEmailPassword,
      createCustomToken: async () => "should-not-be-created",
    });

    await expect(login({ phoneNumber: "08012345678", password: "correct-password" }))
      .rejects.toMatchObject({ code: PHONE_LOGIN_INVALID_CREDENTIALS });
    expect(verifyEmailPassword).not.toHaveBeenCalled();
  });

  it("does not mint a token if password verification resolves to another account", async () => {
    const createCustomToken = vi.fn(async () => "should-not-be-created");
    const login = createPhonePasswordLogin({
      findUserByPhone: async () => linkedAccount,
      verifyEmailPassword: async () => "different-uid",
      createCustomToken,
    });

    await expect(login({ phoneNumber: "08012345678", password: "correct-password" }))
      .rejects.toMatchObject({ code: PHONE_LOGIN_INVALID_CREDENTIALS });
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("preserves provider and service configuration failures", async () => {
    const providerDisabled = createPhonePasswordLogin({
      findUserByPhone: async () => linkedAccount,
      verifyEmailPassword: async () => { throw Object.assign(new Error("disabled"), { code: PHONE_LOGIN_PROVIDER_DISABLED }); },
      createCustomToken: async () => "should-not-be-created",
    });
    const unavailable = createPhonePasswordLogin({
      findUserByPhone: async () => { throw Object.assign(new Error("offline"), { code: PHONE_LOGIN_SERVICE_UNAVAILABLE }); },
      verifyEmailPassword: async () => linkedAccount.uid,
      createCustomToken: async () => "should-not-be-created",
    });

    await expect(providerDisabled({ phoneNumber: "08012345678", password: "correct-password" }))
      .rejects.toMatchObject({ code: PHONE_LOGIN_PROVIDER_DISABLED });
    await expect(unavailable({ phoneNumber: "08012345678", password: "correct-password" }))
      .rejects.toMatchObject({ code: PHONE_LOGIN_SERVICE_UNAVAILABLE });
  });
});