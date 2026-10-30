import {DOMKeyTable,Keysyms} from './vendor/keys.js';
export function keySymbol(key,shift=false){
  const codes={Control:'ControlLeft',Alt:'AltLeft',Shift:'ShiftLeft',Meta:'MetaLeft'};
  if(key==='Space')return [32,'Space'];
  if(DOMKeyTable[key])return [DOMKeyTable[key][0],codes[key]||key];
  const char=shift?key.toUpperCase():key.toLowerCase();
  return [Keysyms.lookup(char.codePointAt(0)),/^\d$/.test(key)?'Digit'+key:'Key'+key];
}
export function windowsAction(keys){const set=new Set(keys);if(set.size===2&&set.has('Meta')&&set.has('L'))return 'lock';if(set.size===3&&set.has('Meta')&&set.has('Shift')&&set.has('S'))return 'snip';return null;}
export function sendVncCommand(rfb,view,command){
  if(!rfb||rfb.viewOnly)return;
  if(command.type==='keys'){
    const shift=command.keys.includes('Shift');const keys=[...new Set(command.keys)].map(key=>keySymbol(key,shift)),pressed=[];
    try{for(const [sym,code]of keys){rfb.sendKey(sym,code,true);pressed.push([sym,code]);}}
    finally{for(const [sym,code]of pressed.reverse())rfb.sendKey(sym,code,false);}
  }
  if(command.type==='text')for(const char of command.text)rfb.sendKey(Keysyms.lookup(char.codePointAt(0)),null);
  if(command.type==='scroll')view?.scroll(command.delta);
  if(command.type==='pointer'&&command.action==='right')view?.click(4);
}
