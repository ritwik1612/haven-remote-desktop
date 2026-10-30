// Adapter for the pinned noVNC client. Cropping never changes Windows resolution.
export function displayRects(layout,width,height){
  const all={id:'all',name:'All displays',x:0,y:0,width,height};
  if(!layout||layout.width!==width||layout.height!==height)return [all];
  return [all,...(layout.screens||[]).filter(s=>[s.x,s.y,s.width,s.height].every(Number.isFinite)&&s.width>0&&s.height>0&&s.x>=0&&s.y>=0&&s.x+s.width<=width&&s.y+s.height<=height).map((s,i)=>({...s,id:String(i),name:`Display ${i+1}${s.primary?' · Primary':''}`}))];
}
export function fitRect(rect,width,height,zoom=false){return zoom?1:Math.min(width/rect.width,height/rect.height);}
export function createRemoteView(rfb,wrap,{layout=null,onDisplays=()=>{}}={}){
  let mode='click',selected='all',zoom=false,panX=0,panY=0,pointer=null,disposed=false,rect,scale=1;
  const canvas=rfb._canvas,screen=rfb._screen,originalScale=rfb._updateScale;
  const listeners=[];
  function listen(type,fn,options={capture:true,passive:false}){wrap.addEventListener(type,fn,options);listeners.push([type,fn,options]);}
  function apply(){
    if(disposed||!rfb._fbWidth||!rfb._fbHeight)return;
    const choices=displayRects(layout,rfb._fbWidth,rfb._fbHeight);
    rect=choices.find(s=>s.id===selected)||choices[0];selected=rect.id;
    const w=wrap.clientWidth,h=wrap.clientHeight;
    scale=fitRect(rect,w,h,zoom);
    if(!Number.isFinite(scale)||scale<=0)return;
    const maxX=Math.max(0,(rect.width*scale-w)/2),maxY=Math.max(0,(rect.height*scale-h)/2);
    panX=Math.max(-maxX,Math.min(maxX,panX));panY=Math.max(-maxY,Math.min(maxY,panY));
    rfb._display.clipViewport=false;
    rfb._display.viewportChangeSize();rfb._display.viewportChangePos(-1e7,-1e7);
    rfb._display.scale=scale;
    Object.assign(screen.style,{display:'block',position:'relative',width:'100%',height:'100%',overflow:'hidden'});
    const left=(w-rect.width*scale)/2+panX,top=(h-rect.height*scale)/2+panY;
    Object.assign(canvas.style,{position:'absolute',left:`${left-rect.x*scale}px`,top:`${top-rect.y*scale}px`,margin:'0'});
    screen.style.clipPath=`inset(${Math.max(0,top)}px ${Math.max(0,w-left-rect.width*scale)}px ${Math.max(0,h-top-rect.height*scale)}px ${Math.max(0,left)}px)`;
    onDisplays(choices,selected);
  }
  rfb._updateScale=apply;
  const observer=new ResizeObserver(apply);observer.observe(wrap);
  function position(e){const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
  function send(pos,mask){if(rect)pos={x:Math.max(rect.x*scale,Math.min((rect.x+rect.width)*scale-1,pos.x)),y:Math.max(rect.y*scale,Math.min((rect.y+rect.height)*scale-1,pos.y))};rfb._mousePos=pos;if(!rfb.viewOnly)rfb._sendMouse(pos.x,pos.y,mask);}
  function stop(e){e.preventDefault();e.stopImmediatePropagation();}
  listen('pointerdown',e=>{stop(e);if(pointer)return;const pos=position(e);if(!rect||pos.x<rect.x*scale||pos.x>(rect.x+rect.width)*scale||pos.y<rect.y*scale||pos.y>(rect.y+rect.height)*scale)return;wrap.setPointerCapture(e.pointerId);rfb.focus?.();pointer={id:e.pointerId,x:e.clientX,y:e.clientY,pos};if(mode==='click')send(pos,e.button===2?4:1);});
  listen('pointermove',e=>{stop(e);if(!pointer||pointer.id!==e.pointerId)return;if(mode==='pan'){panX+=e.clientX-pointer.x;panY+=e.clientY-pointer.y;apply();}else send(position(e),e.buttons===2?4:1);pointer.x=e.clientX;pointer.y=e.clientY;});
  function release(e){stop(e);if(pointer?.id!==e.pointerId)return;if(mode==='click')send(position(e),0);pointer=null;}
  listen('pointerup',release);listen('pointercancel',release);listen('lostpointercapture',release);
  // noVNC's legacy gesture recognizer must not emit duplicate clicks.
  for(const type of ['touchstart','touchmove','touchend','touchcancel','mousedown','mousemove','mouseup','click','dblclick','contextmenu'])listen(type,stop);
  listen('wheel',e=>{stop(e);const p=position(e);send(p,e.deltaY<0?8:16);send(p,0);});
  apply();
  return {setLayout(value){layout=value;apply();},setMode(value){if(pointer)send(rfb._mousePos||pointer.pos,0);pointer=null;mode=value;},select(id){selected=id;panX=panY=0;apply();if(rect)rfb._mousePos={x:(rect.x+rect.width/2)*scale,y:(rect.y+rect.height/2)*scale};},zoom(){const oldScale=scale;const oldPosition=rfb._mousePos;zoom=!zoom;panX=panY=0;apply();if(oldPosition)rfb._mousePos={x:oldPosition.x/oldScale*scale,y:oldPosition.y/oldScale*scale};return zoom;},refresh:apply,dispose(){disposed=true;observer.disconnect();for(const [type,fn,options]of listeners)wrap.removeEventListener(type,fn,options);rfb._updateScale=originalScale;}};
}
