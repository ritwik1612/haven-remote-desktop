import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {parseHavenQr} from '../public/qr-scanner.js';

test('Haven QR decoding works locally with a generated laptop pairing QR',()=>{
  const value='https://pc.tailnet.ts.net:8443/connect#pair=123456';
  const qr=QRCode.create(value);const unit=7,margin=4,size=(qr.modules.size+margin*2)*unit;
  const pixels=new Uint8ClampedArray(size*size*4).fill(255);
  for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.get(y,x))for(let py=0;py<unit;py++)for(let px=0;px<unit;px++){
    const at=(((y+margin)*unit+py)*size+(x+margin)*unit+px)*4;pixels[at]=pixels[at+1]=pixels[at+2]=0;
  }
  const decoded=jsQR(pixels,size,size,{inversionAttempts:'dontInvert'});
  assert.equal(decoded.data,value);
  assert.deepEqual(parseHavenQr(decoded.data,'https://pc.tailnet.ts.net:8443'),{address:'https://pc.tailnet.ts.net:8443/connect',code:'123456',url:value});
});
test('scanner rejects unrelated hosts, missing or malformed codes, and origin changes inside a paired app',()=>{
  for(const value of ['javascript:alert(1)','https://evil.com/connect#pair=123456','http://pc.ts.net/connect#pair=123456','https://pc.ts.net/connect','https://pc.ts.net/connect#pair=123','https://user:password@pc.ts.net/connect#pair=123456','https://pc.ts.net/connect?key=1#pair=123456','https://pc.ts.net/admin#pair=123456','https://pc.ts.net/connect#pair=123456&host=other'])assert.throws(()=>parseHavenQr(value));
  assert.throws(()=>parseHavenQr('https://other.ts.net/connect#pair=123456','https://pc.ts.net'));
});
