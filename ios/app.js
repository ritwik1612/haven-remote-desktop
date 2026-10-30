import {normalizeHost} from './host.js';
const input=document.querySelector('#host');
try{input.value=localStorage.getItem('haven-pc-address')||'';if(input.value)document.querySelector('#connect button').textContent='Connect saved PC';}catch{}
const fromFragment=new URLSearchParams(location.hash.slice(1)).get('host');
if(fromFragment){input.value=fromFragment;history.replaceState(null,'','/');}
document.querySelector('#connect').addEventListener('submit',event=>{
  event.preventDefault();const error=document.querySelector('#error');error.textContent='';
  try{const address=normalizeHost(input.value);const url=new URL(address);
    try{localStorage.setItem('haven-pc-address',address);}catch{}
    // Direct navigation: the session and PIN remain on the laptop's HTTPS origin.
    url.pathname='/connect';location.assign(url.href);
  }catch{error.textContent='Enter the HTTPS .ts.net link shown in Haven on your laptop.';}
});

document.querySelector('#scan-qr').onclick=async()=>{
  try{const {scanHavenQr}=await import('./qr-scanner.js');await scanHavenQr({onScan:qr=>{try{localStorage.setItem('haven-pc-address',qr.address);}catch{}location.assign(qr.url);}});}
  catch{document.querySelector('#error').textContent='Scanner unavailable. Enter the laptop address instead.';}
};
if(location.hash==='#scan'){history.replaceState(null,'','/');document.querySelector('#scan-qr').click();}
