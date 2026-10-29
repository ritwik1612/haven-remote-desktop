// Isolated browser QA server: no native input or real desktop capture.
import {createHaven} from '../server.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const jpeg=await readFile(new URL('../.runtime/test-screen.jpg',import.meta.url));
const commands=[];
const bridge={async send(command,guard=()=>true){if(!guard())throw new Error('Session ended');if(command.type!=='capture'&&command.type!=='release'){commands.push(command);await writeFile(new URL('../.runtime/qa-input.json',import.meta.url),JSON.stringify(commands));}return {ok:true,jpeg:jpeg.toString('base64'),width:1280,height:800};},close(){}};
const app=createHaven({bridge});
app.server.listen(4319,'127.0.0.1',async()=>{await writeFile(new URL('../.runtime/qa-url.txt',import.meta.url),`http://127.0.0.1:4319/#host=${app.adminToken}`);console.log('Isolated UI test server on port 4319.');});
