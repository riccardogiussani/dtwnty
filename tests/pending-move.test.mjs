import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileMove} from '../src/pending-move.ts';
const move={id:'hero',x:220,y:180,scene:1,revision:10,requestId:'move-1'};
const snapshot=(revision,scene=1,tokens=[{id:'hero'}])=>({revision,scene,board:{tokens}});
test('dropped position survives stale snapshots and broadcasts before the command acknowledgement',()=>{
  assert.equal(reconcileMove(move,snapshot(10)),move);assert.equal(reconcileMove(move,snapshot(11)),move);
  const accepted={...move,acceptedRevision:12};assert.equal(reconcileMove(accepted,snapshot(11)),accepted);
});
test('optimistic position clears once the accepted snapshot is rendered, including shared-token corrections',()=>{
  const accepted={...move,acceptedRevision:12};assert.equal(reconcileMove(accepted,snapshot(12)),null);assert.equal(reconcileMove(accepted,snapshot(13)),null);
  // Handles a snapshot that arrived before the acknowledgement updated local state.
  assert.equal(reconcileMove({...move,acceptedRevision:11},snapshot(11)),null);
});
test('changing scenes, removing a token or revoking its visibility discards the pending move',()=>{
  assert.equal(reconcileMove(move,snapshot(10,2)),null);assert.equal(reconcileMove(move,snapshot(11,1,[])),null);
  assert.equal(reconcileMove(move,null),move);assert.equal(reconcileMove(null,snapshot(10)),null);
});
