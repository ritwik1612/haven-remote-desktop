"""Bundle Node, the native bridge and a WebView2 desktop window into Haven.exe."""
from pathlib import Path
import hashlib
import shutil
import subprocess
import sys
import urllib.request
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'.build'/'windows'
BUILD.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'downloads';OUT.mkdir(exist_ok=True)
NODE=Path(shutil.which('node'))
icon=BUILD/'haven.ico'
Image.open(ROOT/'public'/'icon-512.png').save(icon,format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])


def freeze(args):
    subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--noupx','--workpath',str(BUILD/'work'),'--specpath',str(BUILD),'--distpath',str(BUILD/'dist'),*args],cwd=ROOT,check=True)


for name,source,mode in [('HavenBridge',ROOT/'native'/'bridge.py','--console')]:
    binary=BUILD/'dist'/(name+'.exe')
    if not binary.exists() or binary.stat().st_mtime<source.stat().st_mtime:
        freeze(['--onefile',mode,'--name',name,'--icon',str(icon),str(source)])
compiler=Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')
if not compiler.exists():raise RuntimeError('The .NET Framework C# compiler is required to build the tray icon.')
subprocess.run([str(compiler),'/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/win32icon:'+str(icon),'/out:'+str(BUILD/'dist/HavenTray.exe'),str(ROOT/'packaging/HavenTray.cs')],cwd=ROOT,check=True)
vendors=ROOT/'.build'/'vendors'
for name in ['HavenService.exe','tightvnc.msi']:
    if not (vendors/name).exists():raise RuntimeError('Missing vendor asset: '+name)
assets=[(ROOT/'server.mjs','.'),(ROOT/'public','public'),(ROOT/'node_modules','node_modules'),
        (NODE,'.'),(BUILD/'dist'/'HavenBridge.exe','.'),(BUILD/'dist'/'HavenTray.exe','.'),(vendors/'HavenService.exe','.'),(vendors/'tightvnc.msi','.'),
        (ROOT/'THIRD_PARTY_NOTICES.md','.'),(ROOT/'LICENSE','.'),(ROOT/'licenses','licenses')]
args=['--onefile','--windowed','--name','Haven','--icon',str(icon),'--collect-all','webview','--hidden-import','Crypto.Cipher.DES']
for source,destination in assets:args+=['--add-data',str(source)+';'+destination]
args+=[str(ROOT/'packaging'/'desktop.py')]
freeze(args)
shutil.copy2(BUILD/'dist'/'Haven.exe',OUT/'Haven-Windows.exe')
shutil.copy2(vendors/'tightvnc-source.zip',OUT/'TightVNC-2.8.90-GPL-source.zip')
for asset in OUT.iterdir():
    if asset.is_file() and asset.suffix in ['.exe','.apk','.zip']:
        print(asset.name,asset.stat().st_size,hashlib.sha256(asset.read_bytes()).hexdigest())
