# Third-party software

Haven's original source is MIT licensed. The bundled components retain their own licenses. Haven communicates with TightVNC over the VNC protocol as a separate application.

| Component | License | Source |
| --- | --- | --- |
| Node.js 22 | MIT and bundled notices | https://github.com/nodejs/node |
| noVNC 1.7 | MPL-2.0 | https://github.com/novnc/noVNC |
| TightVNC 2.8.90 (separate MSI/service) | GPL-2.0-or-later | https://www.tightvnc.com/download/2.8.90/tightvnc-2.8.90-src-gpl.zip |
| WinSW 2.12 | MIT | https://github.com/winsw/winsw/tree/v2.12.0 |
| pywebview | BSD-3-Clause | https://github.com/r0x0r/pywebview |
| PyInstaller bootloader | GPL-2.0-or-later with distribution exception | https://pyinstaller.org/en/stable/license.html |
| Python | PSF | https://www.python.org/psf/license/ |
| Pillow | MIT-CMU | https://github.com/python-pillow/Pillow |
| mss | MIT | https://github.com/BoboTiG/python-mss |
| PyCryptodome | BSD / public domain components | https://www.pycryptodome.org/src/license |
| qrcode | MIT | https://github.com/soldair/node-qrcode |
| ws | MIT | https://github.com/websockets/ws |
| Python.NET and clr-loader | MIT | https://github.com/pythonnet/pythonnet |

The unmodified TightVNC corresponding source archive is supplied alongside the Windows release. The installer is the GPL 2.x edition, not TightVNC Pro or its paid SDK. VNC listens on loopback; Tailscale and Haven protect network access.

Licenses included by npm and Python packages are retained in the packaged payload. Tailscale and Microsoft WebView2 are separate system prerequisites and are not sold or relicensed by Haven. Android build tools and the Temurin JDK are used locally for compilation and are not included in the APK.
