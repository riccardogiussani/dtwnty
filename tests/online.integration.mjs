// Run against `npm run worker:dev -- --var CREATE_ROOM_KEY:local-test-only`.
// Uses disposable rooms in the local emulator. No Cloudflare account or deployment.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import WebSocket from 'ws';
const base=process.env.DTWNTY_TEST_SERVER??'http://127.0.0.1:8787',origin='http://127.0.0.1:5173';
const png=(w,h,paint)=>{const image=new PNG({width:w,height:h});for(let y=0;y<h;y++)for(let x=0;x<w;x++)image.data.set(paint(x,y),(y*w+x)*4);return'data:image/png;base64,'+PNG.sync.write(image).toString('base64')};
const token=png(24,24,()=>[180,160,90,255]);
const image=(src,name,width=80,height=60)=>({src,name,width,height});
const t=(id,kind,x,y)=>({id,kind,x,y,size:24,name:id,src:token});
const board=process.env.DTWNTY_E2E_BOARD?JSON.parse(readFileSync(process.env.DTWNTY_E2E_BOARD,'utf8')):{version:1,map:image(png(80,60,()=>[190,170,140,255]),'Test'),tokens:[t('alice-token','player',20,30),t('bob-token','player',60,30),t('enemy-a','enemy',22,30),t('enemy-b','enemy',58,30)],gridSize:10,lightCells:3,occlusion:{image:image(png(80,60,(x)=>x===40?[255,0,0,255]:[0,0,0,255]),'Occlusion'),openIds:[]}};
async function api(path,secret,input,status=200,extra={}){const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(secret?{Authorization:`Bearer ${secret}`} :{}),...extra},body:input===undefined?undefined:JSON.stringify(input)});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result}
await api('/rooms',null,{board},403,{'X-Create-Key':'wrong'});
const host=await api('/rooms',null,{board},200,{'X-Create-Key':process.env.DTWNTY_CREATE_KEY??'local-test-only'}),root=`/rooms/${host.code}`;
const alice=await api(root+'/join',null,{name:'Alice'}),bob=await api(root+'/join',null,{name:'Bob'});
await api(root+'/dm',null,{},403,{'X-Create-Key':'bad'});
const dm=await api(root+'/dm',null,{},200,{'X-Create-Key':process.env.DTWNTY_CREATE_KEY??'local-test-only'});assert.equal((await api(root+'/snapshot',dm.secret)).role,'master');assert.equal((await api(root+'/snapshot',host.secret)).role,'master');
await api(root+'/snapshot','bad-credential',undefined,401);
async function command(who,input,status=200){const snap=await api(root+'/snapshot',who.secret);return api(root+'/command',who.secret,{...input,revision:snap.revision},status)}
await command(host,{type:'assign',tokenId:'alice-token',memberId:alice.memberId});await command(host,{type:'assign',tokenId:'bob-token',memberId:bob.memberId});
const a=await api(root+'/snapshot',alice.secret),b=await api(root+'/snapshot',bob.secret);
assert.deepEqual(a.board.tokens.map(t=>t.id),['alice-token','enemy-a']);assert.deepEqual(b.board.tokens.map(t=>t.id),['bob-token','enemy-b']);
assert.equal(a.board.map.src,'');assert(!JSON.stringify(a).includes('masterHash'));assert(!('occlusion' in a.board));assert(!('assignments' in a));
await command(alice,{type:'move',id:'bob-token',x:1,y:1},400);await command(alice,{type:'assign',tokenId:'bob-token',memberId:alice.memberId},400);await command(alice,{type:'replace',board},400);
const response=await fetch(base+root+'/map',{headers:{Origin:origin,Authorization:`Bearer ${alice.secret}`}});assert.equal(response.status,200);const masked=PNG.sync.read(Buffer.from(await response.arrayBuffer()));const enemyB=board.tokens.find(t=>t.id==='enemy-b'),px=Math.floor(enemyB.x/board.map.width*masked.width),py=Math.floor(enemyB.y/board.map.height*masked.height);assert.deepEqual([...masked.data.subarray((py*masked.width+px)*4,(py*masked.width+px)*4+4)],[7,13,12,255]);
const ticket=await api(root+'/ticket',alice.secret,{});let changed=0;
const ws=new WebSocket(base.replace('http','ws')+root+'/ws?ticket='+ticket.ticket,{headers:{Origin:origin}});
await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('WebSocket timeout')),8000);ws.on('error',reject);ws.on('message',message=>{if(JSON.parse(message).type==='changed'){changed++;clearTimeout(timeout);resolve()}})});
const source=board.tokens.find(t=>t.id==='alice-token');await command(alice,{type:'move',id:'alice-token',x:source.x+1,y:source.y});
await new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(changed>=2){clearInterval(timer);resolve()}else if(Date.now()-start>8000){clearInterval(timer);reject(Error('No WebSocket update'))}},20)});ws.close();
const resumed=await api(root+'/snapshot',alice.secret);assert.equal(resumed.memberId,alice.memberId);assert.equal(resumed.board.tokens.find(t=>t.id==='alice-token').x,source.x+1);
console.log('PASS: real Worker/SQLite/DO room creation, 2 joins, assignments, personal maps, hidden tokens, denied commands, WebSocket update and reconnect credentials.');

if(process.env.DTWNTY_E2E_ACCESS_FILE)writeFileSync(process.env.DTWNTY_E2E_ACCESS_FILE,JSON.stringify({host,alice,bob,root,origin,base,aliceX:source.x+1}));

const beforePreview=await api(root+'/snapshot',alice.secret);
const dmPreview=await api(root+'/snapshot?viewAs='+alice.memberId,host.secret);
assert.equal(dmPreview.role,'master');assert.deepEqual(dmPreview.perspective,beforePreview);
await api(root+'/snapshot?viewAs='+bob.memberId,alice.secret,undefined,400);
await api(root+'/map?viewAs='+bob.memberId,alice.secret,undefined,400);
await api(root+'/snapshot?viewAs=unknown-player',host.secret,undefined,400);
const previewMap=await fetch(base+root+'/map?viewAs='+alice.memberId,{headers:{Origin:origin,Authorization:`Bearer ${host.secret}`}});
const personalMap=await fetch(base+root+'/map',{headers:{Origin:origin,Authorization:`Bearer ${alice.secret}`}});
assert.equal(previewMap.status,200);assert.deepEqual(Buffer.from(await previewMap.arrayBuffer()),Buffer.from(await personalMap.arrayBuffer()));
assert.deepEqual(await api(root+'/snapshot',alice.secret),beforePreview,'DM preview must not change player exploration or state');
console.log('PASS: DM perspective equals player map/state, is read-only, and players cannot impersonate one another.');
await command(host,{type:'assign',tokenId:'alice-token',memberIds:[alice.memberId,bob.memberId]});
const shared=await api(root+'/snapshot',bob.secret);assert(shared.ownTokenIds.includes('alice-token'));
await command(bob,{type:'move',id:'alice-token',x:source.x+2,y:source.y});
await command(host,{type:'edit',id:'alice-token',patch:{name:'Arwen',size:88}});
assert.equal((await api(root+'/snapshot',host.secret)).board.tokens.find(t=>t.id==='alice-token').name,'Arwen');
await command(alice,{type:'edit',id:'alice-token',patch:{name:'Forbidden'}},400);
await command(alice,{type:'settings',patch:{fogEnabled:false}},400);
await command(alice,{type:'remove',id:'bob-token'},400);
console.log('PASS: DM key login, shared token ownership, resize/rename and player authorization.');
