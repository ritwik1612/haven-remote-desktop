// Local read-only browser integration fixture for the real VNC engine.
import {createHaven} from '../server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const config=JSON.parse(await readFile(new URL('../.runtime/vnc-browser-config.json',import.meta.url),'utf8'));
const app=createHaven(config);
app.server.listen(4320,'127.0.0.1',async()=>{await writeFile(new URL('../.runtime/vnc-ui-url.txt',import.meta.url),`http://localhost:4320/#host=${app.adminToken}`);console.log('Real VNC browser test on localhost:4320. Approve view only.');});
