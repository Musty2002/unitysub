import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type ProfileFields = {
  displayName?: string;
  email?: string;
  address?: string;
  state?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber?: string;
  nickname?: string;
};

type UnitySubCloudUser = {
  id: string;
  uid: string;
  email: string;
  phoneNumber: string;
  displayName: string;
};

type PasswordCredentials =
  | { email: string; password: string }
  | { phone: string; password: string };

export type UnitySubCloudBridge = {
  subscribe: (callback: (user: UnitySubCloudUser | null) => void) => number;
  unsubscribe: (id: number) => void;
  getCurrentUser: () => Promise<UnitySubCloudUser | null>;
  signInWithPassword: (credentials: PasswordCredentials) => Promise<UnitySubCloudUser>;
  signUpWithPhone: (input: {
    phone: string;
    password: string;
    profile: ProfileFields;
  }) => Promise<{ user: UnitySubCloudUser; hasSession: boolean }>;
  verifySignupPhone: (input: { phone: string; token: string }) => Promise<UnitySubCloudUser>;
  resendSignupPhone: (phone: string) => Promise<void>;
  updateEmail: (email: string) => Promise<UnitySubCloudUser>;
  requestPhoneChange: (phone: string) => Promise<void>;
  verifyPhoneChange: (input: { phone: string; token: string }) => Promise<UnitySubCloudUser>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<ProfileFields>;
  saveProfile: (profile: ProfileFields) => Promise<void>;
  updateProfile: (profile: ProfileFields) => Promise<void>;
  loadPreferences: () => Promise<Record<string, string>>;
  savePreferences: (updates: Record<string, string>) => Promise<void>;
};

declare global {
  interface Window {
    unitySubCloudBridge?: UnitySubCloudBridge;
  }
}

const profileText = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

function userToAppUser(user: User): UnitySubCloudUser {
  const metadata = user.user_metadata;
  const pendingEmail = metadata["pending_email"];
  const metadataName = metadata["display_name"];
  return {
    id: user.id,
    uid: user.id,
    email: user.email ?? (typeof pendingEmail === "string" ? pendingEmail : ""),
    phoneNumber: user.phone ?? "",
    displayName: typeof metadataName === "string" ? metadataName : "",
  };
}

function throwAuthError(error: { code?: string | undefined; message: string }): never {
  const result = new Error(error.message);
  if (error.code) Object.assign(result, { code: error.code });
  throw result;
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throwAuthError(error);
  if (!data.user) throw Object.assign(new Error("Sign in to continue."), { code: "auth_session_missing" });
  return data.user;
}

function profileDefaults(user: User): ProfileFields {
  const metadata = user.user_metadata;
  const pendingEmail = metadata["pending_email"];
  const displayName = metadata["display_name"];
  const nickname = metadata["nickname"];
  return {
    displayName: typeof displayName === "string" ? displayName : "UNITYSUB User",
    email: user.email ?? (typeof pendingEmail === "string" ? pendingEmail : ""),
    address: typeof metadata["address"] === "string" ? metadata["address"] : "",
    state: typeof metadata["state"] === "string" ? metadata["state"] : "",
    dateOfBirth: typeof metadata["date_of_birth"] === "string" ? metadata["date_of_birth"] : "",
    gender: typeof metadata["gender"] === "string" ? metadata["gender"] : "",
    phoneNumber: user.phone ?? "",
    nickname: typeof nickname === "string" ? nickname : "",
  };
}

function profileInsert(userId: string, profile: ProfileFields): TablesInsert<"profiles"> {
  const displayName = profileText(profile.displayName, 100) || "UNITYSUB User";
  return {
    user_id: userId,
    display_name: displayName,
    address: profileText(profile.address, 300),
    state: profileText(profile.state, 100),
    date_of_birth: profileText(profile.dateOfBirth, 32),
    gender: ["Male", "Female"].includes(profileText(profile.gender, 16))
      ? profileText(profile.gender, 16)
      : "",
    nickname: profileText(profile.nickname, 24) || displayName.slice(0, 24),
    updated_at: new Date().toISOString(),
  };
}

async function saveProfile(profile: ProfileFields) {
  const user = await requireUser();
  const { error } = await supabase.from("profiles").upsert(profileInsert(user.id, profile), {
    onConflict: "user_id",
  });
  if (error) throwAuthError(error);
}

function profileUpdate(profile: ProfileFields): TablesUpdate<"profiles"> {
  const update: TablesUpdate<"profiles"> = { updated_at: new Date().toISOString() };
  if (profile.displayName !== undefined) update.display_name = profileText(profile.displayName, 100);
  if (profile.address !== undefined) update.address = profileText(profile.address, 300);
  if (profile.state !== undefined) update.state = profileText(profile.state, 100);
  if (profile.dateOfBirth !== undefined) update.date_of_birth = profileText(profile.dateOfBirth, 32);
  if (profile.gender !== undefined) {
    const gender = profileText(profile.gender, 16);
    update.gender = ["Male", "Female"].includes(gender) ? gender : "";
  }
  if (profile.nickname !== undefined) update.nickname = profileText(profile.nickname, 24);
  return update;
}

const preferenceStorageKeys = {
  dark_mode: "unitysub-dark-mode",
  auto_logout: "unitysub-auto-logout",
  login_fingerprint: "unitysub-login-fingerprint",
  login_alerts: "unitysub-security-login-alerts",
  transaction_alerts: "unitysub-security-transaction-alerts",
} as const;

