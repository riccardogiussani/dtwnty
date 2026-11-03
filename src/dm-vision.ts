import {lightCellsFor} from './table-rules.ts';
import {blockers,visibility} from './occlusion.ts';
import type {OcclusionModel} from './occlusion.ts';
import type {Session} from './session.ts';
import {enemyInSight} from './exploration.ts';

export function dmVision(board:Session|undefined,model:OcclusionModel|null,selected:string|null){
  const map=board?.map,scale=map?Math.min(1,1200/Math.max(map.width,map.height)):1;
  const width=model?.width??Math.max(1,Math.round((map?.width??1)*scale)),height=model?.height??Math.max(1,Math.round((map?.height??1)*scale));
  const source=board?.tokens.find(t=>t.id===selected),all=board?.tokens.map(t=>t.id)??[];
  if(!map||!source)return{width,height,light:new Uint8Array(width*height),visibleIds:all,filtered:false};
  // A loading mask must not briefly expose tokens through walls. The selected token stays visible.
  const light=board?.occlusion&&!model?new Uint8Array(width*height):visibility(width,height,model?blockers(model,board?.occlusion?.openIds??[]):new Uint8Array(width*height),[{x:source.x/map.width*width,y:source.y/map.height*height,radius:lightCellsFor(source,board!)*(board?.gridSize??50)/map.width*width}]);
  const visibleIds=board!.tokens.filter(t=>t.id===source.id||enemyInSight(t.x,t.y,map.width,map.height,width,height,light)).map(t=>t.id);
  return{width,height,light,visibleIds,filtered:true};
}
