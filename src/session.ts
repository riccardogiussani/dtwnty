export interface MapImage {src:string;name:string;width:number;height:number}
export interface Token {id:string;kind:'player'|'enemy';src:string;name:string;size:number;x:number;y:number;lightCells?:number}
import type {OcclusionSettings} from './occlusion';
import {validExploration} from './exploration.ts';
export interface Session {version:1;map:MapImage|null;tokens:Token[];gridSize?:number;gridVisible?:boolean;snapToGrid?:boolean;occlusion?:OcclusionSettings;fogEnabled?:boolean;lightCells?:number}
export interface View {x:number;y:number;scale:number}
export const emptySession=():Session=>({version:1,map:null,tokens:[],gridSize:50,gridVisible:false});
export function validSession(value:unknown):value is Session {
  if(!value||typeof value!=='object')return false;
  const s=value as Session;
  const image=(x:unknown)=>typeof x==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(x);
  const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
  if(s.gridSize!==undefined&&(!finite(s.gridSize)||!Number.isInteger(s.gridSize)||s.gridSize<10||s.gridSize>300))return false;
  if(s.gridVisible!==undefined&&typeof s.gridVisible!=='boolean')return false;
  if(s.snapToGrid!==undefined&&typeof s.snapToGrid!=='boolean')return false;
  if(s.fogEnabled!==undefined&&typeof s.fogEnabled!=='boolean')return false;
  if(s.lightCells!==undefined&&(!finite(s.lightCells)||!Number.isInteger(s.lightCells)||s.lightCells<1||s.lightCells>100))return false;
  if(s.occlusion?.explored!==undefined&&!validExploration(s.occlusion.explored))return false;
  if(s.occlusion!==undefined){const o=s.occlusion,m=o?.image;if(!s.map||!m||!image(m.src)||typeof m.name!=='string'||!finite(m.width)||!finite(m.height)||m.width<=0||m.height<=0||m.width>100000||m.height>100000||!Array.isArray(o.openIds)||o.openIds.length>10000||!o.openIds.every(id=>typeof id==='string'&&/^(door|window)-\d+-\d+-\d+-\d+$/.test(id)))return false}
  return s.version===1&&Array.isArray(s.tokens)&&s.tokens.length<=500&&(s.map===null?s.tokens.length===0:!!s.map&&image(s.map.src)&&typeof s.map.name==='string'&&finite(s.map.width)&&finite(s.map.height)&&s.map.width>0&&s.map.height>0&&s.map.width<=100000&&s.map.height<=100000)&&s.tokens.every(t=>t&&(t.lightCells===undefined||finite(t.lightCells)&&Number.isInteger(t.lightCells)&&t.lightCells>=1&&t.lightCells<=100)&&typeof t.id==='string'&&/^[a-zA-Z0-9-]+$/.test(t.id)&&typeof t.name==='string'&&image(t.src)&&['player','enemy'].includes(t.kind)&&finite(t.x)&&finite(t.y)&&finite(t.size)&&t.size>=24&&t.size<=180&&t.x>=0&&t.y>=0&&!!s.map&&t.x<=s.map.width&&t.y<=s.map.height)&&new Set(s.tokens.map(t=>t.id)).size===s.tokens.length;
}
export async function readImage(file:File):Promise<MapImage>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Scegli un’immagine PNG, JPG o WebP.');
  if(file.size>20*1024*1024)throw Error('L’immagine supera 20 MB.');
  const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Impossibile leggere il file.'));reader.readAsDataURL(file)});
  const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Immagine non valida.'));img.src=src});
  return{src,width:img.naturalWidth,height:img.naturalHeight,name:file.name.replace(/\.[^.]+$/,'')};
}
