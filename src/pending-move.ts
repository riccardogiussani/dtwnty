export interface PendingMove{id:string;x:number;y:number;scene:number;revision:number;requestId:string;acceptedRevision?:number}
export interface MoveSnapshot{scene:number;revision:number;board:{tokens:{id:string}[]}}
// A broadcast can arrive before the POST acknowledgement, or while a personal map is downloading.
// Keep the dropped position until a rendered snapshot includes that acknowledged revision.
export function reconcileMove(move:PendingMove|null,snapshot:MoveSnapshot|null):PendingMove|null{
  if(!move||!snapshot)return move;
  if(snapshot.scene!==move.scene||!snapshot.board.tokens.some(t=>t.id===move.id))return null;
  return move.acceptedRevision!==undefined&&snapshot.revision>=move.acceptedRevision?null:move;
}
