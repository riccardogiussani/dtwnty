import {blockers,segment,visibility} from '../src/occlusion.ts';
import {decodeExploration,encodeExploration,enemyInSight,remember} from '../src/exploration.ts';
import type {Exploration} from '../src/exploration.ts';
import type {OcclusionModel} from '../src/occlusion.ts';
import type {Session} from '../src/session.ts';
export interface Member{id:string;name:string;hash:string;explored?:Exploration}
export interface RoomState{code:string;revision:number;masterHash:string;members:Member[];assignments:Record<string,string>;board:Session;expiresAt:number;scene:number}
export type Identity={role:'master'|'player';id:string};
export function personalLight(room:RoomState,member:Member,model:OcclusionModel):Uint8Array{
  const m=room.board.map!;
  if(room.board.fogEnabled===false)return new Uint8Array(model.width*model.height).fill(255);
  return visibility(model.width,model.height,blockers(model,room.board.occlusion?.openIds??[]),room.board.tokens.filter(t=>t.kind==='player'&&room.assignments[t.id]===member.id).map(t=>({x:t.x/m.width*model.width,y:t.y/m.height*model.height,radius:(room.board.lightCells??8)*(room.board.gridSize??50)/m.width*model.width})));
}
export function explore(room:RoomState,model:OcclusionModel):void{
  for(const member of room.members){const old=decodeExploration(member.explored,model.width,model.height),next=remember(personalLight(room,member,model),old);if(next)member.explored=encodeExploration(next,model.width,model.height)}
}
export function projectPlayer(room:RoomState,member:Member,model:OcclusionModel){
  const light=personalLight(room,member,model),m=room.board.map!;
  const ownTokenIds=room.board.tokens.filter(t=>t.kind==='player'&&room.assignments[t.id]===member.id).map(t=>t.id);
  const tokens=room.board.tokens.filter(t=>ownTokenIds.includes(t.id)||enemyInSight(t.x,t.y,m.width,m.height,model.width,model.height,light)).map(t=>({...t}));
  const openings=model.openings.filter(o=>o.pixels.some(p=>light[p]>20)).map(o=>({id:o.id,kind:o.kind,x:o.x/model.width*m.width,y:o.y/model.height*m.height,width:o.width/model.width*m.width,height:o.height/model.height*m.height,open:room.board.occlusion?.openIds.includes(o.id)??false}));
  return{role:'player' as const,revision:room.revision,scene:room.scene,code:room.code,memberId:member.id,members:room.members.map(({id,name})=>({id,name})),ownTokenIds,openings,board:{version:1 as const,map:{...m,src:''},tokens,gridSize:room.board.gridSize??50,gridVisible:room.board.gridVisible??false}};
}
export function move(room:RoomState,identity:Identity,id:unknown,x:unknown,y:unknown):void{
  const token=room.board.tokens.find(t=>t.id===id);
  if(!token||!room.board.map)throw Error('Token non disponibile.');
  if(identity.role!=='master'&&(token.kind!=='player'||room.assignments[token.id]!==identity.id))throw Error('Puoi muovere soltanto i tuoi personaggi.');
  if(typeof x!=='number'||!Number.isFinite(x)||typeof y!=='number'||!Number.isFinite(y)||x<0||y<0||x>room.board.map.width||y>room.board.map.height)throw Error('Posizione non valida.');
  token.x=x;token.y=y;
}
export function assign(room:RoomState,tokenId:unknown,memberId:unknown):void{
  const token=room.board.tokens.find(t=>t.id===tokenId);if(!token||token.kind!=='player')throw Error('Assegna soltanto token giocatore.');
  if(memberId===''){delete room.assignments[token.id];return}
  if(typeof memberId!=='string'||!room.members.some(m=>m.id===memberId))throw Error('Giocatore non valido.');
  room.assignments[token.id]=memberId;
}
export function redactMap(rgba:Uint8Array,width:number,height:number,light:Uint8Array,explored:Uint8Array,modelWidth:number,modelHeight:number):Uint8Array{
  const result=new Uint8Array(rgba.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,p=Math.floor(y/height*modelHeight)*modelWidth+Math.floor(x/width*modelWidth),intensity=light[p]/255;
    const factor=light[p]>20?Math.max(.28,intensity):explored[p]?.28:0;
    for(let c=0;c<3;c++)result[i+c]=factor?Math.round(rgba[i+c]*factor):[7,13,12][c];result[i+3]=255;
  }
  return result;
}
export function emptyModel(width:number,height:number):OcclusionModel{return segment(new Uint8Array(width*height*4),width,height)}
