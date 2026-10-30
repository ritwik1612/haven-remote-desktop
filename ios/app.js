import {normalizeHost} from './host.js';
const input=document.querySelector('#host');
try{input.value=localStorage.getItem('haven-pc-address')||'';}catch{}
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