function createBridge(): UnitySubCloudBridge {
  const subscriptions = new Map<number, { unsubscribe: () => void }>();
  let nextSubscriptionId = 1;

  return {
    subscribe(callback) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session?.user ? userToAppUser(session.user) : null);
      });
      const id = nextSubscriptionId;
      nextSubscriptionId += 1;
      subscriptions.set(id, data.subscription);
      return id;
    },
    unsubscribe(id) {
      subscriptions.get(id)?.unsubscribe();
      subscriptions.delete(id);
    },
    async getCurrentUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error && !/session missing/i.test(error.message)) throwAuthError(error);
      return data.user ? userToAppUser(data.user) : null;
    },
    async signInWithPassword(credentials) {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throwAuthError(error);
      if (!data.user) throw new Error("Sign-in could not be completed.");
      return userToAppUser(data.user);
    },
    async signUpWithPhone({ phone, password, profile }) {
      const { data, error } = await supabase.auth.signUp({
        phone,
        password,
        options: {
          channel: "sms",
          data: {
            display_name: profileText(profile.displayName, 100),
            address: profileText(profile.address, 300),
            state: profileText(profile.state, 100),
            date_of_birth: profileText(profile.dateOfBirth, 32),
            gender: profileText(profile.gender, 16),
            nickname: profileText(profile.nickname, 24),
            pending_email: profileText(profile.email, 255).toLowerCase(),
          },
        },
      });
      if (error) throwAuthError(error);
      if (!data.user) throw new Error("Account creation could not be completed.");
      return { user: userToAppUser(data.user), hasSession: data.session !== null };
    },
    async verifySignupPhone({ phone, token }) {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throwAuthError(error);
      if (!data.user) throw new Error("Phone verification could not be completed.");
      return userToAppUser(data.user);
    },
    async resendSignupPhone(phone) {
      const { error } = await supabase.auth.resend({ type: "sms", phone });
      if (error) throwAuthError(error);
    },
    async updateEmail(email) {
      const { data, error } = await supabase.auth.updateUser({ email });
      if (error) throwAuthError(error);
      return userToAppUser(data.user);
    },
    async requestPhoneChange(phone) {
      const { error } = await supabase.auth.updateUser({ phone });
      if (error) throwAuthError(error);
    },
    async verifyPhoneChange({ phone, token }) {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
      if (error) throwAuthError(error);
      if (!data.user) throw new Error("Phone verification could not be completed.");
      return userToAppUser(data.user);
    },
    async requestPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throwAuthError(error);
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throwAuthError(error);
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throwAuthError(error);
    },
    async loadProfile() {
      const user = await requireUser();
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, address, state, date_of_birth, gender, nickname")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throwAuthError(error);
      if (!data) {
        const fallback = profileDefaults(user);
        await saveProfile(fallback);
        return fallback;
      }
      return {
        ...profileDefaults(user),
        displayName: data.display_name,
        address: data.address,
        state: data.state,
        dateOfBirth: data.date_of_birth,
        gender: data.gender,
        nickname: data.nickname,
      };
    },
    saveProfile,
    async updateProfile(profile) {
      const user = await requireUser();
      const { error } = await supabase.from("profiles").update(profileUpdate(profile)).eq("user_id", user.id);
      if (error) throwAuthError(error);
    },
    async loadPreferences() {
      const user = await requireUser();
      const { data, error } = await supabase
        .from("app_preferences")
        .select("dark_mode, auto_logout, login_fingerprint, login_alerts, transaction_alerts")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throwAuthError(error);
      if (!data) return {};
      const values: Record<string, string> = {};
      for (const [field, key] of Object.entries(preferenceStorageKeys)) {
        const value = data[field as keyof typeof data];
        if (typeof value === "string") values[key] = value;
      }
      return values;
    },
    async savePreferences(updates) {
      const user = await requireUser();
      const record: TablesInsert<"app_preferences"> = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };
      const darkMode = updates["unitysub-dark-mode"];
      if (darkMode === "on" || darkMode === "off") record.dark_mode = darkMode;
      const autoLogout = updates["unitysub-auto-logout"];
      if (typeof autoLogout === "string") record.auto_logout = autoLogout.slice(0, 32);
      const fingerprint = updates["unitysub-login-fingerprint"];
      if (fingerprint === "on" || fingerprint === "off") record.login_fingerprint = fingerprint;
      const loginAlerts = updates["unitysub-security-login-alerts"];
      if (loginAlerts === "on" || loginAlerts === "off") record.login_alerts = loginAlerts;
      const transactionAlerts = updates["unitysub-security-transaction-alerts"];
      if (transactionAlerts === "on" || transactionAlerts === "off") {
        record.transaction_alerts = transactionAlerts;
      }
      const { error } = await supabase.from("app_preferences").upsert(record, { onConflict: "user_id" });
      if (error) throwAuthError(error);
    },
  };
}

export function installUnitySubCloudBridge() {
  if (typeof window === "undefined") return () => undefined;
  const bridge = createBridge();
  window.unitySubCloudBridge = bridge;
  return () => {
    if (window.unitySubCloudBridge === bridge) delete window.unitySubCloudBridge;
  };
}