import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function loadProfileHelpers() {
  const source = readFileSync(resolve(process.cwd(), "public/unitysub-profile.js"), "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(moduleUrl);
}

describe("UNITYSUB Cloud account fields", () => {
  it("keeps password, PIN, and NIN values out of the saved profile", async () => {
    const { createProfileRecord } = await loadProfileHelpers();
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

  it("normalizes Nigerian and international phone identifiers", async () => {
    const { normalizePhoneNumber } = await loadProfileHelpers();

    expect(normalizePhoneNumber("08012345678")).toBe("+2348012345678");
    expect(normalizePhoneNumber("2348012345678")).toBe("+2348012345678");
    expect(normalizePhoneNumber("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhoneNumber("12345")).toBe("");
  });

  it("uses one email-or-phone identifier with the same password", async () => {
    const { buildPasswordCredentials } = await loadProfileHelpers();

    expect(buildPasswordCredentials("AMINA@example.com", "correct-password")).toEqual({
      email: "amina@example.com",
      password: "correct-password",
    });
    expect(buildPasswordCredentials("08012345678", "correct-password")).toEqual({
      phone: "+2348012345678",
      password: "correct-password",
    });
    expect(buildPasswordCredentials("not-an-identifier", "correct-password")).toBeNull();
  });

  it("does not request NIN or residential address during signup", () => {
    const html = readFileSync(resolve(process.cwd(), "public/UNITYSUB_PHYSICAL_CARD_DISPLAY_FIXED.html"), "utf8");

    expect(html).not.toContain('id="createNin"');
    expect(html).not.toContain('id="createKycConsent"');
    expect(html).not.toContain("createAddress");
  });
});

describe("UNITYSUB Cloud access and auth flows", () => {
  it("loads the Cloud adapter instead of a Firebase script", () => {
    const html = readFileSync(resolve(process.cwd(), "public/UNITYSUB_PHYSICAL_CARD_DISPLAY_FIXED.html"), "utf8");
    const adapter = readFileSync(resolve(process.cwd(), "public/unitysub-cloud.js"), "utf8");

    expect(html).toContain('src="/unitysub-cloud.js?v=cloud-auth-1"');
    expect(html).not.toContain("unitysub-firebase.js");
    expect(adapter).toContain("signInWithPassword");
    expect(adapter).toContain("verifySignupPhone");
  });

  it("keeps profile and preference rows owner-only and non-deletable", () => {
    const migration = readFileSync(resolve(process.cwd(), "drizzle/migrations/0000_create_unitysub_cloud_profiles.sql"), "utf8");

    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.app_preferences TO authenticated;");
    expect(migration.match(/auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).not.toMatch(/GRANT\s+.*\bTO\s+anon\b/i);
    expect(migration).not.toMatch(/CREATE POLICY[^;]+FOR DELETE/i);
  });

  it("requires a recovery link and updates only the new password", () => {
    const resetPage = readFileSync(resolve(process.cwd(), "src/routes/reset-password.tsx"), "utf8");

    expect(resetPage).toContain('get("type") === "recovery"');
    expect(resetPage).toContain("supabase.auth.updateUser({ password })");
    expect(resetPage).not.toContain("current_password");
  });
});