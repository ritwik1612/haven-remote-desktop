"""Haven desktop window and explicit one-time background-service setup."""
from pathlib import Path
import atexit
import ctypes
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
import winreg
import xml.sax.saxutils as xml

PAYLOAD = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))
STATE = Path(os.environ.get('PROGRAMDATA', r'C:\ProgramData')) / 'Haven'
INSTALL = Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'Haven'
TAILSCALE = Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'Tailscale' / 'tailscale.exe'
HIDE = subprocess.CREATE_NO_WINDOW
owned_process = None


def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], creationflags=HIDE, capture_output=True, text=True, **kwargs)


def tail_url():
    if not TAILSCALE.exists():
        raise RuntimeError('Install Tailscale on this laptop and phone first: https://tailscale.com/download')
    status = json.loads(run([TAILSCALE, 'status', '--json'], timeout=8).stdout)
    if status.get('BackendState') != 'Running':
        raise RuntimeError('Connect Tailscale on this laptop first, then reopen Haven.')
    dns = status['Self']['DNSName'].rstrip('.')
    current = json.loads(run([TAILSCALE, 'serve', 'status', '--json'], timeout=8).stdout or '{}')
    handler = current.get('Web', {}).get(dns + ':8443', {}).get('Handlers', {}).get('/', {}).get('Proxy')
    if current.get('TCP', {}).get('8443') and handler != 'http://127.0.0.1:4318':
        raise RuntimeError('Tailscale port 8443 belongs to another app. Haven did not change it.')
    if handler != 'http://127.0.0.1:4318':
        result = run([TAILSCALE, 'serve', '--bg', '--yes', '--https=8443', 'http://127.0.0.1:4318'], timeout=15)
        if result.returncode:
            raise RuntimeError('Enable HTTPS/Serve in your Tailscale account, then retry. ' + result.stdout[-350:])
    return 'https://' + dns + ':8443'


