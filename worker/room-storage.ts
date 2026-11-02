import type {RoomState} from './room-core.ts';

// Every row stays well below SQLite Durable Objects' 2 MB row limit.
export const CHUNK_BYTES=256*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder();
export function splitBytes(bytes:Uint8Array):Uint8Array[]{const chunks:Uint8Array[]=[];for(let i=0;i<bytes.length;i+=CHUNK_BYTES)chunks.push(bytes.slice(i,i+CHUNK_BYTES));return chunks}
export function joinBytes(rows:{data:ArrayBuffer|Uint8Array}[]):Uint8Array{const chunks=rows.map(r=>new Uint8Array(r.data)),bytes=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes}

export class SqliteRoomStore{
  private sql:SqlStorage;
  private transaction:<T>(fn:()=>T)=>T;
  private hashes=new Map<string,string>();
  constructor(sql:SqlStorage,transaction:<T>(fn:()=>T)=>T){
    this.sql=sql;this.transaction=transaction;
    sql.exec('CREATE TABLE IF NOT EXISTS room_assets (asset_id TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (asset_id,part))');
    sql.exec('CREATE TABLE IF NOT EXISTS room_state (part INTEGER PRIMARY KEY, data BLOB NOT NULL)');
  }
  read():RoomState|null{
    const rows=this.sql.exec<{data:ArrayBuffer}>('SELECT data FROM room_state ORDER BY part').toArray();if(!rows.length)return null;
    const room=JSON.parse(decoder.decode(joinBytes(rows))) as RoomState;
    const loaded=new Map<string,string>();
    const restore=(ref:string)=>{if(!ref.startsWith('asset:'))throw Error('Formato archivio stanza non valido.');const id=ref.slice(6);let src=loaded.get(id);if(!src){const chunks=this.sql.exec<{data:ArrayBuffer}>('SELECT data FROM room_assets WHERE asset_id = ? ORDER BY part',id).toArray();if(!chunks.length)throw Error('Immagine della stanza mancante.');src=decoder.decode(joinBytes(chunks));loaded.set(id,src);this.hashes.set(src,id)}return src};
    if(room.board.map)room.board.map.src=restore(room.board.map.src);
    for(const t of room.board.tokens)t.src=restore(t.src);
    if(room.board.occlusion)room.board.occlusion.image.src=restore(room.board.occlusion.image.src);
    return room;
  }
  async write(room:RoomState):Promise<void>{
    const required=new Set<string>(),pending=new Map<string,Uint8Array[]>();
    const reference=async(src:string)=>{
      let id=this.hashes.get(src);
      if(!id){const bytes=encoder.encode(src),digest=await crypto.subtle.digest('SHA-256',bytes);id=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');this.hashes.set(src,id)}
      required.add(id);
      if(!pending.has(id)&&!this.sql.exec('SELECT 1 FROM room_assets WHERE asset_id = ? LIMIT 1',id).toArray().length)pending.set(id,splitBytes(encoder.encode(src)));
      return'asset:'+id;
    };
    // Images are stored once, separately from frequently changing positions and exploration.
    const board={...room.board,tokens:room.board.tokens.map(t=>({...t}))};
    if(board.map)board.map={...board.map,src:await reference(board.map.src)};
    for(const t of board.tokens)t.src=await reference(t.src);
    if(board.occlusion)board.occlusion={...board.occlusion,image:{...board.occlusion.image,src:await reference(board.occlusion.image.src)}};
    const chunks=splitBytes(encoder.encode(JSON.stringify({...room,board})));
    this.transaction(()=>{
      for(const [id,parts] of pending)for(let i=0;i<parts.length;i++)this.sql.exec('INSERT INTO room_assets (asset_id,part,data) VALUES (?,?,?)',id,i,parts[i]);
      this.sql.exec('DELETE FROM room_state');
      for(let i=0;i<chunks.length;i++)this.sql.exec('INSERT INTO room_state (part,data) VALUES (?,?)',i,chunks[i]);
      for(const {asset_id} of this.sql.exec<{asset_id:string}>('SELECT DISTINCT asset_id FROM room_assets').toArray())if(!required.has(asset_id))this.sql.exec('DELETE FROM room_assets WHERE asset_id = ?',asset_id);
    });
    for(const [src,id] of this.hashes)if(!required.has(id))this.hashes.delete(src);
  }
}
