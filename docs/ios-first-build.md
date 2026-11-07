# First iPhone build — ZSL Expenses

## First option: try the app in Expo Go (no Apple Developer membership)

The repository currently uses **Expo SDK 54**. At the time of writing, App Store Expo Go for iPhone supports SDK 54, but verify Expo's official compatibility notes if that changes.

On a computer with Node.js installed:

```powershell
git clone https://github.com/TheDubous/zsl-expenses.git
cd zsl-expenses
npm install
npx expo start --tunnel
```

Install Expo Go from the iPhone App Store and scan the QR code. The computer must keep Expo running. This is a preview, **not** a standalone iOS build.

## Standalone iOS preview (ad hoc, no dev server)

Apple requires a paid Apple Developer Program membership and the iPhone must be registered. On the computer:

```powershell
npm install
npx eas-cli login
npx eas-cli init
npx eas-cli device:create
npx eas-cli build --platform ios --profile preview
```

During setup, sign in to Expo, then sign in to the Apple Developer account when EAS prompts and allow it to manage signing credentials. On the device follow the registration link to include its UDID in the provisioning profile. The iOS preview build uses `eas.json` profile `preview` (`distribution: internal`).

When the build is complete, open its link on your iPhone, install and enable Developer Mode under Settings → Privacy & Security → Developer Mode if iOS asks.

This first interactive build is best run locally due to Apple's prompts for signing credentials. Never paste a password, verification code, token or certificate into a chat or commit them into GitHub.

## Later one-click builds from GitHub Actions

After the first interactive EAS build has created the project and signing credentials:
1. Create an Expo **access token** in your Expo account settings.
2. Store it as `EXPO_TOKEN` in GitHub Repository → Settings → Secrets and variables → Actions.
3. Open GitHub Actions → **Build iOS preview (manual)** → Run workflow.
4. The workflow triggers a cloud build and exits; look for the build in the Expo dashboard.

The workflow requires the GitHub Environment `ios-build` (if it does not exist, GitHub creates it during the first job); you can configure approvals there. `--non-interactive` requires credentials already present on Expo servers.

## For TestFlight instead

TestFlight is a different workflow: build `--profile production`, set up an app in App Store Connect and submit it via `eas submit --platform ios`. An active Apple Developer membership is still required.

## Safety

**Prototype only, do not use real bank confirmations or personal data yet.** Local data is not encrypted and export ZIP is not encrypted. AI recognition, automatic matching and official ZSL XLSX export are not part of this version.
