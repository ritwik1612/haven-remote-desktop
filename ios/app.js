const input=document.querySelector('#host');
const fromFragment=new URLSearchParams(location.hash.slice(1)).get('host');
if(fromFragment){input.value=fromFragment;history.replaceState(null,'','/');}
document.querySelector('#connect').addEventListener('submit',event=>{
  event.preventDefault();const error=document.querySelector('#error');error.textContent='';
  try{const url=new URL(input.value.trim());if(url.protocol!=='https:'||!url.hostname.endsWith('.ts.net')||url.username||url.password||url.search||url.hash)throw new Error();
    // Direct navigation: the session and PIN remain on the laptop's HTTPS origin.
    url.pathname='/connect';location.assign(url.href);
  }catch{error.textContent='Enter the HTTPS .ts.net link shown in Haven on your laptop.';}
});
