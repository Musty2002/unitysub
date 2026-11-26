# UNITYSUB phone-and-password sign-in

The customer app accepts an email address or verified phone number with the account password. Email sign-in continues to use Firebase Authentication directly. Phone sign-in uses the callable function in `firebase/functions` to find the existing Auth account by its verified phone number, check the password with Firebase Authentication, and return a short-lived custom sign-in token. The function does not return the linked email or save passwords.

## Deploy to the UNITYSUB Firebase project

This project is configured for Firebase project `unitysub-8d27a`. Deployment is not automatic; run these commands from the repository root with access to that Firebase project:

```sh
npm install -g firebase-tools
firebase login
firebase deploy --only functions:signInWithPhoneAndPassword
```

Cloud Functions deployment may require the Firebase project to use the Blaze billing plan. Costs depend on usage and Google Cloud billing settings. The function runs on Node.js 22 and uses the managed Firebase service account; do not download or add a service-account private key.

Email/Password must remain enabled in **Firebase Console → Authentication → Sign-in method**. The app and function both target `unitysub-8d27a`. Only accounts with an email/password provider and a verified phone number linked in Firebase Authentication can use phone/password login. Existing accounts can link a phone after signing in with email.