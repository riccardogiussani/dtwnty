import {useEffect,useRef} from 'react';
import {fogOpacity} from './exploration';
import type {OcclusionModel} from './occlusion';

interface Props{model:OcclusionModel;mapWidth:number;mapHeight:number;light:Uint8Array|null;explored:Uint8Array;openIds:string[];enabled:boolean;master:boolean;onToggle:(id:string)=>void}
export default function FogLayer({model,mapWidth,mapHeight,light,explored,openIds,enabled,master,onToggle}:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(!ctx||!light||master||!enabled)return;const image=ctx.createImageData(model.width,model.height);for(let i=0;i<light.length;i++){image.data[i*4]=7;image.data[i*4+1]=13;image.data[i*4+2]=12;image.data[i*4+3]=fogOpacity(light[i],!!explored[i])}ctx.putImageData(image,0,0)},[light,explored,master,enabled,model]);
  return <><canvas ref={canvas} className="fog-canvas" width={model.width} height={model.height} style={{display:enabled&&!master?'block':'none'}} aria-hidden="true"/>
    <div className="opening-layer">{model.openings.map((opening,index)=>{
      const open=openIds.includes(opening.id);
      // In player view controls are shown only for openings reached by current light.
      if(enabled&&!master&&!opening.pixels.some(p=>(light?.[p]??0)>20))return null;
      const label=`${opening.kind==='door'?'Porta':'Finestra'} ${index+1}: ${open?'aperta':'chiusa'}`;
      return <button key={opening.id} className={`opening ${opening.kind} ${open?'is-open':''}`} style={{left:opening.x/model.width*mapWidth,top:opening.y/model.height*mapHeight,width:opening.width/model.width*mapWidth,height:opening.height/model.height*mapHeight}} title={label} aria-label={label} aria-pressed={open} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onToggle(opening.id)}}><span>{open?'○':'×'}</span></button>
    })}</div></>;
}
