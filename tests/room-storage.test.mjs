import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {CHUNK_BYTES,SqliteRoomStore,joinBytes} from '../worker/room-storage.ts';

function database(){
  const db=new DatabaseSync(':memory:');let assetWrites=0,fail=false;
  const sql={exec(query,...args){if(fail&&query.startsWith('INSERT INTO room_state'))throw Error('simulated write failure');if(query.startsWith('INSERT INTO room_assets'))assetWrites++;const rows=db.prepare(query).all(...args);return{toArray:()=>rows}}};
  const transaction=fn=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
  return{db,sql,transaction,writes:()=>assetWrites,fail:value=>{fail=value}};
}
function room(){const image={src:'data:image/png;base64,'+'A'.repeat(700000),width:1200,height:988,name:'Map 🌒'};return{code:'ABCDEFGH',revision:1,scene:1,masterHash:'test',members:[{id:'a',name:'Alice 🧙',hash:'a'}],assignments:{a:'a'},board:{version:1,map:image,tokens:[{id:'a',kind:'player',x:10,y:20,size:64,name:'Player',src:image.src}],occlusion:{image:{...image},openIds:[]}},expiresAt:Date.now()+60000}}
test('large images use bounded BLOB chunks and recover exactly after a fresh store is created',async()=>{
  const {db,sql,transaction}=database();try{const value=room();await new SqliteRoomStore(sql,transaction).write(value);const restored=new SqliteRoomStore(sql,transaction).read();assert.deepEqual(restored,value);assert.equal(value.board.map.src.startsWith('data:'),true);
  const rows=sql.exec('SELECT length(data) AS size FROM room_assets').toArray();assert(rows.length>=3);assert(rows.every(r=>r.size<=CHUNK_BYTES));
  const state=new TextDecoder().decode(joinBytes(sql.exec('SELECT data FROM room_state ORDER BY part').toArray()));assert(state.includes('asset:'));assert(!state.includes('A'.repeat(100)));assert.equal(sql.exec('SELECT count(DISTINCT asset_id) AS count FROM room_assets').toArray()[0].count,1);
  }finally{db.close()}
});
test('movement does not rewrite images and larger per-player history survives chunking',async()=>{
  const {db,sql,transaction,writes}=database();try{const store=new SqliteRoomStore(sql,transaction),value=room();await store.write(value);const first=writes();value.revision++;value.board.tokens[0].x=30;value.members[0].explored={width:1200,height:988,bits:'A'.repeat(500000)};await store.write(value);assert.equal(writes(),first);assert.deepEqual(new SqliteRoomStore(sql,transaction).read(),value);assert(sql.exec('SELECT part FROM room_state').toArray().length>1)}finally{db.close()}
});
test('failed saves roll back both state and image changes, and obsolete images are removed',async()=>{
  const {db,sql,transaction,fail}=database();try{const store=new SqliteRoomStore(sql,transaction),previous=room();await store.write(previous);const next=structuredClone(previous);next.board.map.src='data:image/png;base64,NEW';next.board.tokens=[];delete next.board.occlusion;next.revision++;
  fail(true);await assert.rejects(store.write(next),/simulated/);fail(false);assert.deepEqual(new SqliteRoomStore(sql,transaction).read(),previous);assert.equal(sql.exec('SELECT count(DISTINCT asset_id) AS count FROM room_assets').toArray()[0].count,1);
  await store.write(next);assert.deepEqual(store.read(),next);assert.equal(sql.exec('SELECT count(DISTINCT asset_id) AS count FROM room_assets').toArray()[0].count,1);
  }finally{db.close()}
});
