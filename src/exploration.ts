export interface Exploration {width:number;height:number;bits:string}
export function validExploration(value:unknown):value is Exploration {
  if(!value||typeof value!=='object')return false;
  const e=value as Exploration;
  return Number.isInteger(e.width)&&Number.isInteger(e.height)&&e.width>0&&e.height>0&&e.width<=1200&&e.height<=1200&&typeof e.bits==='string'&&e.bits.length===4*Math.ceil(Math.ceil(e.width*e.height/8)/3)&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e.bits);
}
export function decodeExploration(saved:Exploration|undefined,width:number,height:number):Uint8Array {
  const result=new Uint8Array(width*height);
  if(!saved||saved.width!==width||saved.height!==height||!validExploration(saved))return result;
  try{const bytes=atob(saved.bits);if(bytes.length!==Math.ceil(result.length/8))return result;for(let i=0;i<result.length;i++)result[i]=(bytes.charCodeAt(i>>3)>>(i&7))&1}catch{return result}
  return result;
}
export function remember(light:Uint8Array,previous:Uint8Array):Uint8Array|null {
  let next:Uint8Array|null=null;
  for(let i=0;i<light.length;i++)if(light[i]>20&&!previous[i]){next??=previous.slice();next[i]=1}
  return next;
}
export function encodeExploration(cells:Uint8Array,width:number,height:number):Exploration {
  const bytes=new Uint8Array(Math.ceil(cells.length/8));for(let i=0;i<cells.length;i++)if(cells[i])bytes[i>>3]|=1<<(i&7);
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return{width,height,bits:btoa(binary)};
}
export function fogOpacity(light:number,explored:boolean):number{return Math.min(255-light,explored?185:255)}
export function enemyInSight(x:number,y:number,mapWidth:number,mapHeight:number,width:number,height:number,light:Uint8Array|null):boolean{
  const cx=Math.max(0,Math.min(width-1,Math.floor(x/mapWidth*width))),cy=Math.max(0,Math.min(height-1,Math.floor(y/mapHeight*height)));
  return (light?.[cy*width+cx]??0)>20;
}
