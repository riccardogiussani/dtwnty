import type {Session,Token} from './session.ts';

export function lightCellsFor(token:Token,board:Session):number{return token.lightCells??board.lightCells??8}
export function tokenDrop(board:Session,x:number,y:number):{x:number;y:number}{
  if(!board.snapToGrid||!board.map)return{x,y};
  const size=board.gridSize??50;
  const axis=(value:number,extent:number)=>extent<size/2?extent/2:(Math.max(0,Math.min(Math.floor((extent-size/2)/size),Math.floor(value/size)))+.5)*size;
  return{x:axis(x,board.map.width),y:axis(y,board.map.height)};
}
