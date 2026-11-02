import {DurableObject} from 'cloudflare:workers';
import {validSession} from '../src/session.ts';
import {segment} from '../src/occlusion.ts';
import type {OcclusionModel} from '../src/occlusion.ts';
import {decodeExploration} from '../src/exploration.ts';
import {assign,editToken,settings,emptyModel,explore,move,personalLight,projectPlayer,redactMap} from './room-core.ts';
import type {Identity,RoomState} from './room-core.ts';
import {decodePng,encodePng} from './images.ts';
import {SqliteRoomStore} from './room-storage.ts';
interface Env{ROOMS:DurableObjectNamespace<GameRoom>;ALLOWED_ORIGINS:string;CREATE_ROOM_KEY:string}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const secret=()=>crypto.randomUUID()+crypto.randomUUID();
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function body(request:Request,max=14_000_000){if(Number(request.headers.get('Content-Length'))>max)throw Error('Richiesta troppo grande.');const reader=request.body?.getReader();if(!reader)throw Error('Corpo mancante.');let size=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('Richiesta troppo grande.')}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return JSON.parse(new TextDecoder().decode(bytes))}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const origin=request.headers.get('Origin')??'',allowed=env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).includes(origin);
    if(!allowed)return json({error:'Origine non autorizzata. Configura ALLOWED_ORIGINS.'},403);
    const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Create-Key','Vary':'Origin'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{
      const url=new URL(request.url);let response:Response;
      if(url.pathname==='/rooms'&&request.method==='POST'){
        const key=request.headers.get('X-Create-Key');if(!env.CREATE_ROOM_KEY||!key||await hash(key)!==await hash(env.CREATE_ROOM_KEY))return new Response(JSON.stringify({error:'Chiave di creazione non valida.'}),{status:403,headers:{...headers,'Content-Type':'application/json'}});
        const input=await body(request);let attempts=0;
        do{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',random=crypto.getRandomValues(new Uint8Array(8)),code=Array.from(random,x=>alphabet[x%alphabet.length]).join('');const stub=env.ROOMS.get(env.ROOMS.idFromName(code));response=await stub.fetch(new Request(`https://room/create`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,code})}));if(response.status!==409)break}while(++attempts<4);
      }else{
        const match=url.pathname.match(/^\/rooms\/([A-Z2-9]{8})(\/(?:join|dm|snapshot|command|map|ticket|ws))$/);if(!match)return new Response('Not found',{status:404,headers});
        const forwarded=new Request(request);const forwardedUrl=new URL(request.url);forwardedUrl.pathname=match[2];response=await env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(new Request(forwardedUrl,forwarded));
      }
      if(response.status===101)return response;
      const output=new Response(response.body,response);for(const [key,value] of Object.entries(headers))output.headers.set(key,value);return output;
    }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:'Richiesta non valida.'}),{status:400,headers:{...headers,'Content-Type':'application/json'}})}
  }
} satisfies ExportedHandler<Env>;

