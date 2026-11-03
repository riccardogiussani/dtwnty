import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,segment,blockers,visibility} from '../src/occlusion.ts';
import {validSession,emptySession} from '../src/session.ts';

function fixture(kind='door'){
  const width=31,height=21,rgba=new Uint8Array(width*height*4);
  const pixel=(x,y,c)=>rgba.set([...c,255],(y*width+x)*4);
  for(let y=0;y<height;y++)pixel(15,y,y>=9&&y<=11?(kind==='door'?[0,255,0]:[0,255,255]):[255,0,0]);
  for(let y=8;y<=12;y++)pixel(10,y,[255,255,0]);
  return segment(rgba,width,height);
}
test('JPEG-like colors, transparent background and custom classification',()=>{
  for(const [color,expected] of [[[230,15,8],1],[[12,235,14],2],[[15,220,240],3],[[235,231,15],4],[[8,5,3],0],[[255,0,255],5]])assert.equal(classify(...color),expected);
  assert.equal(classify(255,0,0,0),0);
});
for(const kind of ['door','window'])test(`${kind} opens and closes while walls remain opaque`,()=>{
  const m=fixture(kind),source=[{x:5,y:10,radius:40}];assert.equal(m.openings.length,1);assert.equal(m.openings[0].kind,kind);
  const closed=visibility(m.width,m.height,blockers(m,[]),source);assert.equal(closed[10*m.width+25],0);assert(closed[10*m.width+14]>0,'custom yellow does not block');
  const opened=visibility(m.width,m.height,blockers(m,[m.openings[0].id]),source);assert(opened[10*m.width+25]>0);assert.equal(opened[2*m.width+25],0,'wall casts shadow');
  assert.equal(visibility(m.width,m.height,blockers(m,[]),source)[10*m.width+25],0,'closing restores shadow');
});
test('lights combine, range is limited, blocked sources and missing players give darkness',()=>{
  const m=fixture(),solid=blockers(m,[]);
  assert(!visibility(m.width,m.height,solid,[]).some(Boolean));
  assert(!visibility(m.width,m.height,solid,[{x:15,y:0,radius:8}]).some(Boolean));
  assert(visibility(m.width,m.height,solid,[{x:5,y:10,radius:8},{x:25,y:10,radius:8}])[10*m.width+25]>0);
  assert.equal(visibility(m.width,m.height,solid,[{x:5,y:10,radius:3}])[10*m.width+12],0);
});
test('old sessions remain valid and occlusion settings survive JSON roundtrip',()=>{
  assert(validSession({version:1,map:null,tokens:[]}));assert(validSession(emptySession()));
  const image={src:'data:image/png;base64,AAAA',name:'test',width:31,height:21};
  const session={...emptySession(),map:image,occlusion:{image,openIds:['door-15-9-15-11']},fogEnabled:true,lightCells:8};
  const restored=JSON.parse(JSON.stringify(session));assert(validSession(restored));assert.deepEqual(restored,session);
  for(const lightCells of [0,101,NaN,'8'])assert(!validSession({...session,lightCells}));
  assert(!validSession({...session,occlusion:{image,openIds:['bad-id']}}));
  assert(!validSession({...session,occlusion:{image:{...image,width:0},openIds:[]}}));
});
