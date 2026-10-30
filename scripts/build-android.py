"""Build and sign a small Android WebView client using official SDK tools; no Gradle service."""
from pathlib import Path
import os
import secrets
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
TOOLS=ROOT/'.build'/'android-tools'
JDK=next((TOOLS/'jdk').glob('*/bin'))
SDK=next((TOOLS/'build-tools').glob('*/aapt.exe')).parent
ANDROID=next((TOOLS/'platform').glob('*/android.jar'))
BUILD=ROOT/'.build'/'apk'
BUILD.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'downloads';OUT.mkdir(exist_ok=True)
ENV=os.environ.copy();ENV['JAVA_HOME']=str(JDK.parent);ENV['PATH']=str(JDK)+os.pathsep+ENV.get('PATH','')


def run(args,**kwargs):
    subprocess.run([str(a) for a in args],cwd=ROOT,env=ENV,check=True,**kwargs)


source=ROOT/'android'/'app'/'src'/'main'
assets=BUILD/'assets'
# Explicit public-file list: never package Vercel account files or .env credentials.
for name in ['index.html','app.js','host.js','qr-scanner.js','qr.css','style.css','icon.svg','apple-touch-icon.png','vendor/jsqr.js','vendor/jsqr-LICENSE.txt']:
    destination=assets/name;destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/'ios'/name,destination)
shutil.copy2(ROOT/'public'/'icon-192.png',source/'res'/'drawable'/'haven_icon.png')
for folder in ['gen','classes','dex']:(BUILD/folder).mkdir(exist_ok=True)
unsigned=BUILD/'unsigned.apk'
run([SDK/'aapt.exe','package','-f','-M',source/'AndroidManifest.xml','-S',source/'res','-A',assets,'-I',ANDROID,'-J',BUILD/'gen','-F',unsigned])
java=list((source/'java').rglob('*.java'))+list((BUILD/'gen').rglob('*.java'))
run([JDK/'javac.exe','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',ANDROID,'-d',BUILD/'classes',*java])
run([JDK/'java.exe','-cp',SDK/'lib'/'d8.jar','com.android.tools.r8.D8','--min-api','26','--lib',ANDROID,'--output',BUILD/'dex',*list((BUILD/'classes').rglob('*.class'))])
import zipfile
with zipfile.ZipFile(unsigned,'a',zipfile.ZIP_DEFLATED) as apk:apk.write(BUILD/'dex'/'classes.dex','classes.dex')
aligned=BUILD/'aligned.apk'
run([SDK/'zipalign.exe','-f','4',unsigned,aligned])
keydir=ROOT/'.build'/'signing';keydir.mkdir(exist_ok=True)
keystore=keydir/'haven-android.jks';passwordfile=keydir/'password.txt'
if not keystore.exists():
    passwordfile.write_text(secrets.token_urlsafe(32),encoding='utf-8')
    # Password comes from a private file, never a process argument or repository.
    run([JDK/'keytool.exe','-genkeypair','-keystore',keystore,'-storepass:file',passwordfile,'-keypass:file',passwordfile,'-alias','haven','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Haven Local Build, O=Haven, C=IN'])
output=OUT/'Haven-Android.apk'
run([JDK/'java.exe','-jar',SDK/'lib'/'apksigner.jar','sign','--ks',keystore,'--ks-pass','file:'+str(passwordfile),'--ks-key-alias','haven','--out',output,aligned])
run([JDK/'java.exe','-jar',SDK/'lib'/'apksigner.jar','verify','--verbose',output])
run([SDK/'aapt.exe','dump','badging',output])
print('Android APK ready:',output)
