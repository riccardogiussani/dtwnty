import type {MapImage} from './session';
import type {Exploration} from './exploration';

export type Opening={id:string;kind:'door'|'window';x:number;y:number;width:number;height:number;pixels:number[]};
export type OcclusionModel={width:number;height:number;labels:Uint8Array;owners:Int32Array;openings:Opening[];walls:number;custom:number;unknown:number};
export type OcclusionSettings={image:MapImage;openIds:string[];explored?:Exploration};
// Saturation and channel ratios tolerate JPEG compression without treating dark background as geometry.
export function classify(r:number,g:number,b:number,a=255):number{
  if(a<128||Math.max(r,g,b)<100||Math.max(r,g,b)-Math.min(r,g,b)<65)return 0;
  if(r>g*1.6&&r>b*1.6)return 1;
  if(g>r*1.6&&g>b*1.35)return 2;
  if(g>r*1.5&&b>r*1.5&&Math.min(g,b)>Math.max(g,b)*.5)return 3;
  if(r>b*1.6&&g>b*1.6&&Math.min(r,g)>Math.max(r,g)*.5)return 4;
  return 5;
}
export function segment(data:ArrayLike<number>,width:number,height:number):OcclusionModel{
  const labels=new Uint8Array(width*height),owners=new Int32Array(width*height);owners.fill(-1);
  let walls=0,custom=0,unknown=0;
  for(let i=0;i<labels.length;i++){labels[i]=classify(data[i*4],data[i*4+1],data[i*4+2],data[i*4+3]);if(labels[i]===1)walls++;if(labels[i]===4)custom++;if(labels[i]===5)unknown++}
  const visited=new Uint8Array(labels.length),openings:Opening[]=[];
  for(let i=0;i<labels.length;i++){
    const category=labels[i];if(visited[i]||(category!==2&&category!==3))continue;
    const pixels=[i];visited[i]=1;let minX=width,minY=height,maxX=0,maxY=0;
    for(let q=0;q<pixels.length;q++){
      const p=pixels[q],x=p%width,y=Math.floor(p/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const n of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(n>=0&&!visited[n]&&labels[n]===category){visited[n]=1;pixels.push(n)}
    }
    // Discard isolated compression speckles; component IDs stay deterministic on reload.
    if(pixels.length<3){for(const p of pixels)labels[p]=0;continue}
    const index=openings.length,kind=category===2?'door':'window';
    openings.push({id:`${kind}-${minX}-${minY}-${maxX}-${maxY}`,kind,x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,pixels});for(const p of pixels)owners[p]=index;
  }
  return{width,height,labels,owners,openings,walls,custom,unknown};
}
let cached:{src:string;promise:Promise<OcclusionModel>}|null=null;
export function loadOcclusion(image:MapImage):Promise<OcclusionModel>{
  if(cached?.src===image.src)return cached.promise;
  const promise=new Promise<OcclusionModel>((resolve,reject)=>{
    const img=new Image();img.onerror=()=>reject(Error('Occlusion map non leggibile.'));img.onload=()=>{
      try{const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight)),width=Math.max(1,Math.round(img.naturalWidth*scale)),height=Math.max(1,Math.round(img.naturalHeight*scale));
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas non disponibile.');ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0,width,height);const model=segment(ctx.getImageData(0,0,width,height).data,width,height);if(!model.walls&&!model.openings.length)throw Error('Nessun muro, porta o finestra riconosciuto. Controlla i colori.');resolve(model);
      }catch(error){reject(error)}
    };img.src=image.src;
  });cached={src:image.src,promise};return promise;
}
export function blockers(model:OcclusionModel,openIds:string[]):Uint8Array{
  const open=new Set(openIds),result=new Uint8Array(model.labels.length);
  for(let i=0;i<result.length;i++){const label=model.labels[i],owner=model.owners[i];result[i]=label===1||((label===2||label===3)&&owner>=0&&!open.has(model.openings[owner].id))?1:0}
  return result;
}
export type Light={x:number;y:number;radius:number};
// Recursive octant shadow casting: opaque cells are visible themselves but cast shadows behind them.
export function visibility(width:number,height:number,solid:Uint8Array,lights:Light[]):Uint8Array{
  const light=new Uint8Array(width*height);
  const transforms=[[1,0,0,1],[0,1,1,0],[0,-1,1,0],[-1,0,0,1],[-1,0,0,-1],[0,-1,-1,0],[0,1,-1,0],[1,0,0,-1]];
  for(const source of lights){
    const cx=Math.floor(source.x),cy=Math.floor(source.y),radius=Math.max(1,source.radius);
    if(cx<0||cy<0||cx>=width||cy>=height||solid[cy*width+cx])continue;
    light[cy*width+cx]=255;
    const mark=(x:number,y:number)=>{const distance=Math.hypot(x-cx,y-cy);if(distance>radius)return;const intensity=Math.round(255*Math.min(1,(radius-distance)/Math.max(1,radius*.16)));const p=y*width+x;light[p]=Math.max(light[p],intensity)};
    function cast(row:number,start:number,end:number,xx:number,xy:number,yx:number,yy:number):void{
      if(start<end)return;let next=start;
      for(let distance=row;distance<=Math.ceil(radius);distance++){
        let blocked=false;const dy=-distance;
        for(let dx=-distance;dx<=0;dx++){
          const left=(dx-.5)/(dy+.5),right=(dx+.5)/(dy-.5);if(start<right)continue;if(end>left)break;
          const x=cx+dx*xx+dy*xy,y=cy+dx*yx+dy*yy;if(x<0||y<0||x>=width||y>=height)continue;mark(x,y);const opaque=!!solid[y*width+x];
          if(blocked){if(opaque){next=right;continue}blocked=false;start=next}
          else if(opaque&&distance<radius){blocked=true;cast(distance+1,start,left,xx,xy,yx,yy);next=right}
        }
        if(blocked)break;
      }
    }
    for(const [xx,xy,yx,yy] of transforms)cast(1,1,0,xx,xy,yx,yy);
  }
  return light;
}
