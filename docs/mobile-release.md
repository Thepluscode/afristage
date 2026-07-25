# Mobile store release — runbook

How to ship the AfriStage Flutter app (`apps/mobile`, id `live.afristage.afristage_mobile`)
to the Google Play Store and Apple App Store. **Android release signing is wired and a
signed AAB builds today** (this doc + `android/app/build.gradle.kts`); the account,
key, and iOS pieces below are prerequisites that need YOUR credentials / a Mac.

Interim distribution while this is stood up: the hosted **Flutter web build**
(`flutter-web` Railway service) — see the flutter-web hosting notes.

---

## What's done vs. what needs you

| Piece | Status |
|---|---|
| Android release signing wired (`key.properties` → `signingConfigs.release`, debug fallback) | ✅ done |
| Signed AAB builds locally (`flutter build appbundle --release`) | ✅ verified with a throwaway key |
| Version-bump discipline (`pubspec.yaml` `version:`) | ✅ documented below |
| **Real Play upload keystore** | ⬜ you generate + back up (§2) |
| **Google Play Console account** ($25 one-time) + app listing | ⬜ you (§3) |
| Play service-account JSON (for automated `supply` uploads) | ⬜ optional, you (§5) |
| **Apple Developer Program** ($99/yr) + a Mac with Xcode | ⬜ you (§6) |
| iOS signing + TestFlight | ⬜ needs the Apple account + Mac (§6) |

> **I cannot do the ⬜ items** — they require creating store accounts and entering
> credentials/payment, which must be done by you. Everything else is code + config,
> already in the repo.

---

## 1. Versioning (every release)

`pubspec.yaml` → `version: <name>+<build>` (e.g. `0.1.0+2`). The **build number must
increase for every store upload** (Play + App Store both reject a re-used build number).
`versionCode`/`versionName` flow from this automatically via the Flutter Gradle plugin.

## 2. Generate the REAL Android upload key (once, keep forever)

The signing wiring is proven (a signed AAB builds), it just needs your key.
**Without `android/key.properties` the release build falls back to debug signing**, so
generate + wire your own key before any store upload:

```bash
cd apps/mobile/android
keytool -genkeypair -keystore upload-keystore.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias upload
# pick a strong store/key password; fill android/key.properties with them
```

- **Back it up** (password manager + offline copy). If you lose this key you can never
  push an update to the same Play listing.
- `android/upload-keystore.jks` and `android/key.properties` are **gitignored**
  (`android/.gitignore`) — never commit them.
- With **Play App Signing** (recommended, default), Google holds the real *app signing*
  key and re-signs; your upload key only authenticates uploads, so a compromised upload
  key can be reset. Enroll when you create the app.

## 3. Google Play Console (once)

1. Create a Play Console account ($25 one-time) and a new app (`live.afristage.afristage_mobile`).
2. Enroll in **Play App Signing**.
3. Set up the **Internal testing** track first (fastest; up to 100 testers, no review wait).

## 4. Build + upload the Android release (each release)

```bash
cd apps/mobile
flutter build appbundle --release          # → build/app/outputs/bundle/release/app-release.aab
```

First release: upload the `.aab` in Play Console → Internal testing → Create release.
Verify the signer before uploading if unsure:

```bash
keytool -printcert -jarfile build/app/outputs/bundle/release/app-release.aab | grep Owner
# should show YOUR upload key's CN, not "Android Debug"
```

## 5. Automate uploads with fastlane (already scaffolded)

Fastlane is **committed and ready**: `apps/mobile/Gemfile`,
`apps/mobile/android/fastlane/` (Appfile + Fastfile — lanes `internal`, `production`),
`apps/mobile/ios/fastlane/` (lane `beta` → TestFlight). Once §2–3 exist and you have a
Play service-account JSON:

```bash
cd apps/mobile && flutter build appbundle --release
export PLAY_SERVICE_ACCOUNT_JSON=/abs/path/play-service-account.json   # gitignored / CI secret
cd android && bundle install && bundle exec fastlane internal          # → Play internal track
# later: bundle exec fastlane production   (staged 10% rollout)
```

Get the JSON: Play Console → Setup → API access → create a service account with
"Release manager" permission, download its key. Treat it as a secret (gitignored via
`**/*service-account*.json`).

## 6. iOS / App Store (needs a Mac + Apple enrollment)

Not started — requires **macOS + Xcode**, an **Apple Developer Program** membership
($99/yr), and signing certs/profiles. Outline for when those exist:

```bash
flutter build ipa --release        # on a Mac; produces build/ios/ipa/*.ipa
```

Then TestFlight via Xcode/Transporter, or fastlane `pilot`:

```ruby
platform :ios do
  lane :beta do
    build_app(scheme: "Runner")
    upload_to_testflight(api_key_path: ENV["APP_STORE_CONNECT_API_KEY"])
  end
end
```

Prereqs you provide: an **App Store Connect API key** (`.p8` + issuer/key id), a bundle id
registered in the Apple Developer portal, and `fastlane match` (or manual certs) for signing.

## 7. CI note

GitHub Actions is billing-blocked, so releases are **local/manual** for now. The fastlane
lanes above are CI-ready — wire them into a workflow (with the JSON/API-key as encrypted
secrets) once Actions billing is on.

## Secrets checklist (never commit — all gitignored or CI-only)

`android/upload-keystore.jks` · `android/key.properties` · Play service-account JSON ·
Apple App Store Connect `.p8` API key. Back them up in a password manager.
