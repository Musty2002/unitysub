# Tasks

- [x] Add a UNITYSUB admin dashboard and management pages based on the SM Data reference.
- [x] Verify admin navigation and layouts on desktop and mobile without changing the supplied app.

- [x] Inspect the supplied UNITYSUB page and inventory its screens, storage, and external references.
- [x] Serve the supplied app as standalone HTML, preserving its behavior except for the requested splash branding.
- [x] Verify the build, home route, and phone-size login, password-reset, and registration screens.
- [x] Replace the existing splash mark with the uploaded UNITYSUB logo and app icon.
- [ ] Optional: import existing device-local data (waiting for a user-provided export).
- [x] Connect Firebase email/password sign-in and owner-scoped profile/preferences in the customer app.
- [x] Remove the Admin shortcut from the customer app's top corner.
- [x] Replace the separate SMS login screen with email-or-phone plus password and add the Firebase Cloud Function code.
- [x] Remove residential address collection from sign-up and its required validation.
- [ ] Deploy and live-test phone/password sign-in in Firebase project `unitysub-8d27a` (requires owner access and billing setup).
- [ ] In Firebase Console, create Cloud Firestore and publish the updated `firestore.rules` (requires project-owner console access).