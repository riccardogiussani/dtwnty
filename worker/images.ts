import {decode,encode} from 'fast-png';
import {Buffer} from 'node:buffer';
export function decodePng(src:string){
  if(!src.startsWith('data:image/png;base64,')||src.length>12_000_000)throw Error('Le immagini online devono essere PNG preparati dall’app.');
  const buffer=Buffer.from(src.slice(src.indexOf(',')+1),'base64');
  // Check IHDR before decoding to reject decompression bombs.
  if(buffer.length<24||buffer.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('PNG non valido.');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
  if(!width||!height||width>1200||height>1200)throw Error('Le immagini online possono avere al massimo 1200 pixel per lato.');
  const image=decode(buffer,{checkCrc:true});
  if(image.depth!==8||image.palette)throw Error('Usa PNG RGB o RGBA a 8 bit.');
  const data=new Uint8Array(width*height*4);
  for(let i=0;i<width*height;i++){const p=i*image.channels;data[i*4]=image.data[p];data[i*4+1]=image.data[p+(image.channels>=3?1:0)];data[i*4+2]=image.data[p+(image.channels>=3?2:0)];data[i*4+3]=image.channels===4?image.data[p+3]:image.channels===2?image.data[p+1]:255}
  return{width,height,data};
}
export function encodePng(width:number,height:number,data:Uint8Array):Uint8Array{return encode({width,height,data,depth:8,channels:4},{zlib:{level:3}})}
