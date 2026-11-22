import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Firebase profile records", () => {
  it("keeps profile fields while excluding passwords, PINs, and NIN values", async () => {
    const helperSource = readFileSync(resolve(process.cwd(), "public/unitysub-firebase-profile.js"), "utf8");
    const helperUrl = `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`;
    const { createProfileRecord } = await import(helperUrl);
    const profile = createProfileRecord({
      displayName: "Amina Bello",
      email: "AMINA@example.com",
      address: "12 Unity Road",
      state: "Lagos",
      dateOfBirth: "1994-05-12",
      gender: "Female",
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
      nickname: "Amina",
    });
  });

  it("limits profile reads to the matching signed-in user", () => {
    const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).toContain("allow get: if ownsUser(userId);");
    expect(rules).toContain("allow list: if false;");
  });

  it("prevents profile and preference deletion", () => {
    const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

    expect(rules).toContain("allow delete: if false;");
  });
});