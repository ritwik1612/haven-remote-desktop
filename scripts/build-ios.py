"""Compile on a standard macOS GitHub runner; package an unsigned, device-arm64 IPA."""
from pathlib import Path
import hashlib
import plistlib
import shutil
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'.build/ios'
OUT=ROOT/'downloads'
OUT.mkdir(exist_ok=True)
subprocess.run(['xcodebuild','-version'],check=True)
subprocess.run(['xcodebuild','-project',str(ROOT/'ios-native/Haven.xcodeproj'),'-scheme','Haven',
                '-configuration','Release','-sdk','iphoneos','-destination','generic/platform=iOS',
                '-derivedDataPath',str(BUILD),'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO',
                'CODE_SIGN_IDENTITY=','build'],check=True,cwd=ROOT)
app=BUILD/'Build/Products/Release-iphoneos/Haven.app'
with (app/'Info.plist').open('rb') as handle:info=plistlib.load(handle)
assert info['CFBundleIdentifier']=='app.haven.remote'
assert info['CFBundleShortVersionString']=='0.1.3'
subprocess.run(['xcrun','lipo','-verify_arch','arm64',str(app/info['CFBundleExecutable'])],check=True)
assert not (app/'embedded.mobileprovision').exists(),'Do not upload account provisioning profiles.'
output=OUT/'Haven-iOS-unsigned.ipa'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(app.rglob('*')):
        if file.is_file():archive.write(file,Path('Payload/Haven.app')/file.relative_to(app))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'Payload/Haven.app/Haven' in archive.namelist()
    assert 'Payload/Haven.app/Info.plist' in archive.namelist()
digest=hashlib.sha256(output.read_bytes()).hexdigest()
(OUT/'iOS-SHA256SUMS.txt').write_text(digest+'  '+output.name+'\n')
print('Unsigned device IPA:',output.name,output.stat().st_size,'bytes',digest)
