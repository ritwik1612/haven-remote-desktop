export function parseHavenQr(value,expectedOrigin){
  const url=new URL(value);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.ts.net')||url.username||url.password||url.search||url.pathname!=='/connect'||(expectedOrigin&&url.origin!==expectedOrigin))throw new Error('Scan the Haven QR shown on this laptop.');
  const params=new URLSearchParams(url.hash.slice(1));const code=params.get('pair');
  if(params.size!==1||!/^\d{6}$/.test(code||'')||[...params.keys()].some(key=>key!=='pair'))throw new Error('Generate a fresh pairing QR on the laptop, then scan it.');
  return {address:url.origin+'/connect',code,url:url.href};
}

// Frames are decoded locally. Nothing is uploaded and no camera stays active on close.
export async function scanHavenQr({expectedOrigin,onScan}){
  const dialog=document.createElement('dialog');dialog.className='qr-dialog';
  dialog.innerHTML='<h2>Scan your laptop’s QR</h2><p>Open Connect phone in Haven on the laptop and generate a pairing code.</p><video autoplay muted playsinline aria-label="QR camera preview"></video><p class="qr-status" role="status">Starting camera…</p><button type="button" class="button full">Cancel</button>';
  document.body.append(dialog);dialog.showModal();
  let stream,timer,closed=false,failed=false;const video=dialog.querySelector('video'),status=dialog.querySelector('.qr-status');
  const cleanup=()=>{if(closed)return;closed=true;clearTimeout(timer);stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',cleanup);window.removeEventListener('haven-background',cleanup);dialog.close();dialog.remove();};
  const hide=()=>{if(document.hidden)cleanup();};
  dialog.querySelector('button').onclick=cleanup;dialog.addEventListener('cancel',event=>{event.preventDefault();cleanup();});document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',cleanup);window.addEventListener('haven-background',cleanup);
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera unavailable. Use Safari on iPhone, update Haven on Android, or enter the pairing code instead.');
    const camera=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:720}}});
    const [{default:jsQR},media]=await Promise.all([import('./vendor/jsqr.js'),camera.then(media=>{if(closed||failed)media.getTracks().forEach(track=>track.stop());else stream=media;return media;})]);
    if(closed)return;video.srcObject=media;await video.play();
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    status.textContent='Point your camera at the Haven pairing QR.';
    const frame=()=>{
      if(closed)return;
      if(video.readyState>=2&&video.videoWidth){
        const ratio=Math.min(1,640/video.videoWidth);canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
        ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);const result=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'dontInvert'});
        if(result){try{const qr=parseHavenQr(result.data,expectedOrigin);cleanup();Promise.resolve(onScan(qr)).catch(()=>{});return;}catch(error){status.textContent=error.message;}}
      }
      timer=setTimeout(frame,150);
    };frame();
  }catch(error){failed=true;if(closed)return;stream?.getTracks().forEach(track=>track.stop());status.textContent=error.name==='NotAllowedError'?'Camera permission was denied. Allow camera access or use the pairing code instead.':error.message;dialog.querySelector('button').textContent='Use another method';}
  return cleanup;
}
