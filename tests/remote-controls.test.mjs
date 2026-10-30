import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteView} from '../public/remote-view.js';
import {sendVncCommand,keySymbol,windowsAction} from '../public/remote-input.js';

function harness(t){
  const old=globalThis.ResizeObserver;globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  t.after(()=>globalThis.ResizeObserver=old);
  const events=new Map(),sent=[],keys=[];
  const wrap={clientWidth:400,clientHeight:300,addEventListener(k,f){events.set(k,f);},removeEventListener(k){events.delete(k);},setPointerCapture(){}};
  const canvas={style:{},getBoundingClientRect(){return {left:parseFloat(this.style.left),top:parseFloat(this.style.top)};}};
  const display={scale:1,viewportChangeSize(){},viewportChangePos(){}};
  const rfb={_canvas:canvas,_screen:{style:{}},_display:display,_fbWidth:1920,_fbHeight:1080,_updateScale(){},_sendMouse(x,y,mask){sent.push({x:Math.round(x/display.scale),y:Math.round(y/display.scale),mask});},sendKey(...args){keys.push(args);}};
  const view=createRemoteView(rfb,wrap);
  t.after(()=>view.dispose());
  const event=(x,y)=>({pointerId:1,clientX:x,clientY:y,button:0,preventDefault(){},stopImmediatePropagation(){}});
  return {events,sent,keys,view,rfb,fire(type,x=200,y=150){events.get(type)(event(x,y));}};
}
test('finger motion never holds a mouse button or selects text in default mode',t=>{
  const h=harness(t);h.fire('pointerdown');h.fire('pointermove',240,160);h.fire('pointermove',270,180);h.fire('pointerup',270,180);
  assert.ok(h.sent.length>=3);assert.ok(h.sent.every(e=>e.mask===0));
  h.sent.length=0;h.fire('pointerdown');h.fire('pointerup');
  assert.deepEqual(h.sent.map(e=>e.mask),[0,1,0]);
});
test('explicit Drag holds left button and releases it on cancel, mode change and disposal',t=>{
  const h=harness(t);h.view.setMode('drag');h.fire('pointerdown');h.fire('pointermove',230,160);h.fire('pointercancel',230,160);
  assert.deepEqual(h.sent.map(e=>e.mask),[1,1,0]);
  h.fire('pointerdown');h.view.setMode('click');assert.equal(h.sent.at(-1).mask,0);
  h.view.setMode('drag');h.fire('pointerdown');h.view.dispose();assert.equal(h.sent.at(-1).mask,0);
});
test('right-click and scroll buttons target the last cursor position through zoom changes',t=>{
  const h=harness(t);h.fire('pointerdown');h.fire('pointermove',270,180);h.fire('pointerup',270,180);
  const last={x:h.sent.at(-1).x,y:h.sent.at(-1).y};h.sent.length=0;h.view.zoom();
  sendVncCommand(h.rfb,h.view,{type:'pointer',action:'right'});
  sendVncCommand(h.rfb,h.view,{type:'scroll',delta:120});sendVncCommand(h.rfb,h.view,{type:'scroll',delta:-120});
  assert.deepEqual(h.sent.map(e=>e.mask),[4,0,8,0,16,0]);assert.ok(h.sent.every(e=>e.x===last.x&&e.y===last.y));
});
test('Move view, cancelled taps and view-only sessions never inject clicks',t=>{
  const h=harness(t);h.fire('pointerdown');h.fire('pointercancel');assert.ok(h.sent.every(e=>e.mask===0));h.sent.length=0;
  h.view.zoom();h.view.setMode('pan');h.fire('pointerdown');h.fire('pointermove',240,180);h.fire('pointerup',240,180);assert.equal(h.sent.length,0);
  h.rfb.viewOnly=true;h.view.setMode('click');h.fire('pointerdown');h.fire('pointerup');h.view.click(4);h.view.scroll(120);sendVncCommand(h.rfb,h.view,{type:'keys',keys:['Meta','L']});assert.equal(h.sent.length,0);assert.equal(h.keys.length,0);
});
test('all special keys and shortcuts emit the expected key-down and key-up sequence',t=>{
  const h=harness(t);
  for(const key of ['Control','Alt','Shift','Meta','Escape','Tab','Backspace','Enter','Delete','Insert','Home','End','PageUp','PageDown','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space',...Array.from({length:12},(_,i)=>'F'+(i+1))]){
    h.keys.length=0;sendVncCommand(h.rfb,h.view,{type:'keys',keys:[key]});const [symbol,code]=keySymbol(key);assert.deepEqual(h.keys,[[symbol,code,true],[symbol,code,false]],key);
  }
  for(const combo of [['Meta','L'],['Control','Shift','Escape'],['Alt','Tab'],['Control','C'],['Control','V'],['Control','A']]){
    h.keys.length=0;sendVncCommand(h.rfb,h.view,{type:'keys',keys:combo});
    assert.deepEqual(h.keys, [...combo.map(k=>[...keySymbol(k),true]),...combo.toReversed().map(k=>[...keySymbol(k),false])]);
  }
  h.keys.length=0;sendVncCommand(h.rfb,h.view,{type:'text',text:'A✓🙂'});assert.deepEqual(h.keys,[[65,null],[0x0af3,null],[0x101f642,null]]);
});


test('Shift+letter uses the uppercase keysym and Windows-only shortcuts route to guarded native actions',()=>{
  const keys=[];sendVncCommand({sendKey(...args){keys.push(args);}},null,{type:'keys',keys:['Meta','Shift','S']});
  assert.deepEqual(keys[2],[83,'KeyS',true]);
  assert.equal(windowsAction(['Meta','L']),'lock');assert.equal(windowsAction(['Shift','Meta','S']),'snip');
  assert.equal(windowsAction(['Meta','S']),null);assert.equal(windowsAction(['Control','Meta','L']),null);
});
