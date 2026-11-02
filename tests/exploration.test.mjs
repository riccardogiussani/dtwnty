import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeExploration,encodeExploration,remember,fogOpacity,enemyInSight,validExploration} from '../src/exploration.ts';
import {emptySession,validSession} from '../src/session.ts';

test('explored cells accumulate, are not mutated and stop producing updates when unchanged',()=>{
  const previous=new Uint8Array([1,0,0,0]);
  const next=remember(new Uint8Array([0,255,5,0]),previous);
  assert.deepEqual([...previous],[1,0,0,0]);assert.deepEqual([...next],[1,1,0,0]);
  assert.equal(remember(new Uint8Array([0,255,0,0]),next),null);
  assert.deepEqual([...remember(new Uint8Array([0,0,255,0]),next)],[1,1,1,0]);
});
test('visited terrain stays in shadow while unseen terrain remains opaque',()=>{
  assert.equal(fogOpacity(0,false),255);assert.equal(fogOpacity(0,true),185);
  assert.equal(fogOpacity(255,true),0);assert.equal(fogOpacity(200,true),55);
});
test('enemies disappear when current light leaves, even though their terrain stays explored',()=>{
  const light=new Uint8Array([255,255,0,0]);const explored=remember(light,new Uint8Array(4));
  assert(enemyInSight(25,25,100,100,2,2,light));
  const moved=new Uint8Array([0,0,255,255]);
  assert(!enemyInSight(25,25,100,100,2,2,moved));
  assert.equal(explored[0],1);assert.equal(fogOpacity(moved[0],!!explored[0]),185);
  assert(!enemyInSight(25,25,100,100,2,2,null));
});
test('exploration survives export/import including bit packing across byte boundaries',()=>{
  const cells=Uint8Array.from({length:35},(_,i)=>i%3===0?1:0),encoded=encodeExploration(cells,7,5);
  assert(validExploration(encoded));assert.deepEqual(decodeExploration(JSON.parse(JSON.stringify(encoded)),7,5),cells);
  assert.deepEqual(decodeExploration(encoded,5,7),new Uint8Array(35));
  const image={src:'data:image/png;base64,AAAA',name:'test',width:70,height:50};
  const session={...emptySession(),map:image,occlusion:{image,openIds:[],explored:encoded}};
  assert(validSession(JSON.parse(JSON.stringify(session))));
  assert(!validSession({...session,occlusion:{...session.occlusion,explored:{...encoded,bits:'bad'}}}));
  assert(!validExploration({...encoded,width:1201}));
});
