import test from 'node:test';
import assert from 'node:assert/strict';
import {segment} from '../src/occlusion.ts';
import {assign,editToken,settings,move,explore,personalLight,projectPlayer,redactMap} from '../worker/room-core.ts';
import {decodeExploration} from '../src/exploration.ts';
function fixture(){
  const width=31,height=21,data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)data.set([255,0,0,255],(y*width+15)*4);
  const model=segment(data,width,height),image={src:'data:image/png;base64,AAAA',name:'map',width,height};
  const token=(id,kind,x,y)=>({id,kind,x,y,size:24,name:id,src:'data:image/png;base64,AAAA'});
  const room={code:'ABCDEFGH',revision:1,scene:1,masterHash:'MASTER-HASH',members:[{id:'alice',name:'Alice',hash:'ALICE-HASH'},{id:'bob',name:'Bob',hash:'BOB-HASH'}],assignments:{a:'alice',b:'bob'},board:{version:1,map:image,tokens:[token('a','player',5,10),token('b','player',25,10),token('left-enemy','enemy',6,10),token('right-enemy','enemy',24,10)],gridSize:1,lightCells:8,occlusion:{image,openIds:[]}},expiresAt:Date.now()+60000};
  return{room,model};
}
test('server sends separate visual states without hidden token positions or private geometry',()=>{
  const {room,model}=fixture();explore(room,model);
  const alice=projectPlayer(room,room.members[0],model),bob=projectPlayer(room,room.members[1],model);
  assert.deepEqual(alice.board.tokens.map(t=>t.id),['a','left-enemy']);assert.deepEqual(bob.board.tokens.map(t=>t.id),['b','right-enemy']);
  const serialized=JSON.stringify(alice);for(const hidden of ['MASTER-HASH','BOB-HASH','right-enemy','assignments','occlusion'])assert(!serialized.includes(hidden));assert.equal(alice.board.map.src,'');
  const a=decodeExploration(room.members[0].explored,model.width,model.height),b=decodeExploration(room.members[1].explored,model.width,model.height);assert(a[10*31+5]);assert(!a[10*31+25]);assert(b[10*31+25]);assert(!b[10*31+5]);
});
test('ownership and position validation are enforced independently of the client',()=>{
  const {room}=fixture(),alice={role:'player',id:'alice'};
  assert.throws(()=>move(room,alice,'b',6,6));assert.throws(()=>move(room,alice,'left-enemy',6,6));assert.throws(()=>move(room,alice,'a',NaN,6));assert.throws(()=>move(room,alice,'a',-1,6));
  move(room,alice,'a',7,10);assert.equal(room.board.tokens[0].x,7);move(room,{role:'master',id:'master'},'right-enemy',20,10);assert.equal(room.board.tokens[3].x,20);
  assert.throws(()=>assign(room,'left-enemy','alice'));assert.throws(()=>assign(room,'a','nobody'));assign(room,'a','bob');assert.equal(room.assignments.a,'bob');
});
test('map pixels themselves are redacted and exploration is not transferred between members',()=>{
  const {room,model}=fixture();explore(room,model);const alice=room.members[0],rgba=new Uint8Array(model.width*model.height*4).fill(230),light=personalLight(room,alice,model),explored=decodeExploration(alice.explored,model.width,model.height);
  let output=redactMap(rgba,model.width,model.height,light,explored,model.width,model.height);assert.deepEqual([...output.slice((10*31+25)*4,(10*31+25)*4+4)],[7,13,12,255]);assert.equal(output[(10*31+5)*4],230);
  move(room,{role:'player',id:'alice'},'a',5,2);room.board.lightCells=2;explore(room,model);const current=personalLight(room,alice,model);output=redactMap(rgba,model.width,model.height,current,decodeExploration(alice.explored,31,21),31,21);assert.equal(output[(10*31+5)*4],64);assert(!projectPlayer(room,alice,model).board.tokens.some(t=>t.id==='left-enemy'));
});

test('shared ownership grants both players control and can be revoked independently',()=>{
  const {room,model}=fixture();assign(room,'a',['alice','bob','bob']);assert.deepEqual(room.assignments.a,['alice','bob']);
  move(room,{role:'player',id:'bob'},'a',7,10);assert(projectPlayer(room,room.members[1],model).ownTokenIds.includes('a'));
  assert.throws(()=>assign(room,'a',['alice','unknown']));assert.deepEqual(room.assignments.a,['alice','bob']);
  assign(room,'a',['alice']);assert.throws(()=>move(room,{role:'player',id:'bob'},'a',8,10));
  assert(!projectPlayer(room,room.members[1],model).ownTokenIds.includes('a'));
});
test('token names, sizes and scene settings validate before mutation',()=>{
  const {room}=fixture();editToken(room,'a',{name:'  Arwen  ',size:88});assert.equal(room.board.tokens[0].name,'Arwen');assert.equal(room.board.tokens[0].size,88);
  assert.throws(()=>editToken(room,'a',{name:'Changed',size:400}));assert.equal(room.board.tokens[0].name,'Arwen');
  assert.throws(()=>editToken(room,'a',{name:' '}));settings(room,{gridSize:75,lightCells:12,fogEnabled:true,gridVisible:true});assert.equal(room.board.gridSize,75);assert.equal(room.board.lightCells,12);
  assert.throws(()=>settings(room,{gridSize:1,fogEnabled:false}));assert.equal(room.board.fogEnabled,true);
});
