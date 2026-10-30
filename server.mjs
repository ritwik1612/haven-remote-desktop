import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import {readFile, writeFile, mkdir,rename} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';
import net from 'node:net';
import {WebSocketServer} from 'ws';

const root = path.dirname(fileURLToPath(import.meta.url));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');
const fail = (status, message) => Object.assign(new Error(message), {status});
const localHost = host => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host || '');
const keys = new Set(['Enter','Backspace','Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Home','End','PageUp','PageDown','Insert','Control','Alt','Shift','Meta','Space',...Array.from({length:26},(_,i)=>String.fromCharCode(65+i)),...Array.from({length:10},(_,i)=>String(i)),...Array.from({length:12},(_,i)=>'F'+(i+1))]);

export class WindowsBridge {
  constructor() { this.child=null; this.pending=new Map(); this.nextId=0; this.chain=Promise.resolve();this.queued=0;this.idleTimer=null; }
  start() {
    if (this.child) return;
    const executable=process.env.HAVEN_BRIDGE_EXE||process.env.HAVEN_PYTHON||'python';
    const child=spawn(executable,process.env.HAVEN_BRIDGE_EXE?[]:['-u',path.join(root,'native','bridge.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
    createInterface({input:child.stdout}).on('line',line=>{
      try {const response=JSON.parse(line); const job=this.pending.get(response.id); if(job){clearTimeout(job.timer);this.pending.delete(response.id);response.ok?job.resolve(response):job.reject(new Error(response.error));}} catch {}
    });
    child.stderr.on('data',()=>{});
    const lost=()=>{for(const [id,job]of this.pending){if(job.child!==child)continue;clearTimeout(job.timer);job.reject(new Error('Windows capture service stopped. Restart Haven.'));this.pending.delete(id);}if(this.child===child)this.child=null;};
    child.on('error',lost);child.on('exit',lost);
  }
  send(command,guard=()=>true) {
    clearTimeout(this.idleTimer);
    if(this.queued>=24) return Promise.reject(new Error('Input queue is busy.'));
    this.queued++;
    const run=()=>new Promise((resolve,reject)=>{
      if(!guard())return reject(fail(401,'Session ended.'));
      this.start();const id=++this.nextId;
      const timer=setTimeout(()=>{this.pending.delete(id);this.child?.kill();reject(new Error('Windows did not respond. Unlock the laptop and retry.'));},10000);
      this.pending.set(id,{resolve,reject,timer,child:this.child});
      this.child.stdin.write(JSON.stringify({...command,id})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
    });
    const result=this.chain.then(run).finally(()=>{this.queued--;if(!this.queued&&this.child){this.idleTimer=setTimeout(()=>this.close(),30000);this.idleTimer.unref();}});this.chain=result.catch(()=>{});return result;
  }
  close(){clearTimeout(this.idleTimer);const child=this.child;this.child=null;child?.kill();}
}

export function createHaven({bridge=new WindowsBridge(), remoteUrl='', now=()=>Date.now(),security={devices:[]},persist=async()=>{},vncPassword='',vncViewPassword='',vncPort=5908,displays=async()=>null}={}) {
  const SESSION_MS=6*60*60*1000;
  security.devices ||= [];
  const sockets=new Set();
  const adminToken=secret(), adminHash=hash(adminToken);
  let pairing=null, session=null, frameBusy=false, nextPairAt=0, failures=0,pinFailures=0,pinLockedUntil=0;
  const audit=[]; const adminSessions=new Set();
  function record(message){audit.unshift({at:new Date(now()).toISOString(),message});audit.splice(40);}
  function end(reason){if(session){record(reason);session=null;for(const ws of sockets)ws.close(1008,'Session ended');if(!vncPassword)bridge.send({type:'release'}).catch(()=>{});}}
  function expire(){if(pairing&&pairing.expiresAt<=now())pairing=null;if(session&&session.expiresAt<=now())end('Session expired. Access removed.');}
  const timer=setInterval(expire,1000);timer.unref();
  function cookie(req,name){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return value?.slice(name.length+1)||'';}
  function cookieHeader(req,name,value,age){return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${localHost(req.headers.host)?'':'; Secure'}`;}
  function admin(req){if(!localHost(req.headers.host)||req.headers['x-forwarded-for']||req.headers['tailscale-user-login']||!adminSessions.has(hash(cookie(req,'dl_admin'))))throw fail(403,'Open the host dashboard on the laptop to manage access.');}
  function remote(req,approved=true){expire();if(!session||hash(cookie(req,'dl_remote'))!==session.tokenHash)throw fail(401,'Session ended. Enter your session PIN to reconnect.');if(approved&&session.status!=='approved')throw fail(403,'Waiting for approval on the laptop.');if(approved&&!session.pinAuthenticated)throw fail(403,'Enter your chosen session PIN on the paired phone.');return session;}
  function device(req){const tokenHash=hash(cookie(req,'dl_device'));return security.devices.find(d=>d.tokenHash===tokenHash);}
  async function save(){await persist(structuredClone(security));}
  function newSession(name,token,deviceHash,status='approved'){return {id:crypto.randomUUID(),name,tokenHash:hash(token),deviceHash,status,pinAuthenticated:status==='approved',mode:'control',createdAt:now(),expiresAt:now()+(status==='pending'?90000:SESSION_MS),lastSeen:now(),inputWindow:now(),inputCount:0,lastFrame:0};}
  function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(data));}
  async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw fail(413,'Request too large.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw fail(400,'Invalid request.');}}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
    try {
      expire(); const url=new URL(req.url,'http://localhost'); const route=url.pathname;
      const host=req.headers.host||'';
      if(!localHost(host)&&(!remoteUrl||host!==new URL(remoteUrl).host))throw fail(403,'Unknown host. Use your private Haven address.');
      if(req.method==='POST'){
        let origin;try{origin=new URL(req.headers.origin);}catch{throw fail(403,'A same-origin browser request is required.');}
        if(origin.host!==host||(!localHost(host)&&origin.protocol!=='https:'))throw fail(403,'Cross-origin requests are blocked.');
        if(req.headers['content-type']?.split(';')[0]!=='application/json')throw fail(415,'JSON is required.');
      }
      if(req.method==='GET'&&route==='/api/info')return json(res,200,{name:os.hostname(),platform:'Windows',local:localHost(host),remoteUrl,version:'0.1.2',backend:vncPassword?'vnc':'capture',unattended:!!vncPassword,pinConfigured:!!security.pinHash});
      if(req.method==='GET'&&route==='/api/device'){const d=device(req);return json(res,200,{paired:!!d,name:d?.name,pinConfigured:!!security.pinHash},d?{'Set-Cookie':cookieHeader(req,'dl_device',cookie(req,'dl_device'),31536000)}:{});}
      if(req.method==='GET'&&route==='/api/displays'){remote(req);let layout=null;try{layout=await displays();}catch{}return json(res,200,layout);}
      if(req.method==='POST'&&route==='/api/unlock'){
        if(now()<pinLockedUntil)throw fail(429,'Too many incorrect PINs. Try again in 15 minutes.');
        const d=device(req);if(!d)throw fail(403,'Pair this phone on the laptop before using a session PIN.');
        const data=await body(req);let valid=false;
        if(security.pinHash&&typeof data.pin==='string'&&/^\d{6}$/.test(data.pin)){
          const actual=crypto.scryptSync(data.pin,security.pinSalt,32);valid=crypto.timingSafeEqual(actual,Buffer.from(security.pinHash,'hex'));
        }
        if(!valid){if(++pinFailures>=5){pinLockedUntil=now()+15*60*1000;pinFailures=0;}throw fail(403,'Incorrect PIN, or no PIN has been set on the laptop.');}
        pinFailures=0;end('A new PIN session replaced the previous session.');const token=secret();session=newSession(d.name,token,d.tokenHash);session.mode=d.mode||'control';d.lastUsed=now();await save();record(`${d.name} unlocked a six-hour session.`);
        return json(res,200,{status:'approved',expiresAt:session.expiresAt},{'Set-Cookie':cookieHeader(req,'dl_remote',token,SESSION_MS/1000)});
      }
      if(req.method==='POST'&&route==='/api/admin/login'){
        if(!localHost(host)||req.headers['x-forwarded-for']||req.headers['tailscale-user-login'])throw fail(403,'Host access is local only.');
        const data=await body(req);if(typeof data.token!=='string'||hash(data.token)!==adminHash)throw fail(403,'Use the host dashboard link from Start Haven.');
        const token=secret();adminSessions.add(hash(token));return json(res,200,{ok:true},{'Set-Cookie':cookieHeader(req,'dl_admin',token,86400)});
      }
      if(route.startsWith('/api/admin/')){
        admin(req);
        if(req.method==='GET'&&route==='/api/admin/state')return json(res,200,{pairing:pairing?{code:pairing.code,expiresAt:pairing.expiresAt}:null,session:session?{id:session.id,name:session.name,status:session.status,mode:session.mode,createdAt:session.createdAt,expiresAt:session.expiresAt,deviceId:security.devices.find(d=>d.tokenHash===session.deviceHash)?.id,connected:vncPassword?[...sockets].some(ws=>ws.session===session&&ws.readyState===1):session.lastFrame>0&&now()-session.lastFrame<5000}:null,audit,remoteUrl,pinConfigured:!!security.pinHash,devices:security.devices.map(({id,name,lastUsed})=>({id,name,lastUsed}))});
        if(req.method==='POST'&&route==='/api/admin/pin'){
          const {pin}=await body(req);if(typeof pin!=='string'||!/^\d{6}$/.test(pin))throw fail(400,'Choose a PIN containing exactly six digits.');
          security.pinSalt=secret();security.pinHash=crypto.scryptSync(pin,security.pinSalt,32).toString('hex');pinFailures=0;pinLockedUntil=0;await save();end('Session PIN changed. Previous access ended.');record('Your six-digit session PIN was saved.');return json(res,200,{ok:true});
        }
        if(req.method==='POST'&&route==='/api/admin/forget'){
          const data=await body(req);const d=security.devices.find(d=>d.id===data.id);if(!d)throw fail(404,'Device not found.');security.devices=security.devices.filter(item=>item!==d);if(session?.deviceHash===d.tokenHash)end('Paired device removed.');await save();record(`${d.name} removed from paired devices.`);return json(res,200,{ok:true});
        }
        if(req.method==='POST'&&route==='/api/admin/pair'){
          if(session)throw fail(409,'Disconnect the current device before pairing another.');
          pairing={code:String(crypto.randomInt(0,1000000)).padStart(6,'0'),expiresAt:now()+120000};
          failures=0;nextPairAt=0;record('A new pairing code was created.');return json(res,200,pairing);
        }
        if(req.method==='POST'&&route==='/api/admin/approve'){
          const data=await body(req);if(!session||session.status!=='pending'||data.id!==session.id)throw fail(409,'This request has expired.');
          if(!['view','control'].includes(data.mode))throw fail(400,'Select an access mode.');
          session.status='approved';session.mode=data.mode;session.expiresAt=now()+SESSION_MS;session.lastSeen=now();
          if(session.deviceHash){security.devices.push({id:crypto.randomUUID(),name:session.name,tokenHash:session.deviceHash,mode:session.mode,lastUsed:now()});await save();}
          record(`${session.name} paired and approved for ${data.mode==='control'?'screen and input':'view only'}.`);return json(res,200,{ok:true});
        }
        if(req.method==='POST'&&route==='/api/admin/revoke'){pairing=null;end('Access revoked on the laptop.');return json(res,200,{ok:true});}
        if(req.method==='GET'&&route==='/api/admin/qr'){
          if(!remoteUrl)throw fail(409,'Set up the private connection first.');const svg=await QRCode.toString(remoteUrl+'/connect'+(pairing?'#pair='+pairing.code:''),{type:'svg',margin:1,color:{dark:'#15283f',light:'#ffffff'}});res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(svg);
        }
      }
      if(req.method==='POST'&&route==='/api/pair'){
        if(now()<nextPairAt)throw fail(429,'Too many attempts. Wait one minute or create a new code on the laptop.');
        const data=await body(req);
        if(!pairing||typeof data.code!=='string'||hash(data.code)!==hash(pairing.code)){
          failures++;if(failures>=5)nextPairAt=now()+60000;
          throw fail(403,'That code is incorrect or expired. Generate a new code on the laptop.');
        }
        if(session)throw fail(409,'Another device is already connected.');
        const name=String(data.name||'iPhone').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,50)||'iPhone';
        const trusted=device(req);if(trusted){pairing=null;return json(res,200,{status:'paired'});}
        const token=secret(),deviceToken=secret();session=newSession(name,token,hash(deviceToken),'pending');session.mode='view';
        pairing=null;record(`${name} requested access. Awaiting laptop approval.`);return json(res,200,{status:'pending'},{'Set-Cookie':[cookieHeader(req,'dl_remote',token,SESSION_MS/1000),cookieHeader(req,'dl_device',deviceToken,365*86400)]});
      }
      if(req.method==='GET'&&route==='/api/session'){const s=remote(req,false);return json(res,200,{status:s.status==='approved'&&!s.pinAuthenticated?'paired':s.status,name:s.name,mode:s.mode,expiresAt:s.expiresAt});}
      if(req.method==='GET'&&route==='/api/vnc'){const s=remote(req);if(!vncPassword)throw fail(409,'Install the background host to enable VNC.');return json(res,200,{password:s.mode==='view'?vncViewPassword:vncPassword,expiresAt:s.expiresAt});}
      if(req.method==='POST'&&route==='/api/disconnect'){remote(req,false);end('Device disconnected.');return json(res,200,{ok:true},{'Set-Cookie':cookieHeader(req,'dl_remote','',0)});}
      if(req.method==='GET'&&route==='/api/frame'){
        if(vncPassword)throw fail(409,'This host uses the VNC stream.');
        const s=remote(req);if(frameBusy||now()-s.lastFrame<60)throw fail(429,'Please wait for the next frame.');s.lastFrame=now();s.lastSeen=now();frameBusy=true;
        try{const frame=await bridge.send({type:'capture'},()=>session===s&&s.expiresAt>now());if(session!==s||s.status!=='approved')throw fail(401,'Session ended.');
          res.writeHead(200,{'Content-Type':'image/jpeg','X-Screen-Width':String(frame.width),'X-Screen-Height':String(frame.height)});return res.end(Buffer.from(frame.jpeg,'base64'));
        }finally{frameBusy=false;}
      }
      if(req.method==='POST'&&route==='/api/input'){
        if(vncPassword)throw fail(409,'This host uses VNC input.');
        const s=remote(req);if(s.mode!=='control')throw fail(403,'This session is view only.');
        if(now()-s.inputWindow>=1000){s.inputWindow=now();s.inputCount=0;}if(++s.inputCount>40)throw fail(429,'Input rate exceeded.');
        const data=await body(req);let command;
        if(data.type==='pointer'&&Number.isFinite(data.x)&&Number.isFinite(data.y)&&data.x>=0&&data.x<=1&&data.y>=0&&data.y<=1&&['move','click','right','down','up'].includes(data.action))command={type:'pointer',x:data.x,y:data.y,action:data.action};
        if(data.type==='text'&&typeof data.text==='string'&&data.text.length<=500)command={type:'text',text:data.text};
        if(data.type==='scroll'&&Number.isInteger(data.delta)&&Math.abs(data.delta)<=600)command={type:'scroll',delta:data.delta};
        if(data.type==='keys'&&Array.isArray(data.keys)&&data.keys.length>0&&data.keys.length<=4&&data.keys.every(k=>keys.has(k)))command={type:'keys',keys:data.keys};
        if(!command)throw fail(400,'Unsupported input.');s.lastSeen=now();
        // Recheck authorization when this command reaches the native queue.
        if(session!==s)throw fail(401,'Session ended.');await bridge.send(command,()=>session===s&&s.status==='approved'&&s.mode==='control'&&s.expiresAt>now());return json(res,200,{ok:true});
      }
      if(req.method==='GET'&&/^\/vendor\/[A-Za-z0-9._-]+\.(js|txt)$/.test(route)){
        const file=path.join(root,'public','vendor',path.basename(route));
        try{const data=await readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/plain; charset=utf-8'});return res.end(data);}catch{throw fail(404,'Not found.');}
      }
      if(req.method==='GET'&&route.startsWith('/vendor/novnc/')){
        const base=path.join(root,'node_modules','@novnc','novnc');const file=path.resolve(base,decodeURIComponent(route.slice('/vendor/novnc/'.length)));
        if(!file.startsWith(base+path.sep)||!file.endsWith('.js'))throw fail(404,'Not found.');
        const data=await readFile(file);res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(data);
      }
      const assets={'/':'index.html','/connect':'index.html','/app.js':'app.js','/style.css':'style.css','/polish.css':'polish.css','/black.css':'black.css','/remote.css':'remote.css','/qr.css':'qr.css','/qr-scanner.js':'qr-scanner.js','/remote-view.js':'remote-view.js','/vendor/rfb.js':'vendor/rfb.js','/vendor/rfb.js.LEGAL.txt':'vendor/rfb.js.LEGAL.txt','/icon.svg':'icon.svg','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/offline.html':'offline.html','/apple-touch-icon.png':'apple-touch-icon.png','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
      if(req.method==='GET'&&assets[route]){const file=assets[route],data=await readFile(path.join(root,'public',file));const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8'})[ext]});return res.end(data);}
      throw fail(404,'Not found.');
    }catch(error){if(!res.headersSent)json(res,error.status||503,{error:error.status?error.message:'The Windows host is unavailable. Unlock the laptop or restart Haven.'});else res.end();}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:1048576,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    try{
      const host=req.headers.host||'',origin=new URL(req.headers.origin);
      if(!vncPassword||req.url!=='/api/vnc/socket'||origin.host!==host||(!localHost(host)&&(origin.protocol!=='https:'||host!==new URL(remoteUrl).host)))throw new Error('Denied');
      const s=remote(req);if([...sockets].some(ws=>ws.session===s))throw new Error('Session is already open');
      wss.handleUpgrade(req,socket,head,ws=>{
        ws.session=s;sockets.add(ws);const tcp=net.connect(vncPort,'127.0.0.1');tcp.setNoDelay(true);
        const close=()=>{sockets.delete(ws);tcp.destroy();ws.close();};
        ws.on('message',data=>{if(session!==s||s.expiresAt<=now())return close();if(!tcp.write(data))ws._socket?.pause();});tcp.on('drain',()=>ws._socket?.resume());
        tcp.on('data',data=>{if(session!==s||s.expiresAt<=now())return close();if(ws.readyState===1){if(ws.bufferedAmount>2*1024*1024){tcp.pause();setTimeout(()=>tcp.resume(),25);}ws.send(data);}});
        tcp.on('error',()=>{ws.close(1011,'Desktop service is unavailable');close();});tcp.on('close',close);ws.on('close',close);ws.on('error',close);
      });
    }catch{socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();}
  });
  server.on('close',()=>{clearInterval(timer);for(const ws of sockets)ws.terminate();wss.close();bridge.close();});
  server.requestTimeout=15000;server.headersTimeout=10000;
  return {server,adminToken,setRemoteUrl(url){remoteUrl=url;}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const port=Number(process.env.PORT||4318);
  const stateDir=process.env.HAVEN_STATE_DIR||path.join(root,'.runtime');await mkdir(stateDir,{recursive:true});
  let config={};try{config=JSON.parse(await readFile(path.join(stateDir,'config.json'),'utf8'));}catch{}
  let security={devices:[]};try{security=JSON.parse(await readFile(path.join(stateDir,'security.json'),'utf8'));}catch{}
  let saving=Promise.resolve();
  const app=createHaven({displays:async()=>JSON.parse(await readFile(path.join(stateDir,'display-layout.json'),'utf8')),remoteUrl:process.env.HAVEN_REMOTE_URL||config.remoteUrl||'',security,vncPassword:config.vncPassword||'',vncViewPassword:config.vncViewPassword||'',persist:async value=>{const task=saving.then(async()=>{const target=path.join(stateDir,'security.json');await writeFile(target+'.tmp',JSON.stringify(value));await rename(target+'.tmp',target);});saving=task.catch(()=>{});await task;}});
  app.server.listen(port,'127.0.0.1',async()=>{
    const url=`http://127.0.0.1:${port}/#host=${app.adminToken}`;
    await mkdir(stateDir,{recursive:true});await writeFile(path.join(stateDir,'host-url.txt'),url);
    console.log(`Haven is running on http://127.0.0.1:${port}`);
    console.log('Start Haven.cmd opens the private host dashboard.');
    if(process.env.HAVEN_REMOTE_URL)console.log(`iPhone: ${process.env.HAVEN_REMOTE_URL}/connect`);
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.server.close(()=>process.exit()));
}
