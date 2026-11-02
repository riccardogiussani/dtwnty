import {useEffect,useRef} from 'react';
import {fogOpacity} from './exploration';

export default function DmFog({width,height,light}:{width:number;height:number;light:Uint8Array}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(!ctx)return;const image=ctx.createImageData(width,height);for(let i=0;i<light.length;i++){image.data[i*4]=7;image.data[i*4+1]=13;image.data[i*4+2]=12;image.data[i*4+3]=fogOpacity(light[i],true)}ctx.putImageData(image,0,0)},[width,height,light]);
  return <canvas className="dm-visited-fog" ref={canvas} width={width} height={height} aria-hidden="true"/>;
}
