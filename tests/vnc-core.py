"""Read-only integration check against the unmodified TightVNC binary in app mode.
No mouse or keyboard input is sent. Original per-user registry values are restored.
"""
from pathlib import Path
import json
import secrets
import socket
import struct
import subprocess
import time
import winreg
from Crypto.Cipher import DES

ROOT=Path(__file__).resolve().parents[1]
binary=ROOT/'.build/tightvnc-extracted/PFiles/TightVNC/tvnserver.exe'
running=subprocess.check_output(['tasklist','/FI','IMAGENAME eq tvnserver.exe','/FO','CSV','/NH'],creationflags=subprocess.CREATE_NO_WINDOW).decode(errors='replace')
if '"tvnserver.exe"' in running.lower():raise RuntimeError('An existing TightVNC process is running. Read-only test skipped to preserve it.')
password=secrets.token_urlsafe(12)[:8]
key=bytes(int(format(b,'08b')[::-1],2) for b in [23,82,107,6,35,78,88,7])
settings={'RfbPort':5908,'LoopbackOnly':1,'AllowLoopback':1,'AcceptRfbConnections':1,'AcceptHttpConnections':0,'UseVncAuthentication':1,'QueryTimeout':0,'QueryAcceptOnTimeout':1,'DisconnectAction':0}
original={};process=None
registry=winreg.CreateKey(winreg.HKEY_CURRENT_USER,r'SOFTWARE\TightVNC\Server')
try:
    for name in [*settings,'Password']:
        try:original[name]=winreg.QueryValueEx(registry,name)
        except FileNotFoundError:original[name]=None
    for name,value in settings.items():winreg.SetValueEx(registry,name,0,winreg.REG_DWORD,value)
    winreg.SetValueEx(registry,'Password',0,winreg.REG_BINARY,DES.new(key,DES.MODE_ECB).encrypt(password.encode()))
    process=subprocess.Popen([str(binary),'-run'],creationflags=subprocess.CREATE_NO_WINDOW,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:connection=socket.create_connection(('127.0.0.1',5908),timeout=2);break
        except OSError:time.sleep(.2)
    else:raise RuntimeError('TightVNC did not start on loopback.')
    connection.settimeout(10)
    def read(n):
        data=b''
        while len(data)<n:
            chunk=connection.recv(n-len(data))
            if not chunk:raise RuntimeError('VNC closed the connection.')
            data+=chunk
        return data
    version=read(12).decode().strip();connection.sendall(b'RFB 003.008\n')
    types=read(read(1)[0]);assert 2 in types,'Password authentication is not offered'
    connection.sendall(b'\x02');challenge=read(16)
    response_key=bytes(int(format(b,'08b')[::-1],2) for b in password.encode())
    connection.sendall(DES.new(response_key,DES.MODE_ECB).encrypt(challenge))
    assert struct.unpack('>I',read(4))[0]==0,'VNC password encoding/authentication failed'
    connection.sendall(b'\x01');initial=read(24);width,height=struct.unpack('>HH',initial[:4]);name=read(struct.unpack('>I',initial[20:24])[0])
    connection.sendall(struct.pack('>BBHi',2,0,1,0))
    connection.sendall(struct.pack('>BBHHHH',3,0,0,0,64,64))
    message=read(4);assert message[0]==0,'Expected framebuffer update'
    rectangles=struct.unpack('>H',message[2:4])[0];pixel_bytes=0
    for _ in range(rectangles):
        rectangle=read(12);x,y,w,h,encoding=struct.unpack('>HHHHi',rectangle)
        assert encoding==0,'Unexpected non-raw rectangle'
        pixels=read(w*h*(initial[4]//8));pixel_bytes+=len(pixels)
    connection.close()
    report={'ok':True,'protocol':version,'passwordAuthentication':'passed','desktopWidth':width,'desktopHeight':height,'framebufferBytes':pixel_bytes,'nativeInputSent':False,'mode':'app; Windows service and locked-screen path still need installation verification'}
    (ROOT/'.runtime/vnc-test.json').write_text(json.dumps(report),encoding='utf-8');print(json.dumps(report))
    import sys
    if '--browser' in sys.argv:
        config=ROOT/'.runtime/vnc-browser-config.json'
        config.write_text(json.dumps({'vncPassword':password,'vncViewPassword':password}),encoding='utf-8')
        try:subprocess.run(['node',str(ROOT/'tests/vnc-preview.mjs')],cwd=ROOT,check=True)
        finally:config.unlink(missing_ok=True)
finally:
    if process:
        process.terminate()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait()
    for name,value in original.items():
        if value is None:
            try:winreg.DeleteValue(registry,name)
            except FileNotFoundError:pass
        else:winreg.SetValueEx(registry,name,0,value[1],value[0])
    winreg.CloseKey(registry)
