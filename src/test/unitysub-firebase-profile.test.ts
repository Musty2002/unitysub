import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Firebase profile records", () => {
  it("does not request NIN during sign-up", () => {
    const html = readFileSync(resolve(process.cwd(), "public/UNITYSUB_PHYSICAL_CARD_DISPLAY_FIXED.html"), "utf8");
    const firebaseSource = readFileSync(resolve(process.cwd(), "public/unitysub-firebase.js"), "utf8");

    expect(html).not.toContain('id="createNin"');
    expect(html).not.toContain('id="createKycConsent"');
    expect(firebaseSource).not.toContain("createNin");
    expect(firebaseSource).not.toContain("createKycConsent");
  });

  it("keeps profile fields while excluding passwords, PINs, and NIN values", async () => {
    const helperSource = readFileSync(resolve(process.cwd(), "public/unitysub-firebase-profile.js"), "utf8");
    const helperUrl = `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`;
    const { createProfileRecord, normalizePhoneNumber } = await import(helperUrl);
    const profile = createProfileRecord({
      displayName: "Amina Bello",
      email: "AMINA@example.com",
      address: "12 Unity Road",
      state: "Lagos",
      dateOfBirth: "1994-05-12",
      gender: "Female",
      phoneNumber: "08012345678",
      nickname: "Amina",
      password: "not-a-real-password",
      pin: "1234",
      nin: "12345678901",
    });

    expect(profile).toEqual({
      displayName: "Amina Bello",
      email: "amina@example.com",
      address: "12 Unity Road",
      state: "Lagos",
      dateOfBirth: "1994-05-12",
      gender: "Female",
      phoneNumber: "+2348012345678",
      nickname: "Amina",
    });
  });

  it("normalizes Nigerian phone numbers for Firebase phone authentication", async () => {
    const helperSource = readFileSync(resolve(process.cwd(), "public/unitysub-firebase-profile.js"), "utf8");
    const helperUrl = `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`;
    const { normalizePhoneNumber } = await import(helperUrl);

    expect(normalizePhoneNumber("08012345678")).toBe("+2348012345678");
    expect(normalizePhoneNumber("2348012345678")).toBe("+2348012345678");
    expect(normalizePhoneNumber("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhoneNumber("12345")).toBe("");
  });

  it("links phone credentials to email accounts and provides phone-code sign-in", () => {
    const firebaseSource = readFileSync(resolve(process.cwd(), "public/unitysub-firebase.js"), "utf8");

    expect(firebaseSource).toContain("PhoneAuthProvider");
    expect(firebaseSource).toContain("linkWithCredential");
    expect(firebaseSource).toContain("signInWithCredential");
    expect(firebaseSource).toContain("This phone number is not linked to an email account");
  });

  it("limits profile reads to the matching signed-in user", () => {
    const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).toContain("allow get: if ownsUser(userId);");
    expect(rules).toContain("allow list: if false;");
  });

  it("only stores a verified phone number matching the signed-in Firebase identity", () => {
    const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

    expect(rules).toContain("data.phoneNumber == request.auth.token.phone_number");
  });

  it("prevents profile and preference deletion", () => {
    const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

    expect(rules).toContain("allow delete: if false;");
  });
});