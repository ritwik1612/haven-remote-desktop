// Isolated QA desktop. Real noVNC client and RFB wire messages, no Windows input.
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {WebSocketServer} from 'ws';
const events=[];let save;
const record=event=>{events.push(event);clearTimeout(save);save=setTimeout(()=>writeFile('.runtime/control-wire-events.json',JSON.stringify(events)),10);};
const server=http.createServer(async(req,res)=>{
  try{
    const route=new URL(req.url,'http://localhost').pathname;
    const api={
      '/api/info':{name:'Haven test desktop',local:false,backend:'vnc'},
      '/api/session':{status:'approved',mode:'control',expiresAt:Date.now()+21600000},
      '/api/vnc':{password:'synthetic-only'},
      '/api/displays':{width:1280,height:800,screens:[{x:0,y:0,width:640,height:800,primary:true},{x:640,y:0,width:640,height:800}]},
      '/api/disconnect':{ok:true},'/api/device':{paired:true,name:'QA phone',pinConfigured:true}
    };
    res.setHeader('Cache-Control','no-store');
    if(route==='/api/system'){let data='';for await(const part of req)data+=part;record({type:'system',action:JSON.parse(data).action});res.setHeader('Content-Type','application/json');return res.end('{"ok":true}');}
    if(route==='/qa/events'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(events));}
    if(api[route]){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(api[route]));}
    const name=route==='/'||route==='/connect'?'/index.html':route;
    const file=path.resolve('public','.'+name);if(!file.startsWith(path.resolve('public')+path.sep))throw new Error();
    res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
const wss=new WebSocketServer({server,path:'/api/vnc/socket'});
wss.on('connection',ws=>{
  let buffer=Buffer.alloc(0),stage=0,painted=false;
  ws.send(Buffer.from('RFB 003.008\n'));
  ws.on('message',part=>{
    buffer=Buffer.concat([buffer,part]);
    try{while(buffer.length){
      let length;
      if(stage===0){if(buffer.length<12)return;length=12;ws.send(Buffer.from([1,1]));stage=1;}
      else if(stage===1){length=1;ws.send(Buffer.alloc(4));stage=2;}
      else if(stage===2){
        length=1;const name=Buffer.from('Synthetic Haven QA');const init=Buffer.alloc(24+name.length);
        init.writeUInt16BE(1280,0);init.writeUInt16BE(800,2);init[4]=32;init[5]=24;init[7]=1;init.writeUInt16BE(255,8);init.writeUInt16BE(255,10);init.writeUInt16BE(255,12);init[14]=16;init[15]=8;init.writeUInt32BE(name.length,20);name.copy(init,24);ws.send(init);stage=3;
      }else{
        const type=buffer[0];
        if(type===0)length=20;
        else if(type===2){if(buffer.length<4)return;length=4+buffer.readUInt16BE(2)*4;}
        else if(type===3)length=10;
        else if(type===4)length=8;
        else if(type===5)length=6;
        else if(type===6){if(buffer.length<8)return;length=8+buffer.readUInt32BE(4);}
        else throw new Error('Unexpected RFB client message '+type);
        if(buffer.length<length)return;
        if(type===4)record({type:'key',down:buffer[1]===1,symbol:buffer.readUInt32BE(4)});
        if(type===5)record({type:'pointer',mask:buffer[1],x:buffer.readUInt16BE(2),y:buffer.readUInt16BE(4)});
        if(type===3&&!painted){
          painted=true;const frame=Buffer.alloc(16+1280*800*4);frame.writeUInt16BE(1,2);frame.writeUInt16BE(1280,8);frame.writeUInt16BE(800,10);
          for(let y=0;y<800;y++)for(let x=0;x<1280;x++){const p=16+(y*1280+x)*4;frame[p]=x<640?70:95;frame[p+1]=35+Math.floor(y/30);frame[p+2]=x<640?25:55;}
          ws.send(frame);
        }
      }
      buffer=buffer.subarray(length);
    }}catch(error){record({type:'error',message:error.message});ws.close();}
  });
});
server.listen(4320,'127.0.0.1',()=>console.log('Synthetic VNC wire QA on 4320; no native input.'));
