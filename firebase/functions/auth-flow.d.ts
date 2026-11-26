export interface PhonePasswordAccount {
  uid: string;
  email?: string;
  disabled?: boolean;
}

export interface PhonePasswordLoginInput {
  phoneNumber?: unknown;
  password?: unknown;
}

export const PHONE_LOGIN_INVALID_CREDENTIALS: "invalid-credentials";
export const PHONE_LOGIN_SERVICE_UNAVAILABLE: "service-unavailable";
export const PHONE_LOGIN_PROVIDER_DISABLED: "provider-disabled";

export function normalizePhoneNumber(value: unknown): string;

export function createPhonePasswordLogin(dependencies: {
  findUserByPhone: (phoneNumber: string) => Promise<PhonePasswordAccount>;
  verifyEmailPassword: (email: string, password: string) => Promise<string>;
  createCustomToken: (uid: string) => Promise<string>;
}): (input: PhonePasswordLoginInput | null | undefined) => Promise<{ customToken: string }>;