def install_service(owner_sid):
    if not ctypes.windll.shell32.IsUserAnAdmin():
        raise RuntimeError('Windows administrator approval is needed to install the background host.')
    # Do not replace an unrelated VNC installation or its credentials.
    existing = run(['sc.exe', 'query', 'tvnserver']).returncode == 0
    if existing and not (STATE / 'config.json').exists():
        raise RuntimeError('A TightVNC service already exists. Haven will not overwrite its configuration.')
    remote_url = tail_url()
    unattended=run([TAILSCALE,'set','--unattended=true'],timeout=15)
    if unattended.returncode:
        raise RuntimeError('Tailscale could not enable unattended mode. Check its Windows settings before completing background setup.')
    prior_wrapper=INSTALL/'HavenService.exe'
    if run(['sc.exe','query','HavenRemoteHost']).returncode==0:
        if not prior_wrapper.exists() or not (STATE/'config.json').exists():
            raise RuntimeError('A different service uses the Haven host name. Setup stopped without replacing it.')
        stopped=run([prior_wrapper,'stop'],timeout=45)
        if stopped.returncode:raise RuntimeError('Stop Haven Remote Host in Windows Services before updating.')
    INSTALL.mkdir(parents=True, exist_ok=True)
    STATE.mkdir(parents=True, exist_ok=True)
    # Service executables live under Program Files, not a user-writable directory.
    for name in ['server.mjs', 'public', 'node_modules', 'node.exe', 'HavenBridge.exe', 'HavenService.exe', 'licenses', 'THIRD_PARTY_NOTICES.md', 'LICENSE']:
        source, destination = PAYLOAD / name, INSTALL / name
        if source.is_dir():
            shutil.copytree(source, destination, dirs_exist_ok=True)
        else:
            shutil.copy2(source, destination)
    result = run(['icacls', STATE, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '*' + owner_sid + ':(OI)(CI)M'])
    if result.returncode:
        raise RuntimeError('Could not protect the host configuration folder. Setup stopped.')
    if not existing:
        result = run(['msiexec.exe', '/i', PAYLOAD / 'tightvnc.msi', '/qn', '/norestart', 'ADDLOCAL=Server',
                      'SERVER_REGISTER_AS_SERVICE=0', 'SERVER_ADD_FIREWALL_EXCEPTION=0',
                      'SET_LOOPBACKONLY=1', 'VALUE_OF_LOOPBACKONLY=1', 'SET_ALLOWLOOPBACK=1', 'VALUE_OF_ALLOWLOOPBACK=1',
                      'SET_ACCEPTHTTPCONNECTIONS=1', 'VALUE_OF_ACCEPTHTTPCONNECTIONS=0'], timeout=120)
        if result.returncode not in (0, 3010):
            raise RuntimeError('TightVNC installation failed (code %d).' % result.returncode)
    from Crypto.Cipher import DES
    passwords = [secrets.token_urlsafe(12)[:8] for _ in range(3)]
    # Standard VNC registry encoding. Only localhost can reach VNC; Haven/Tailscale secure external access.
    key = bytes(int(format(value, '08b')[::-1], 2) for value in [23, 82, 107, 6, 35, 78, 88, 7])
    with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\TightVNC\Server', 0, winreg.KEY_WRITE | winreg.KEY_WOW64_64KEY) as registry:
        for name, value in {'RfbPort':5908, 'LoopbackOnly':1, 'AllowLoopback':1, 'AcceptRfbConnections':1,
                            'AcceptHttpConnections':0, 'UseVncAuthentication':1, 'QueryTimeout':0,
                            'QueryAcceptOnTimeout':1, 'AlwaysShared':0, 'NeverShared':0, 'DisconnectAction':0, 'PollingInterval':60}.items():
            winreg.SetValueEx(registry, name, 0, winreg.REG_DWORD, value)
        for name, password in zip(['Password', 'PasswordViewOnly', 'ControlPassword'], passwords):
            winreg.SetValueEx(registry, name, 0, winreg.REG_BINARY, DES.new(key, DES.MODE_ECB).encrypt(password.encode('ascii')))
    config = {'remoteUrl':remote_url, 'vncPassword':passwords[0], 'vncViewPassword':passwords[1]}
    (STATE / 'config.json').write_text(json.dumps(config), encoding='utf-8')
    # Preserve previously paired phones and PIN if this is an update.
    source_security = Path(os.environ.get('LOCALAPPDATA', '')) / 'Haven' / 'security.json'
    if source_security.exists() and not (STATE / 'security.json').exists():
        shutil.copy2(source_security, STATE / 'security.json')
    tvnserver = Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'TightVNC' / 'tvnserver.exe'
    if not existing:
        registered = run([tvnserver, '-install', '-silent'], timeout=20)
        if registered.returncode:
            raise RuntimeError('Could not register TightVNC as a Windows service.')
    run(['sc.exe', 'config', 'tvnserver', 'start=', 'auto'])
    run(['sc.exe', 'start', 'tvnserver'])
    if existing:
        run(['sc.exe', 'stop', 'tvnserver']);time.sleep(2);run(['sc.exe', 'start', 'tvnserver'])
    content = '<service><id>HavenRemoteHost</id><name>Haven Remote Host</name><description>Private remote desktop for paired devices.</description>'
    content += '<executable>' + xml.escape(str(INSTALL / 'node.exe')) + '</executable><arguments>--max-old-space-size=96 "' + xml.escape(str(INSTALL / 'server.mjs')) + '"</arguments>'
    content += '<workingdirectory>' + xml.escape(str(INSTALL)) + '</workingdirectory><startmode>Automatic</startmode>'
    content += '<env name="HAVEN_STATE_DIR" value="' + xml.escape(str(STATE), {'"':'&quot;'}) + '"/>'
    content += '<env name="HAVEN_BRIDGE_EXE" value="' + xml.escape(str(INSTALL / 'HavenBridge.exe'), {'"':'&quot;'}) + '"/>'
    content += '<logpath>' + xml.escape(str(STATE / 'logs')) + '</logpath><log mode="roll-by-size"><sizeThreshold>1024</sizeThreshold><keepFiles>2</keepFiles></log>'
    content += '<onfailure action="restart" delay="5 sec"/></service>'
    (INSTALL / 'HavenService.xml').write_text(content, encoding='utf-8')
    service = INSTALL / 'HavenService.exe'
    installed = run(['sc.exe', 'query', 'HavenRemoteHost']).returncode == 0
    if not installed:
        result = run([service, 'install'], timeout=30)
        if result.returncode:
            raise RuntimeError('Haven service registration failed: ' + result.stderr[-250:])
    result = run([service, 'start'], timeout=30)
    if result.returncode and not installed:
        raise RuntimeError('Haven background host could not start: ' + result.stderr[-250:])
    (STATE / 'installed.ok').write_text('Background host installed.', encoding='utf-8')


class DesktopAPI:
    def install_background(self):
        global owned_process
        sid = run(['whoami', '/user', '/fo', 'csv', '/nh']).stdout.strip().split(',')[-1].strip('"')
        params = subprocess.list2cmdline(['--install-service', '--owner-sid', sid])
        if getattr(sys, 'frozen', False):
            result = ctypes.windll.shell32.ShellExecuteW(None, 'runas', sys.executable, params, str(PAYLOAD), 0)
            if result > 32:
                stop_owned()
                import threading
                def reopen():
                    for _ in range(240):
                        time.sleep(1)
                        try:
                            with urllib.request.urlopen('http://127.0.0.1:4318/api/info',timeout=2) as response:
                                if json.load(response).get('unattended'):
                                    import webview
                                    webview.windows[0].load_url((STATE/'host-url.txt').read_text(encoding='utf-8').strip())
                                    return
                        except Exception:
                            pass
                threading.Thread(target=reopen,daemon=True).start()
            return {'started':result > 32}
        return {'started':False, 'error':'Use the packaged Haven.exe for background setup.'}


def stop_owned():
    global owned_process
    if owned_process and owned_process.poll() is None:
        run(['taskkill.exe', '/PID', str(owned_process.pid), '/T', '/F'])
    owned_process = None


