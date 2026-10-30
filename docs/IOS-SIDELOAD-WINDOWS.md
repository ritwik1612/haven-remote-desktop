# Install Haven on iPhone using Windows

Haven's iOS app requires iOS 16.4 or later. Download **Haven-iOS-unsigned.ipa** from [Haven Releases](https://github.com/ritwik1612/haven-remote-desktop/releases/latest). It is a real device-arm64 app, not a simulator build. The file is deliberately unsigned: AltStore signs it with **your** Apple account when you install it. No Apple account, signing certificate, or provisioning profile is stored in this repository or needed by the build job.

## 1. Prepare the Windows PC and iPhone

1. Follow [AltStore Classic's official Windows setup guide](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows). Install **AltServer for Windows**, plus the Apple iTunes/iCloud versions that guide specifies. Use Classic for personal sideloading.
2. Connect your unlocked iPhone by USB. Accept **Trust This Computer** on the iPhone. Enable the iTunes option to sync this iPhone over Wi-Fi.
3. Start AltServer. From its notification-area icon, choose **Install AltStore → your iPhone**. Enter your Apple account details yourself in AltServer; never send them in chat or put them in GitHub.
4. If requested on iPhone, trust your developer account under **Settings → General → VPN & Device Management**. On iOS 16+, enable **Settings → Privacy & Security → Developer Mode** and complete the requested restart/confirmation. Menu names may vary by iOS version.

## 2. Install the IPA

5. On the iPhone, open the [Haven release page](https://github.com/ritwik1612/haven-remote-desktop/releases/latest) in Safari. Download **Haven-iOS-unsigned.ipa** to Files.
6. Keep AltServer running on your Windows PC. Open **AltStore → My Apps → +**, select that IPA from Files, and let AltStore sign and install it. Use the same Apple account for future updates. A free account permits only three active sideloaded apps, including AltStore.
7. Open **Haven** from its icon. This native app has its own persistent browser storage. Pair it once even if you previously paired the Safari Home Screen version.

## 3. Connect your PC

8. Install/connect **Tailscale** on the iPhone and Windows PC using your own tailnet account. The PC must remain awake and online. Tailscale is still required; Haven's IPA does not contain a VPN.
9. In Windows Haven, choose your own six-digit PIN under **Security → Set session PIN** if it is not already configured. Open **Connect phone** and generate a fresh pairing QR.
10. In the iPhone app, choose **Scan QR · Pair a PC**, allow camera access, and scan the PC's QR. Approve this phone once under Windows **Devices**.
11. Enter **your chosen session PIN** on the phone. Pairing alone never opens the remote desktop. Access lasts six hours. Later, choose **Connect saved PC** and enter the same PIN; no new QR/code or laptop approval is required.

The app stores the PC address and its private pairing cookie, not the PIN. Updating/re-signing in place with the same Apple account/bundle identity preserves app data in normal use; uninstalling, clearing app data, or forgetting the phone on the PC requires pairing again.

## 4. Keep the free installation usable

12. Before seven days elapse, open **AltStore → My Apps → Refresh All** with AltServer reachable (normally the same Wi-Fi, or USB). Background refresh may help, but do not rely on it. [AltStore's refresh and free-account limits](https://faq.altstore.io/altstore-classic/your-altstore).

Apple's free signing expires after seven days. It does not provide permanent installation. If the app stops opening, refresh/re-sign it; avoid deleting Haven as a first troubleshooting step. No paid developer membership is required for this workflow. The optional Safari Home Screen app remains available if you prefer to avoid signing renewals.

## Remote controls

- Move your finger in **Left click** mode: move the cursor without holding a mouse button. Tap once: one left-click.
- **Right click**: one right-click at the latest pointer position. **Drag**: explicitly hold left-click while moving. **Move view**: pan the zoomed image without sending input.
- **Keyboard**: use the normal phone keyboard and Send, or select Ctrl/Alt/Shift/Win followed by another key. Shift+letter uses noVNC's correct uppercase keysym.
- **Win+L / Lock laptop** uses Windows `LockWorkStation`, through Haven's small interactive tray helper. **Win+Shift+S / Snip** sends the native Windows shortcut through that helper. Once Snipping Tool opens, use **Drag** to select a rectangle. These operations need a logged-in interactive Windows session and Haven's tray process; the dashboard window may stay closed.
- **Displays** selects one monitor or the full desktop. **Zoom**, scrolling, and the floating toolbar toggle remain available.

## What was verified

The IPA was built by the repository's standard GitHub macOS runner with Xcode, checked for arm64 and valid IPA structure, built for the simulator, installed, and launched. The simulator preview is included in the release. No Apple signing credentials are included in the IPA. Windows and mobile-client security/input tests and a real noVNC/RFB synthetic-server button check also pass. Native lock/snip routing and the installed helper's harmless ping were checked; the developer PC was deliberately not locked or captured. Camera scanning and final Apple-account signing still need a physical iPhone check.

## Rebuild from Windows

Open **GitHub repository → Actions → Build iOS IPA → Run workflow**. After success, download **Haven-iOS-unsigned** from that run's Artifacts. This runs Xcode on GitHub's standard macOS runner; no local Mac is needed. Standard hosted runners are currently free for public repositories, subject to GitHub's policies. The workflow uses no signing secrets, certificates, paid runner labels, or Apple account credentials.
