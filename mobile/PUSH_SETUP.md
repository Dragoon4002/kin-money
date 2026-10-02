# Android push setup (one-time)

Expo push on Android goes through FCM V1. Until these steps are done, `getExpoPushTokenAsync` fails and the app silently skips push (no crash).

1. Firebase console → Add project (any name) → Add Android app with package `xyz.kin.app`.
2. Download `google-services.json` → save as `mobile/google-services.json` (gitignore it if you prefer and use an EAS file secret).
3. In `app.json` add `"googleServicesFile": "./google-services.json"` under `expo.android`.
4. Firebase → Project settings → Service accounts → Generate new private key (JSON). Keep it out of git.
5. `cd mobile && npx eas-cli@latest credentials` → Android → production (and development) → Google Service Account → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → upload the JSON from step 4.
6. Rebuild the app (`eas build -p android`) — config plugins and google-services only apply to a new native build.
7. Test: open app, unlock, tap Allow on "Get told when money arrives", then send from https://expo.dev/notifications to the token stored by `/api/push/subscribe`.
   Use `channelId: "payments"` and `data: { url: "/activity" }` to check tap routing.

Notes: remote push never works in Expo Go on Android (SDK 53+); use the dev build.
