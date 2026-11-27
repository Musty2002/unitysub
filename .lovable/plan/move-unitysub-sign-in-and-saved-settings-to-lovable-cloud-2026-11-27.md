# Move UNITYSUB sign-in and saved settings to Lovable Cloud

## Goal
Use Lovable Cloud for customer accounts, profiles, and preferences while keeping the supplied UNITYSUB app's appearance and screens intact.

## Work
- Replace the Firebase browser integration with a small bridge to the generated Lovable Cloud client; keep the standalone customer HTML and its existing layout.
- Preserve email-or-verified-phone plus password sign-in on one account. Keep phone verification for signup or later account linking, not as a separate sign-in method. Leave email confirmation enabled.
- Store customer profile fields and app preferences in owner-only Cloud database tables with row-level access rules. Keep device PIN handling local and never store passwords, PINs, NINs, or simulated financial records.
- Add the required public password-reset page and connect the existing reset action to Cloud Auth.
- After the Cloud flow is verified, remove obsolete Firebase client/function configuration, Firestore rules, deployment notes, and Firebase-specific tests.
- Update the roadmap and project guidance, then run focused tests and check the app in the preview.

## Transition note
Firebase Auth accounts and Firestore records will not transfer automatically. Existing Firebase passwords are not available for migration, so customers will need to register in Lovable Cloud. Importing any exported Firestore records is not included.

## Technical details
Use `@/integrations/supabase/client` only in the host app; expose narrowly scoped auth/profile/preferences methods to the embedded HTML through a same-origin bridge. Create `public.profiles` and `public.app_preferences` with explicit grants, RLS, and a signup trigger for profile creation. Regenerate Cloud database types after the migration. Keep the existing email-or-phone field and bind phone sign-in to the verified phone on the same Cloud Auth user.