def install_gui_for_current_user():
    if not getattr(sys,'frozen',False):return
    directory=Path(os.environ.get('LOCALAPPDATA','.'))/'Programs'/'Haven'
    directory.mkdir(parents=True,exist_ok=True)
    target=directory/'Haven.exe'
    if Path(sys.executable).resolve()==target.resolve():return
    try:
        shutil.copy2(sys.executable,target)
        executable=str(target).replace("'","''")
        working=str(directory).replace("'","''")
        script="$shell=New-Object -ComObject WScript.Shell; foreach($folder in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('Desktop'))){if($folder){$link=$shell.CreateShortcut((Join-Path $folder 'Haven - Remote Desktop.lnk'));$link.TargetPath='"+executable+"';$link.WorkingDirectory='"+working+"';$link.IconLocation='"+executable+",0';$link.Save()}}"
        run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],timeout=15)
    except OSError:
        # Running portably remains supported if the user profile is read-only.
        pass


def launch():
    global owned_process
    import webview
    install_gui_for_current_user()
    local = Path(os.environ.get('LOCALAPPDATA', '.')) / 'Haven'
    local.mkdir(parents=True, exist_ok=True)
    state = STATE if (STATE / 'installed.ok').exists() else local
    try:
        with urllib.request.urlopen('http://127.0.0.1:4318/api/info', timeout=2) as response:
            info = json.load(response)
        # Source-development host may have a different state directory.
        host_file = state / 'host-url.txt'
        if not host_file.exists():
            host_file = Path.cwd() / '.runtime' / 'host-url.txt'
        url = host_file.read_text(encoding='utf-8').strip()
    except Exception:
        if (STATE / 'installed.ok').exists():
            run(['sc.exe', 'start', 'HavenRemoteHost'])
        else:
            remote_url = tail_url()
            env = os.environ.copy()
            env.update(HAVEN_STATE_DIR=str(local), HAVEN_REMOTE_URL=remote_url, HAVEN_BRIDGE_EXE=str(PAYLOAD / 'HavenBridge.exe'))
            node = PAYLOAD / 'node.exe'
            if not node.exists():
                node = Path(shutil.which('node'))
                env.pop('HAVEN_BRIDGE_EXE', None)
            owned_process = subprocess.Popen([str(node), str(PAYLOAD / 'server.mjs')], env=env, creationflags=HIDE)
        for _ in range(60):
            try:
                with urllib.request.urlopen('http://127.0.0.1:4318/api/info', timeout=1):
                    pass
                url = (state / 'host-url.txt').read_text(encoding='utf-8').strip()
                break
            except Exception:
                time.sleep(.25)
        else:
            raise RuntimeError('Haven could not start. Check that port 4318 is available.')
    atexit.register(stop_owned)
    webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
    webview.create_window('Haven · Your space. No distance.', url, js_api=DesktopAPI(), width=1320, height=920,
                          min_size=(820, 650), background_color='#0b0b14', text_select=False)
    webview.start(gui='edgechromium', private_mode=False, storage_path=str(local / 'webview'))


if __name__ == '__main__':
    try:
        if '--self-test' in sys.argv:
            import webview
            required=['server.mjs','public/index.html','public/app.js','public/polish.css','public/black.css','public/vendor/rfb.js','node.exe','HavenBridge.exe','HavenService.exe','tightvnc.msi','licenses/Node.txt']
            missing=[name for name in required if not (PAYLOAD/name).exists()]
            if missing:raise RuntimeError('Missing packaged assets: '+', '.join(missing))
            for name in ['server.mjs','public/app.js']:
                result=run([PAYLOAD/'node.exe','--check',PAYLOAD/name],timeout=15)
                if result.returncode:raise RuntimeError(result.stderr)
            result=run([PAYLOAD/'HavenBridge.exe'],input='{"id":1,"type":"capture"}\n',timeout=30)
            capture=json.loads(result.stdout.strip())
            if not capture.get('ok'):raise RuntimeError('Packaged capture test failed')
            from Crypto.Cipher import DES
            encrypted=DES.new(bytes(range(8)),DES.MODE_ECB).encrypt(b'HavenQA!')
            if DES.new(bytes(range(8)),DES.MODE_ECB).decrypt(encrypted)!=b'HavenQA!':raise RuntimeError('Packaged crypto test failed')
            report={'ok':True,'assets':len(required),'captureWidth':capture['width'],'captureHeight':capture['height'],'jpegBytes':len(capture['jpeg'])*3//4,'webview':'imported','nodeChecks':'passed','crypto':'passed'}
            Path(sys.argv[sys.argv.index('--self-test')+1]).write_text(json.dumps(report),encoding='utf-8')
        elif '--install-service' in sys.argv:
            install_service(sys.argv[sys.argv.index('--owner-sid') + 1])
            ctypes.windll.user32.MessageBoxW(None, 'Haven is ready in the background. Open Haven again to create your PIN and pair your phone.', 'Haven setup complete', 0x40)
        else:
            launch()
    except Exception as error:
        ctypes.windll.user32.MessageBoxW(None, str(error), 'Haven needs a moment', 0x10)
        sys.exit(1)
