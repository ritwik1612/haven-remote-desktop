import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHaven,WindowsBridge} from '../server.mjs';

async function fixture(t,options={}){
  let time=Date.now(),lastDevice;const commands=[];
  const bridge={async send(command,guard=()=>true){if(!guard())throw new Error('Session ended');commands.push(command);return {ok:true,jpeg:Buffer.from([255,216,255,217]).toString('base64'),width:1920,height:1080};},close(){}};
  const security={devices:[]};let stored;
  const app=createHaven({bridge,now:()=>time,remoteUrl:'https://desk.tailnet.ts.net:8443',security,persist:async data=>{stored=data;},...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(route,{data,cookie,headers={}}={}){
    return new Promise((resolve,reject)=>{
      const req=http.request(base+route,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{Origin:base,'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const buffer=Buffer.concat(chunks);const responseHeaders=new Headers();for(const [name,value] of Object.entries(res.headers))for(const item of Array.isArray(value)?value:[value])if(item!==undefined)responseHeaders.append(name,item);resolve({status:res.statusCode,headers:responseHeaders,async json(){return JSON.parse(buffer.toString());},async text(){return buffer.toString();}});});
      });req.on('error',reject);if(data!==undefined)req.write(JSON.stringify(data));req.end();
    });
  }
  const login=await request('/api/admin/login',{data:{token:app.adminToken}});
  const admin=login.headers.get('set-cookie').split(';')[0];
  async function code(){const response=await request('/api/admin/pair',{data:{},cookie:admin});assert.equal(response.status,200);return (await response.json()).code;}
  async function pair(){await request('/api/admin/pin',{cookie:admin,data:{pin:'824617'}});return (await pairDevice()).cookie;}
  async function pairDevice(){const response=await request('/api/pair',{data:{code:await code(),name:'Test iPhone'}});assert.equal(response.status,200);const cookies=response.headers.getSetCookie();lastDevice=cookies.find(c=>c.startsWith('dl_device=')).split(';')[0];return {cookie:cookies.find(c=>c.startsWith('dl_remote=')).split(';')[0],device:lastDevice};}
  async function unlock(pin='824617'){if(!security.pinHash)await request('/api/admin/pin',{cookie:admin,data:{pin}});const response=await request('/api/unlock',{cookie:lastDevice,data:{pin}});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
  async function approve(mode='control'){const response=await request('/api/admin/state',{cookie:admin});const state=await response.json();return request('/api/admin/approve',{cookie:admin,data:{id:state.session.id,mode}});}
  return {request,admin,code,pair,pairDevice,approve,unlock,commands,security,get stored(){return stored;},advance(ms){time+=ms;}};
}

test('unauthenticated visitors cannot see frames, send input, or manage pairing',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/frame')).status,401);
  assert.equal((await f.request('/api/displays')).status,401);
  assert.equal((await f.request('/api/input',{data:{type:'text',text:'hello'}})).status,401);
  assert.equal((await f.request('/api/admin/state')).status,403);
  assert.equal((await f.request('/api/admin/pair',{data:{}})).status,403);
  assert.equal(f.commands.length,0);
});
test('a valid pairing code never grants screen access without laptop approval',async t=>{
  const f=await fixture(t);let cookie=await f.pair();
  assert.equal((await f.request('/api/session',{cookie})).status,200);
  assert.equal((await f.request('/api/frame',{cookie})).status,403);
  assert.equal((await f.request('/api/input',{cookie,data:{type:'text',text:'no'}})).status,403);
  assert.equal(f.commands.length,0);
  assert.equal((await f.approve()).status,200);
  assert.equal((await f.request('/api/frame',{cookie})).status,403);cookie=await f.unlock();
  assert.equal((await f.request('/api/frame',{cookie})).status,200);
  assert.equal((await f.request('/api/input',{cookie,data:{type:'text',text:'hello'}})).status,200);
  assert.deepEqual(f.commands.filter(c=>c.type!=='release').map(c=>c.type),['capture','text']);
});
test('paired phones without a PIN stay paired; display layout requires an approved unexpired session',async t=>{
  const layout={width:3840,height:1080,screens:[{x:0,y:0,width:1920,height:1080},{x:1920,y:0,width:1920,height:1080}]};
  const f=await fixture(t,{displays:async()=>layout});let {cookie,device}=await f.pairDevice();
  assert.equal((await f.request('/api/displays',{cookie})).status,403);
  await f.approve();
  const paired=await f.request('/api/device',{cookie:device});
  assert.deepEqual(await paired.json(),{paired:true,name:'Test iPhone',pinConfigured:false});
  assert.match(paired.headers.get('set-cookie'),/Max-Age=31536000/);
  assert.equal((await f.request('/api/displays',{cookie})).status,403);cookie=await f.unlock();
  assert.deepEqual(await (await f.request('/api/displays',{cookie})).json(),layout);
  f.advance(21600001);
  assert.equal((await f.request('/api/displays',{cookie})).status,401);
  assert.equal((await (await f.request('/api/device',{cookie:device})).json()).paired,true);
});
test('a fresh QR never bypasses the chosen PIN, including after laptop approval and on an already paired phone',async t=>{
  const f=await fixture(t);const {device,cookie}=await f.pairDevice();await f.approve();
  assert.equal((await (await f.request('/api/session',{cookie})).json()).status,'paired');
  assert.equal((await f.request('/api/frame',{cookie})).status,403);
  assert.equal((await f.request('/api/input',{cookie,data:{type:'keys',keys:['Meta']}})).status,403);
  await f.request('/api/admin/revoke',{cookie:f.admin,data:{}});
  const code=await f.code();const response=await f.request('/api/pair',{cookie:device,data:{code}});
  assert.equal((await response.json()).status,'paired');assert.equal(response.headers.get('set-cookie'),null);
  assert.equal((await f.request('/api/frame',{cookie})).status,401);
  assert.equal(f.security.devices.length,1);
  assert.equal((await f.request('/api/pair',{cookie:device,data:{code}})).status,403);
  const unlocked=await f.unlock();assert.equal((await f.request('/api/frame',{cookie:unlocked})).status,200);
});
test('view-only permission is enforced by the server',async t=>{
  const f=await fixture(t);let cookie=await f.pair();await f.approve('view');cookie=await f.unlock();
  assert.equal((await f.request('/api/frame',{cookie})).status,200);
  assert.equal((await f.request('/api/input',{cookie,data:{type:'pointer',x:.5,y:.5,action:'click'}})).status,403);
  assert.equal(f.commands.some(c=>c.type==='pointer'),false);
});
test('revocation invalidates an approved session and prevents reuse',async t=>{
  const f=await fixture(t);let cookie=await f.pair();await f.approve();cookie=await f.unlock();
  await f.request('/api/admin/revoke',{cookie:f.admin,data:{}});
  assert.equal((await f.request('/api/frame',{cookie})).status,401);
  assert.equal((await f.request('/api/input',{cookie,data:{type:'keys',keys:['Enter']}})).status,401);
});
test('codes expire after two minutes and cannot be reused',async t=>{
  const f=await fixture(t);const stale=await f.code();f.advance(120001);
  assert.equal((await f.request('/api/pair',{data:{code:stale}})).status,403);
  const code=await f.code();assert.equal((await f.request('/api/pair',{data:{code}})).status,200);
  assert.equal((await f.request('/api/pair',{data:{code}})).status,403);
});
test('five failed guesses trigger a global one-minute lockout',async t=>{
  const f=await fixture(t);const code=await f.code();
  for(let n=0;n<5;n++)assert.equal((await f.request('/api/pair',{data:{code:'invalid'}})).status,403);
  assert.equal((await f.request('/api/pair',{data:{code}})).status,429);
  f.advance(60001);assert.equal((await f.request('/api/pair',{data:{code}})).status,200);
});
test('cross-origin requests, unknown hosts, and tunneled admin logins are blocked',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/admin/pair',{cookie:f.admin,data:{},headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.request('/api/info',{headers:{Host:'evil.example'}})).status,403);
  assert.equal((await f.request('/api/admin/state',{cookie:f.admin,headers:{Host:'desk.tailnet.ts.net:8443'}})).status,403);
  assert.equal((await f.request('/api/admin/state',{cookie:f.admin,headers:{'X-Forwarded-For':'100.1.2.3'}})).status,403);
});
test('private HTTPS clients receive HttpOnly Secure session cookies',async t=>{
  const f=await fixture(t);const code=await f.code();
  const response=await f.request('/api/pair',{data:{code},headers:{Host:'desk.tailnet.ts.net:8443',Origin:'https://desk.tailnet.ts.net:8443'}});
  assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/; Secure/);
});
test('pending sessions expire; approved sessions remain usable for exactly six hours',async t=>{
  const f=await fixture(t);let cookie=await f.pair();f.advance(90001);
  assert.equal((await f.request('/api/session',{cookie})).status,401);
  cookie=await f.pair();await f.approve();cookie=await f.unlock();f.advance(30001);
  assert.equal((await f.request('/api/frame',{cookie})).status,200);
  f.advance(6*60*60*1000-30001-1);
  assert.equal((await f.request('/api/session',{cookie})).status,200);
  f.advance(1);
  assert.equal((await f.request('/api/session',{cookie})).status,401);
});
test('pairing persists a hashed device credential and a hashed PIN; paired phones unlock without approval',async t=>{
  const f=await fixture(t);const {device}=await f.pairDevice();
  assert.equal((await (await f.request('/api/device',{cookie:device})).json()).paired,false);
  await f.approve();
  assert.equal((await (await f.request('/api/device',{cookie:device})).json()).paired,true);
  const pinResponse=await f.request('/api/admin/pin',{cookie:f.admin,data:{pin:'824617'}});const pin='824617';assert.deepEqual(await pinResponse.json(),{ok:true});
  assert.match(pin,/^\d{6}$/);assert.ok(f.stored.pinHash);assert.notEqual(f.stored.pinHash,pin);
  assert.ok(f.stored.devices[0].tokenHash);assert.equal(JSON.stringify(f.stored).includes(device.split('=')[1]),false);
  const response=await f.request('/api/unlock',{cookie:device,data:{pin}});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];const session=await (await f.request('/api/session',{cookie})).json();
  assert.equal(session.status,'approved');assert.equal(session.mode,'control');
  assert.equal((await f.request('/api/frame',{cookie})).status,200);
});
test('a PIN alone is insufficient; PIN brute-force lockout lasts fifteen minutes',async t=>{
  const f=await fixture(t),{device}=await f.pairDevice();await f.approve();
  const pin='824617';assert.equal((await f.request('/api/admin/pin',{cookie:f.admin,data:{pin}})).status,200);
  assert.equal((await f.request('/api/unlock',{data:{pin}})).status,403);
  for(let n=0;n<5;n++)assert.equal((await f.request('/api/unlock',{cookie:device,data:{pin:'bad'}})).status,403);
  assert.equal((await f.request('/api/unlock',{cookie:device,data:{pin}})).status,429);
  f.advance(15*60*1000+1);assert.equal((await f.request('/api/unlock',{cookie:device,data:{pin}})).status,200);
});
test('forgetting a paired device blocks future PIN access',async t=>{
  const f=await fixture(t),{device}=await f.pairDevice();await f.approve();
  const pin='824617';assert.equal((await f.request('/api/admin/pin',{cookie:f.admin,data:{pin}})).status,200);
  const id=f.security.devices[0].id;
  assert.equal((await f.request('/api/admin/forget',{cookie:f.admin,data:{id}})).status,200);
  assert.equal((await f.request('/api/unlock',{cookie:device,data:{pin}})).status,403);
});
test('session PINs are chosen by the user, six digits only, and are never returned by the API',async t=>{
  const f=await fixture(t);
  for(const pin of [undefined,'12345','1234567','abcdef',123456])assert.equal((await f.request('/api/admin/pin',{cookie:f.admin,data:{pin}})).status,400);
  const response=await f.request('/api/admin/pin',{cookie:f.admin,data:{pin:'007315'}});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.equal(JSON.stringify(f.stored).includes('007315'),false);
});
test('persisted pairing and PIN survive a host restart while old sessions do not',async t=>{
  const first=await fixture(t),{device,cookie}=await first.pairDevice();await first.approve();
  await first.request('/api/admin/pin',{cookie:first.admin,data:{pin:'007315'}});
  const restarted=await fixture(t,{security:structuredClone(first.stored)});
  assert.equal((await restarted.request('/api/session',{cookie})).status,401);
  assert.equal((await (await restarted.request('/api/device',{cookie:device})).json()).paired,true);
  assert.equal((await restarted.request('/api/unlock',{cookie:device,data:{pin:'007315'}})).status,200);
});
test('Win+L and Ctrl+Shift+Escape are sent as a single command with all keys together',async t=>{
  const f=await fixture(t);let cookie=await f.pair();await f.approve();cookie=await f.unlock();
  for(const keys of [['Meta','L'],['Control','Shift','Escape'],['Alt','Tab'],['Control','C'],['F12']])assert.equal((await f.request('/api/input',{cookie,data:{type:'keys',keys}})).status,200);
  const sent=f.commands.filter(c=>c.type==='keys');assert.deepEqual(sent[0],{type:'keys',keys:['Meta','L']});assert.deepEqual(sent[1],{type:'keys',keys:['Control','Shift','Escape']});
});
test('VNC credentials require approval and use a separate password for view-only mode',async t=>{
  const f=await fixture(t,{vncPassword:'control-secret',vncViewPassword:'view-secret'});
  assert.equal((await f.request('/api/vnc')).status,401);let cookie=await f.pair();
  assert.equal((await f.request('/api/vnc',{cookie})).status,403);await f.approve('view');assert.equal((await f.request('/api/vnc',{cookie})).status,403);cookie=await f.unlock();
  const data=await (await f.request('/api/vnc',{cookie})).json();assert.equal(data.password,'view-secret');assert.equal(JSON.stringify(data).includes('control-secret'),false);
});
test('input validation rejects arbitrary commands and out-of-bounds coordinates',async t=>{
  const f=await fixture(t);let cookie=await f.pair();await f.approve();cookie=await f.unlock();
  for(const data of [{type:'shell',command:'anything'},{type:'pointer',x:10,y:.5,action:'click'},{type:'keys',keys:['Unknown']},{type:'text',text:'a'.repeat(501)}]){
    assert.equal((await f.request('/api/input',{cookie,data})).status,400);
  }
  assert.equal(f.commands.filter(c=>c.type!=='release').length,0);
});
test('native commands whose authorization was revoked in the queue never execute',async()=>{
  const bridge=new WindowsBridge();await assert.rejects(bridge.send({type:'text',text:'must not type'},()=>false),/Session ended/);assert.equal(bridge.child,null);
});
test('PWA assets load and the service worker excludes API responses',async t=>{
  const f=await fixture(t);const manifest=await (await f.request('/manifest.webmanifest')).json();
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/connect');
  for(const icon of ['/apple-touch-icon.png','/icon-192.png','/icon-512.png'])assert.equal((await f.request(icon)).headers.get('content-type'),'image/png');
  const sw=await (await f.request('/sw.js')).text();assert.match(sw,/pathname\.startsWith\('\/api\/'\)/);
});
