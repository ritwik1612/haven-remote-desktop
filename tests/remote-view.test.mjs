import test from 'node:test';
import assert from 'node:assert/strict';
import {displayRects,fitRect,createRemoteView} from '../public/remote-view.js';
import {normalizeHost} from '../ios/host.js';

test('phone addresses normalize once without accepting credentials or other origins',()=>{
  assert.equal(normalizeHost(' laptop.tailnet.ts.net '),'https://laptop.tailnet.ts.net:8443/connect');
  assert.equal(normalizeHost('https://laptop.tailnet.ts.net:9443/connect'),'https://laptop.tailnet.ts.net:9443/connect');
  for(const value of ['http://a.ts.net','https://a.ts.net.evil.com','https://user:pass@a.ts.net','https://a.ts.net/?pin=123456','https://a.ts.net/#secret','https://a.ts.net/admin'])assert.throws(()=>normalizeHost(value));
});
test('monitor selection falls back safely on stale layout and preserves full desktop',()=>{
  const layout={width:3840,height:1080,screens:[{x:0,y:0,width:1920,height:1080},{x:1920,y:0,width:1920,height:1080,primary:true}]};
  assert.equal(displayRects(layout,3840,1080).length,3);
  assert.equal(displayRects(layout,1920,1080).length,1);
  assert.equal(fitRect({width:1920,height:1080},390,600),390/1920);
});
test('one tap emits exactly one left click; pan sends no input; selected monitor uses full framebuffer coordinates',()=>{
  const previous=globalThis.ResizeObserver;globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  try{
    const events=new Map(),sent=[];
    const wrap={clientWidth:400,clientHeight:300,addEventListener(t,f){events.set(t,f);},removeEventListener(t){events.delete(t);},setPointerCapture(){}};
    const canvas={style:{},getBoundingClientRect(){return {left:parseFloat(this.style.left),top:parseFloat(this.style.top)};}};
    const display={scale:1,viewportChangeSize(){},viewportChangePos(){}};
    const rfb={_canvas:canvas,_screen:{style:{}},_display:display,_fbWidth:3840,_fbHeight:1080,_updateScale(){},_sendMouse(x,y,mask){sent.push([Math.round(x/display.scale),Math.round(y/display.scale),mask]);}};
    const view=createRemoteView(rfb,wrap,{layout:{width:3840,height:1080,screens:[{x:0,y:0,width:1920,height:1080},{x:1920,y:0,width:1920,height:1080}]}});
    view.select('1');
    const event=(x,y)=>({pointerId:1,clientX:x,clientY:y,button:0,preventDefault(){},stopImmediatePropagation(){}});
    events.get('pointerdown')(event(200,150));events.get('pointerup')(event(200,150));
    assert.deepEqual(sent,[[2880,540,0],[2880,540,1],[2880,540,0]]);
    view.zoom();view.setMode('pan');events.get('pointerdown')(event(200,150));events.get('pointermove')(event(250,180));events.get('pointerup')(event(250,180));
    assert.equal(sent.length,3);
    view.setMode('click');rfb.viewOnly=true;events.get('pointerdown')(event(200,150));events.get('pointerup')(event(200,150));assert.equal(sent.length,3);
    view.dispose();assert.equal(events.size,0);
  }finally{globalThis.ResizeObserver=previous;}
});