export class GameRoom extends DurableObject<Env>{
  private store:SqliteRoomStore|undefined;
  private storage(){return this.store??=new SqliteRoomStore(this.ctx.storage.sql,fn=>this.ctx.storage.transactionSync(fn))}
  private room:RoomState|null=null;private model:OcclusionModel|null=null;private raster:ReturnType<typeof decodePng>|null=null;
  private tail:Promise<unknown>=Promise.resolve();private attempts=new Map<string,{time:number;count:number}>();
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const result=this.tail.then(fn,fn);this.tail=result.catch(()=>{});return result}
  private async load(){if(!this.room)this.room=this.storage().read();if(this.room&&this.room.expiresAt<Date.now())throw Error('La stanza è scaduta.')}
  private async prepare(){const r=this.room!;if(!this.raster)this.raster=decodePng(r.board.map!.src);if(!this.model){if(r.board.occlusion){const img=decodePng(r.board.occlusion.image.src);this.model=segment(img.data,img.width,img.height)}else this.model=emptyModel(this.raster.width,this.raster.height)}return this.model}
  private async save(){const r=this.room!;await this.ctx.storage.setAlarm(r.expiresAt);await this.storage().write(r)}
  private async identity(value:string):Promise<Identity|null>{if(!value||value.length>200)return null;const digest=await hash(value),r=this.room!;if(digest===r.masterHash||r.masterHashes?.includes(digest))return{role:'master',id:'master'};const member=r.members.find(m=>m.hash===digest);return member?{role:'player',id:member.id}:null}
  private notify(){for(const ws of this.ctx.getWebSockets()){const attachment=ws.deserializeAttachment() as Identity|null;if(attachment?.role)try{ws.send(JSON.stringify({type:'changed',revision:this.room!.revision}))}catch{}}}
  async fetch(request:Request):Promise<Response>{return this.serial(async()=>{try{
    await this.load();const path=new URL(request.url).pathname;
    if(path==='/create'&&request.method==='POST'){
      if(this.room)return json({error:'Codice già usato.'},409);const input=await body(request);if(!validSession(input.board)||!input.board.map)throw Error('Prepara una mappa prima di creare la stanza.');
      if(input.board.tokens.length>100)throw Error('Massimo 100 token online.');const master=secret();
      this.room={code:input.code,revision:1,scene:1,masterHash:await hash(master),members:[],assignments:{},board:input.board,expiresAt:Date.now()+7*86400000};
      await this.prepare();for(const t of this.room.board.tokens)decodePng(t.src);await this.save();return json({code:this.room.code,secret:master,role:'master'});
    }
    if(!this.room)return json({error:'Stanza non trovata.'},404);
    if(path==='/dm'&&request.method==='POST'){
      const key=request.headers.get('X-Create-Key');if(!this.env.CREATE_ROOM_KEY||!key||await hash(key)!==await hash(this.env.CREATE_ROOM_KEY))return json({error:'Chiave DM non valida.'},403);
      const credential=secret();this.room.masterHashes=[...(this.room.masterHashes??[]).slice(-7),await hash(credential)];await this.save();return json({code:this.room.code,secret:credential,role:'master'});
    }
    if(path==='/join'&&request.method==='POST'){
      const ip=request.headers.get('CF-Connecting-IP')??'local',now=Date.now();let rate=this.attempts.get(ip);if(!rate||now-rate.time>60000){rate={time:now,count:0};if(this.attempts.size>1000)this.attempts.clear();this.attempts.set(ip,rate)}if(++rate.count>15)return json({error:'Troppi tentativi. Riprova tra un minuto.'},429);
      if(this.room.members.length>=12)throw Error('Stanza piena (12 giocatori).');const input=await body(request,2048),name=typeof input.name==='string'?input.name.trim().slice(0,40):'';if(!name)throw Error('Inserisci il tuo nome.');const key=secret(),id=crypto.randomUUID();this.room.members.push({id,name,joinedAt:Date.now(),hash:await hash(key)});this.room.revision++;await this.save();this.notify();return json({code:this.room.code,secret:key,role:'player',memberId:id});
    }
    if(path==='/ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      const ticket=new URL(request.url).searchParams.get('ticket')??'';
      if(!/^[a-f0-9-]{36}$/.test(ticket))return json({error:'Ticket richiesto.'},401);
      const entry=await this.ctx.storage.get<{identity:Identity;expires:number}>('ticket:'+ticket);await this.ctx.storage.delete('ticket:'+ticket);
      if(!entry||entry.expires<Date.now())return json({error:'Ticket scaduto.'},401);
      if(this.ctx.getWebSockets().length>=32)throw Error('Troppe connessioni.');
      const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);pair[1].serializeAttachment(entry.identity);pair[1].send(JSON.stringify({type:'changed',revision:this.room.revision}));return new Response(null,{status:101,webSocket:pair[0]});
    }
    const identity=await this.identity((request.headers.get('Authorization')??'').replace(/^Bearer /,''));if(!identity)return json({error:'Credenziale non valida. Rientra nella stanza.'},401);
    if(path==='/ticket'&&request.method==='POST'){const tickets=await this.ctx.storage.list<{expires:number}>({prefix:'ticket:'});for(const [key,value] of tickets)if(value.expires<Date.now())await this.ctx.storage.delete(key);if(tickets.size>100)throw Error('Troppi tentativi di connessione.');const ticket=crypto.randomUUID();await this.ctx.storage.put('ticket:'+ticket,{identity,expires:Date.now()+60000});return json({ticket})}
    const r=this.room,model=await this.prepare();
    if(path==='/snapshot'&&request.method==='GET'){
      if(identity.role==='master')return json({role:'master',code:r.code,revision:r.revision,scene:r.scene,board:r.board,members:r.members.map(({id,name,joinedAt})=>({id,name,joinedAt})),assignments:r.assignments});
      return json(projectPlayer(r,r.members.find(m=>m.id===identity.id)!,model));
    }
    if(path==='/map'&&request.method==='GET'){
      if(identity.role!=='player')throw Error('Endpoint riservato alla vista giocatore.');const member=r.members.find(m=>m.id===identity.id)!,light=personalLight(r,member,model),explored=decodeExploration(member.explored,model.width,model.height),raster=this.raster!;
      const data=redactMap(raster.data,raster.width,raster.height,light,explored,model.width,model.height),png=encodePng(raster.width,raster.height,data);
      return new Response(png as BodyInit,{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
    }
    if(path==='/command'&&request.method==='POST'){
      const input=await body(request);if(input.revision!==r.revision)return json({error:'Il tavolo è cambiato. Riprova dopo l’aggiornamento.'},409);
      if(input.type==='move')move(r,identity,input.id,input.x,input.y);
      else if(input.type==='toggle'){
        const opening=model.openings.find(o=>o.id===input.id);if(!opening||!r.board.occlusion)throw Error('Apertura non trovata.');
        if(identity.role!=='master'){const member=r.members.find(m=>m.id===identity.id)!,light=personalLight(r,member,model);if(!opening.pixels.some(p=>light[p]>20))throw Error('Apertura fuori dalla tua visuale.')}
        const ids=r.board.occlusion.openIds;r.board.occlusion.openIds=ids.includes(opening.id)?ids.filter(x=>x!==opening.id):[...ids,opening.id];
      }else if(identity.role==='master'&&input.type==='assign')assign(r,input.tokenId,input.memberIds??input.memberId);
      else if(identity.role==='master'&&input.type==='settings')settings(r,input.patch);
      else if(identity.role==='master'&&input.type==='edit')editToken(r,input.id,input.patch);
      else if(identity.role==='master'&&input.type==='remove'){
        if(!r.board.tokens.some(t=>t.id===input.id))throw Error('Token non trovato.');r.board.tokens=r.board.tokens.filter(t=>t.id!==input.id);delete r.assignments[input.id];
      }
      else if(identity.role==='master'&&input.type==='replace'){
        if(!validSession(input.board)||!input.board.map||input.board.tokens.length>100)throw Error('Tavolo non valido.');const old=r.board;
        // Decode all new assets before replacing the authoritative board.
        const raster=decodePng(input.board.map.src);for(const t of input.board.tokens)decodePng(t.src);const mask=input.board.occlusion?decodePng(input.board.occlusion.image.src):null;
        r.board=input.board;this.raster=raster;this.model=mask?segment(mask.data,mask.width,mask.height):emptyModel(raster.width,raster.height);
        if(old.map?.src!==r.board.map?.src||old.occlusion?.image.src!==r.board.occlusion?.image.src){r.scene++;for(const m of r.members)delete m.explored}
        for(const id of Object.keys(r.assignments))if(!r.board.tokens.some(t=>t.id===id&&t.kind==='player'))delete r.assignments[id];
      }else throw Error('Comando non autorizzato.');
      explore(r,this.model!);r.revision++;await this.save();this.notify();return json({ok:true,revision:r.revision});
    }
    return json({error:'Endpoint non disponibile.'},404);
  }catch(error){this.room=null;this.model=null;this.raster=null;return json({error:error instanceof Error?error.message:'Errore stanza.'},400)}})}
  async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){await this.serial(async()=>{try{if(typeof message!=='string'||message.length>2048){ws.close(1008,'Messaggio non valido');return}await this.load();if(!this.room){ws.close(1008,'Stanza assente');return}const input=JSON.parse(message);if(input.type==='auth'){const identity=await this.identity(input.secret);if(!identity){ws.close(1008,'Accesso negato');return}ws.serializeAttachment(identity);ws.send(JSON.stringify({type:'changed',revision:this.room.revision}))}else if(input.type==='ping'&&ws.deserializeAttachment())ws.send('{"type":"pong"}');else ws.close(1008,'Autenticazione richiesta')}catch{ws.close(1011,'Errore')}})}
  async alarm(){return this.serial(async()=>{for(const ws of this.ctx.getWebSockets())ws.close(1001,'Stanza scaduta');await this.ctx.storage.deleteAll();this.store=undefined;this.room=null;this.model=null;this.raster=null})}
}
