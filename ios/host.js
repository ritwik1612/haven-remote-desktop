export function normalizeHost(value){
  const raw=value.trim();const url=new URL(raw.includes('://')?raw:'https://'+raw);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.ts.net')||url.username||url.password||url.search||url.hash||!['/','/connect',''].includes(url.pathname))throw new Error('Use the private .ts.net address shown in Haven.');
  if(!url.port)url.port='8443';url.pathname='/connect';return url.href;
}
