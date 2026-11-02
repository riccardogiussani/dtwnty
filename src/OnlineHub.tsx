import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as Pointer,ChangeEvent,FormEvent} from 'react';
import {readImage,validSession} from './session';
import type {Session,Token,View} from './session';
import {blankBoard,prepareBoard,request,serverUrl,tokenOwners} from './online';
import type {Credential,Snapshot} from './online';
import {loadOcclusion} from './occlusion';
import OcclusionPrompt from './OcclusionPrompt';
import DmFog from './DmFog';
import {dmVision} from './dm-vision';
import {reconcileMove} from './pending-move';
import type {PendingMove} from './pending-move';
import type {OcclusionModel} from './occlusion';
const storageKey='dtwnty-online-access';
function savedAccess():Credential|null{try{const value=JSON.parse(localStorage.getItem(storageKey)??'null');if(value&&['master','player'].includes(value.role)&&/^[A-Z2-9]{8}$/.test(value.code)&&typeof value.secret==='string'&&value.secret.length<200)return{...value,url:serverUrl(value.url)}}catch{}return null}
export default function OnlineHub(){
  const [saved,setSaved]=useState<Credential|null>(savedAccess),[access,setAccess]=useState<Credential|null>(null),[mode,setMode]=useState<'player'|'master'>('player');
  const [url,setUrl]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('server')??import.meta.env.VITE_ROOM_SERVER??'https://dtwnty-rooms.riciriccio.workers.dev'),[name,setName]=useState(''),[code,setCode]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('room')??''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function enter(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const base=serverUrl(url),room=code.trim().toUpperCase();
    if(mode==='player'&&(!name.trim()||room.length!==8))throw Error('Inserisci nome e codice partita.');
    if(mode==='master'&&!key)throw Error('Inserisci la chiave DM.');
    const path=mode==='player'?`/rooms/${room}/join`:room?`/rooms/${room}/dm`:'/rooms';
    const input=mode==='player'?{name}:room?{}:{board:blankBoard()};
    const data=await request<Omit<Credential,'url'>>(base,path,undefined,input,mode==='master'?key:undefined);
    const credential={...data,url:base};localStorage.setItem(storageKey,JSON.stringify(credential));setSaved(credential);setAccess(credential);setKey('');
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  if(access)return <OnlineTable access={access} onLeave={()=>setAccess(null)}/>;
  return <main className="login-page"><div className="login-flower" aria-hidden="true">❧</div><form className="login-card" onSubmit={enter}><a className="brand" href="./">✳ <span>dtwnty<small>UN TAVOLO. INFINITE STORIE.</small></span></a><div className="chapter">LA PROSSIMA STORIA VI ASPETTA</div><h1>Ritroviamoci<br/><em>all’avventura.</em></h1><p>Prendi posto al tavolo. Il tuo mondo è qui.</p><div className="login-tabs" role="group" aria-label="Tipo di accesso"><button type="button" aria-pressed={mode==='player'} onClick={()=>{setMode('player');setError('')}}>Giocatore</button><button type="button" aria-pressed={mode==='master'} onClick={()=>{setMode('master');setError('')}}>Dungeon Master</button></div>
    {mode==='player'&&<label>Il tuo nome<input required autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder="Come ti chiami?"/></label>}
    <label>Codice partita {mode==='master'&&<small>facoltativo</small>}<input required={mode==='player'} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={8} pattern="[A-Z2-9]{8}" placeholder={mode==='master'?'Vuoto per creare una nuova partita':'Es. ABCD2345'}/></label>
    {mode==='master'&&<label>Chiave DM<input required type="password" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off" placeholder="La tua chiave di accesso"/></label>}
    <button className="login-submit" disabled={busy}>{busy?'Apertura del tavolo…':mode==='player'?'Entra nella partita':code.trim()?'Accedi come DM':'Crea una nuova partita'} <span>↗</span></button>
    {saved&&<button className="resume-login" type="button" disabled={busy} onClick={()=>setAccess(saved)}>Riprendi {saved.code} · {saved.role==='master'?'DM':'giocatore'}</button>}
    {error&&<p className="online-error" role="alert">{error}</p>}
    <details className="login-advanced"><summary>Impostazioni di connessione</summary><label>Server<input value={url} onChange={e=>setUrl(e.target.value)} type="url"/></label></details><div className="login-note">❧ Una mappa. La vostra immaginazione. Infinite storie.</div>
  </form></main>;
}
function OnlineTable({access,onLeave}:{access:Credential;onLeave:()=>void}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[mapSrc,setMapSrc]=useState(''),[status,setStatus]=useState('Connessione…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[view,setView]=useState<View>({x:0,y:0,scale:1}),[preview,setPreview]=useState<{id:string;x:number;y:number}|null>(null),[model,setModel]=useState<OcclusionModel|null>(null);
  const viewport=useRef<HTMLElement>(null),whole=useRef<HTMLDivElement>(null),current=useRef(snapshot),gesture=useRef<{pointer:number;id?:string;x:number;y:number;vx:number;vy:number}|null>(null),previewRef=useRef(preview),blobUrl=useRef(''),reload=useRef<()=>Promise<void>>(async()=>{});current.current=snapshot;
  const endpoint=`/rooms/${access.code}`;
  const [viewAs,setViewAs]=useState(''),[loadedViewAs,setLoadedViewAs]=useState('');
  const viewAsRef=useRef(viewAs);viewAsRef.current=viewAs;
  useEffect(()=>{void reload.current()},[viewAs]);
  const [pendingMove,setPendingMove]=useState<PendingMove|null>(null);
  useEffect(()=>{setPendingMove(move=>reconcileMove(move,snapshot))},[snapshot,pendingMove?.acceptedRevision]);
  const [selected,setSelected]=useState<string|null>(null),[uploading,setUploading]=useState(false),[renaming,setRenaming]=useState(false),[draftName,setDraftName]=useState('');
  const selectedToken=snapshot?.board.tokens.find(t=>t.id===selected);
  useEffect(()=>{setDraftName(selectedToken?.name??'');setRenaming(false)},[selectedToken?.id,selectedToken?.name]);
  async function replaceBoard(board:Session){const revision=current.current?.revision;if(revision===undefined)return;setUploading(true);try{await command({type:'replace',board:await prepareBoard(board)},revision)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setUploading(false)}}
  async function upload(e:ChangeEvent<HTMLInputElement>,kind:'map'|'occlusion'|'player'|'enemy'){
    const input=e.currentTarget,files=Array.from(input.files??[]);input.value='';const board=current.current?.board;if(!board||!files.length)return;
    setUploading(true);setError('');try{
      if(kind==='map'){const map=await readImage(files[0]),old=board.map;await replaceBoard({...board,map,occlusion:undefined,tokens:board.tokens.map(t=>({...t,x:old?t.x/old.width*map.width:map.width/2,y:old?t.y/old.height*map.height:map.height/2}))})}
      else if(kind==='occlusion'){if(!board.map)throw Error('Carica prima una mappa.');const image=await readImage(files[0]);if(Math.abs((image.width/image.height)/(board.map.width/board.map.height)-1)>.01)throw Error('La occlusion map deve avere lo stesso rapporto della mappa.');await loadOcclusion(image);await replaceBoard({...board,occlusion:{image,openIds:[]}})}
      else{if(!board.map)throw Error('Carica prima una mappa.');if(board.tokens.length+files.length>100)throw Error('Massimo 100 token.');const added:Token[]=[];for(const file of files){const image=await readImage(file);const el=viewport.current;const x=el?(el.clientWidth/2-view.x)/view.scale:board.map.width/2,y=el?(el.clientHeight/2-view.y)/view.scale:board.map.height/2;added.push({id:crypto.randomUUID(),kind,src:image.src,name:image.name.slice(0,40),size:64,x:Math.max(0,Math.min(board.map.width,x+added.length*20)),y:Math.max(0,Math.min(board.map.height,y+added.length*20))})}await replaceBoard({...board,tokens:[...board.tokens,...added]});setSelected(added.at(-1)?.id??null)}
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setUploading(false)}
  }
  function exportBoard(){if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot.board)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`dtwnty-${access.code}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  async function importBoard(e:ChangeEvent<HTMLInputElement>){const input=e.currentTarget,file=input.files?.[0];input.value='';if(!file)return;try{if(file.size>150*1024*1024)throw Error('File troppo grande.');const board:unknown=JSON.parse(await file.text());if(!validSession(board)||!board.map)throw Error('Sessione non valida o senza mappa.');if(!confirm('Sostituire la scena attuale con la sessione importata?'))return;await replaceBoard(board);setSelected(null)}catch(e){setError(e instanceof Error?e.message:String(e))}}

  useEffect(()=>{
    let active=true,socket:WebSocket|null=null,timer:ReturnType<typeof setTimeout>,refreshTimer:ReturnType<typeof setTimeout>,refreshing=false,again=false;
    const refresh=async()=>{if(refreshing){again=true;return}refreshing=true;try{do{again=false;const target=viewAsRef.current,query=target?'?viewAs='+encodeURIComponent(target):'';const next=await request<Snapshot>(access.url,endpoint+'/snapshot'+query,access.secret);let src=next.board.map?.src??'';
      if(next.role==='player'||next.perspective){const response=await fetch(access.url+endpoint+'/map'+query,{headers:{Authorization:`Bearer ${access.secret}`}});if(!response.ok)throw Error('Impossibile aggiornare la visuale.');const blob=await response.blob();if(!active)break;src=URL.createObjectURL(blob);if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);blobUrl.current=src}
      if(!active)break;if(target!==viewAsRef.current){again=true;continue}setSnapshot(next);setMapSrc(src);setLoadedViewAs(target);setError('');
    }while(again&&active)}catch(e){if(active){setError(e instanceof Error?e.message:String(e));clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),2000)}}finally{refreshing=false}};
    reload.current=refresh;
    async function connect(){if(!active)return;try{await refresh();const ticket=await request<{ticket:string}>(access.url,endpoint+'/ticket',access.secret,{});if(!active)return;const wsUrl=new URL(access.url+endpoint+'/ws');wsUrl.protocol=wsUrl.protocol==='https:'?'wss:':'ws:';wsUrl.searchParams.set('ticket',ticket.ticket);socket=new WebSocket(wsUrl);socket.onopen=()=>{if(active)setStatus('Connesso')};socket.onmessage=event=>{try{if(JSON.parse(event.data).type==='changed')void refresh()}catch{}};socket.onclose=()=>{if(active){setStatus('Riconnessione…');timer=setTimeout(connect,2500)}};socket.onerror=()=>socket?.close()}catch(e){if(active){setStatus('Non connesso');setError(e instanceof Error?e.message:String(e));timer=setTimeout(connect,5000)}}}
    void connect();return()=>{active=false;clearTimeout(timer);clearTimeout(refreshTimer);socket?.close();if(blobUrl.current){URL.revokeObjectURL(blobUrl.current);blobUrl.current=''}};
  },[access.url,access.code,access.secret]);
  useEffect(()=>{let active=true;setModel(null);if(snapshot?.role==='master'&&snapshot.board.occlusion)loadOcclusion(snapshot.board.occlusion.image).then(model=>{if(active)setModel(model)}).catch(()=>{});return()=>{active=false}},[snapshot?.role,snapshot?.board.occlusion?.image.src]);
  const fit=useCallback(()=>{const el=viewport.current,map=current.current?.board.map;if(!el||!map)return;const scale=Math.max(.001,Math.min((el.clientWidth-60)/map.width,(el.clientHeight-60)/map.height));setView({scale,x:(el.clientWidth-map.width*scale)/2,y:(el.clientHeight-map.height*scale)/2})},[]);
  useEffect(()=>{fit()},[snapshot?.scene,snapshot?.board.map?.width,snapshot?.board.map?.height,fit]);
  useEffect(()=>{const observer=new ResizeObserver(fit);if(viewport.current)observer.observe(viewport.current);return()=>observer.disconnect()},[fit,!!snapshot]);
  const zoom=useCallback((factor:number,x?:number,y?:number)=>{const el=viewport.current;if(!el)return;const cx=x??el.clientWidth/2,cy=y??el.clientHeight/2;setView(v=>{const scale=Math.max(.02,Math.min(8,v.scale*factor)),ratio=scale/v.scale;return{scale,x:cx-(cx-v.x)*ratio,y:cy-(cy-v.y)*ratio}})},[]);
  useEffect(()=>{const el=viewport.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top)};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[zoom,!!snapshot]);
  async function command(input:Record<string,unknown>,expectedRevision?:number,move?:PendingMove){
    if(busy||!current.current){if(move)setPendingMove(p=>p?.requestId===move.requestId?null:p);return}
    setBusy(true);setError('');
    try{
      const result=await request<{revision:number}>(access.url,endpoint+'/command',access.secret,{...input,revision:expectedRevision??current.current.revision});
      if(move)setPendingMove(p=>p?.requestId===move.requestId?{...p,acceptedRevision:result.revision}:p);
      await reload.current();
    }catch(e){
      if(move)setPendingMove(p=>p?.requestId===move.requestId?null:p);
      await reload.current();setError(e instanceof Error?e.message:String(e));
    }finally{setBusy(false)}
  }
  function down(e:Pointer<HTMLElement>){if(busy||uploading||e.button!==0||!(e.target instanceof Element)||e.target.closest('.tools,.perspective-switch'))return;const id=e.target.closest<HTMLElement>('.token')?.dataset.id,t=snapshot?.board.tokens.find(t=>t.id===id),allowed=snapshot?.role==='master'||snapshot?.ownTokenIds?.includes(id??'');if(id)setSelected(id);else setSelected(null);if(id&&(!allowed||pendingMove||viewAs))return;const r=e.currentTarget.getBoundingClientRect();gesture.current={pointer:e.pointerId,id:t?.id,x:e.clientX,y:e.clientY,vx:t?(e.clientX-r.left-view.x)/view.scale-t.x:view.x,vy:t?(e.clientY-r.top-view.y)/view.scale-t.y:view.y};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault()}
  function movePointer(e:Pointer<HTMLElement>){const g=gesture.current,map=snapshot?.board.map;if(!g||g.pointer!==e.pointerId||!map)return;if(g.id){const r=e.currentTarget.getBoundingClientRect(),p={id:g.id,x:Math.max(0,Math.min(map.width,(e.clientX-r.left-view.x)/view.scale-g.vx)),y:Math.max(0,Math.min(map.height,(e.clientY-r.top-view.y)/view.scale-g.vy))};previewRef.current=p;setPreview(p)}else setView(v=>({...v,x:g.vx+e.clientX-g.x,y:g.vy+e.clientY-g.y}))}
  function up(commit:boolean){
    const p=previewRef.current,g=gesture.current;gesture.current=null;previewRef.current=null;setPreview(null);
    if(commit&&g?.id===p?.id&&p&&current.current){
      const move:PendingMove={...p,scene:current.current.scene,revision:current.current.revision,requestId:crypto.randomUUID()};
      setPendingMove(move);void command({type:'move',id:p.id,x:p.x,y:p.y},move.revision,move);
    }
  }
  const master=snapshot?.role==='master',perspective=master&&viewAs?snapshot?.perspective:undefined;
  const sceneBoard=perspective?.board??snapshot?.board,map=sceneBoard?.map,viewReady=!master||loadedViewAs===viewAs;
  const dmMode=master&&!viewAs;
  const dmView=useMemo(()=>dmVision(dmMode?snapshot?.board:undefined,dmMode?model:null,dmMode?selected:null),[dmMode,snapshot?.board,model,selected]);
  const shownTokens=dmMode?sceneBoard?.tokens.filter(t=>dmView.visibleIds.includes(t.id)):sceneBoard?.tokens;
  useEffect(()=>{setSelected(null)},[viewAs]);
  const openings=master&&!viewAs&&model&&map?model.openings.map(o=>({id:o.id,kind:o.kind,x:o.x/model.width*map.width,y:o.y/model.height*map.height,width:o.width/model.width*map.width,height:o.height/model.height*map.height,open:snapshot.board.occlusion?.openIds.includes(o.id)??false})):perspective?.openings??snapshot?.openings??[];
  const disabled=busy||uploading||!!pendingMove||!!viewAs;
  const displayedPosition=preview??pendingMove;
  return <div className={`online-table game-layout ${master?'dm-layout':'player-layout'}`} ref={whole}>
    <aside className="game-left"><a className="brand" href="./" onClick={e=>{e.preventDefault();onLeave()}}>✳ <span>dtwnty<small>{master?'DUNGEON MASTER':'IL TUO PERSONAGGIO'}</small></span></a>
      <div className="room-badge"><small>PARTITA</small><strong>{access.code}</strong><span>{status}</span></div>
      <button className="invite-button" onClick={async()=>{try{const link=new URL(location.href);link.hash=new URLSearchParams({room:access.code,server:access.url}).toString();await navigator.clipboard.writeText(link.href);setStatus('Invito copiato')}catch{setError('Copia il codice partita.')}}}>↗ Invita giocatori</button>
      {master&&<><div className="section-title">PREPARA LA SCENA</div><nav className="scene-actions" aria-label="Strumenti DM">{([['map','⌑','Aggiungi mappa'],['occlusion','◈','Occlusion map'],['player','♙','Aggiungi giocatore'],['enemy','♟','Aggiungi nemici']] as const).map(([kind,icon,label])=><div key={kind} className="scene-action-group"><label className="scene-action"><span>{icon}</span>{label}<input type="file" accept="image/png,image/jpeg,image/webp" multiple={kind==='player'||kind==='enemy'} disabled={disabled||!snapshot} onChange={e=>upload(e,kind)}/></label>{kind==='occlusion'&&<OcclusionPrompt/>}</div>)}</nav>
      <details className="scene-settings"><summary>Griglia e illuminazione</summary><label>Dimensione cella <input aria-label="Dimensione cella" type="number" min={10} max={300} defaultValue={snapshot?.board.gridSize??50} key={`grid-${snapshot?.board.gridSize}`} disabled={disabled} onBlur={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isInteger(value)&&value>=10&&value<=300&&value!==snapshot?.board.gridSize)void command({type:'settings',patch:{gridSize:value}})}}/> px</label><label className="check"><input type="checkbox" checked={snapshot?.board.gridVisible??false} disabled={disabled} onChange={e=>void command({type:'settings',patch:{gridVisible:e.target.checked}})}/> Mostra griglia</label><label className="check"><input type="checkbox" checked={snapshot?.board.fogEnabled??true} disabled={disabled} onChange={e=>void command({type:'settings',patch:{fogEnabled:e.target.checked}})}/> Fog of war</label><label>Portata luce (celle)<input aria-label="Portata luce" type="number" min={1} max={40} defaultValue={snapshot?.board.lightCells??8} key={`light-${snapshot?.board.lightCells}`} disabled={disabled} onBlur={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isInteger(value)&&value>=1&&value<=40&&value!==snapshot?.board.lightCells)void command({type:'settings',patch:{lightCells:value}})}}/></label></details></>}
      {master&&selectedToken&&<section className="token-editor" aria-label="Modifica token"><div className="section-title">TOKEN SELEZIONATO</div><div className="token-editor-heading"><img src={selectedToken.src} alt=""/><strong>{selectedToken.name}</strong><button aria-label="Rinomina token" title="Rinomina" disabled={disabled} onClick={()=>setRenaming(!renaming)}>✎</button></div>{renaming&&<form onSubmit={e=>{e.preventDefault();if(draftName.trim())void command({type:'edit',id:selectedToken.id,patch:{name:draftName.trim()}})}}><label>Nome<input autoFocus aria-label="Nome token" value={draftName} onChange={e=>setDraftName(e.target.value)} maxLength={40}/></label><button disabled={disabled||!draftName.trim()}>Salva nome</button></form>}
      <div className="token-size"><button aria-label="Riduci token" disabled={disabled||selectedToken.size<=24} onClick={()=>void command({type:'edit',id:selectedToken.id,patch:{size:Math.max(24,selectedToken.size-8)}})}>−</button><span>{selectedToken.size} px</span><button aria-label="Ingrandisci token" disabled={disabled||selectedToken.size>=180} onClick={()=>void command({type:'edit',id:selectedToken.id,patch:{size:Math.min(180,selectedToken.size+8)}})}>+</button></div>
      {selectedToken.kind==='player'&&<fieldset className="token-owners"><legend>Controllato da</legend>{snapshot?.members.length?snapshot.members.map(m=><label className="check" key={m.id}><input type="checkbox" checked={tokenOwners(snapshot,selectedToken.id).includes(m.id)} disabled={disabled} onChange={e=>{const ids=tokenOwners(snapshot,selectedToken.id);void command({type:'assign',tokenId:selectedToken.id,memberIds:e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id)})}}/>{m.name}</label>):<small>I giocatori appariranno qui quando entrano.</small>}</fieldset>}
      <button className="danger" disabled={disabled} onClick={()=>void command({type:'remove',id:selectedToken.id})}>Rimuovi token</button></section>}
      <button className="logout-button" onClick={onLeave}>← Esci dal tavolo</button>
    </aside>
    <main><header><div><span className="live"/>{map?.name??'Apertura del tavolo…'}</div><button onClick={()=>whole.current?.requestFullscreen().catch(()=>setError('Schermo intero non disponibile.'))}>⛶ <span>Schermo intero</span></button></header><section className="online-viewport" ref={viewport} onPointerDown={down} onPointerMove={movePointer} onPointerUp={()=>up(true)} onPointerCancel={()=>up(false)} onLostPointerCapture={()=>up(false)}>
      {map&&mapSrc&&viewReady&&<div className={`online-world ${dmMode?'dm-world':''}`} style={{width:map.width,height:map.height,transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}}><img className="online-map" src={mapSrc} alt={master?'Mappa del master':'Mappa della tua visuale'} draggable={false}/>{dmMode&&<DmFog width={dmView.width} height={dmView.height} light={dmView.light}/>}{snapshot?.board.gridVisible&&<div className="online-grid" style={{backgroundSize:`${snapshot.board.gridSize??50}px ${snapshot.board.gridSize??50}px`}}/>}{shownTokens?.map(original=>{const t=displayedPosition?.id===original.id?{...original,x:displayedPosition.x,y:displayedPosition.y}:original;return <button key={t.id} data-id={t.id} aria-label={t.name} className={`token ${t.kind} ${selected===t.id?'selected':''}`} style={{left:t.x,top:t.y,width:t.size,height:t.size}} onClick={()=>setSelected(t.id)}><img src={t.src} alt="" draggable={false}/><span>{t.name}</span></button>})}
      <div className="opening-layer">{openings.map(o=><button key={o.id} className={`opening ${o.kind} ${o.open?'is-open':''}`} style={{left:o.x,top:o.y,width:o.width,height:o.height}} title={`${o.kind==='door'?'Porta':'Finestra'} ${o.open?'aperta':'chiusa'}`} aria-label={`${o.kind==='door'?'Porta':'Finestra'} ${o.open?'aperta':'chiusa'}`} aria-pressed={o.open} disabled={disabled} onPointerDown={e=>e.stopPropagation()} onClick={()=>void command({type:'toggle',id:o.id})}><span>{o.open?'○':'×'}</span></button>)}</div></div>}
      {master&&!viewAs&&map?.name==='Nuova avventura'&&!snapshot?.board.tokens.length&&<div className="table-welcome"><div className="sigil">✧<span>❧</span></div><h2>Un mondo da scoprire.</h2><p>Aggiungi una mappa dal menu a sinistra.<br/>Poi invita la tua compagnia.</p></div>}
      {master&&<div className="perspective-switch" role="group" aria-label="Visuale del DM"><button type="button" aria-pressed={!viewAs} disabled={busy||uploading||!!pendingMove} onClick={()=>setViewAs('')}>◈ DM</button><label><span>Visuale</span><select aria-label="Visualizza come giocatore" value={viewAs} disabled={busy||uploading||!!pendingMove||!snapshot?.members.length} onChange={e=>setViewAs(e.target.value)}><option value="">Giocatore…</option>{snapshot?.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div>}
      {master&&viewAs&&<div className="perspective-notice" role="status">{viewReady?`Visuale di ${snapshot?.members.find(m=>m.id===viewAs)?.name??'giocatore'} · anteprima`:'Caricamento visuale…'}</div>}
      {dmMode&&selected&&<button className="reset-dm-vision" onPointerDown={e=>e.stopPropagation()} onClick={()=>setSelected(null)}>Mostra tutti i token</button>}
      <div className="tools"><button aria-label="Riduci zoom" onClick={()=>zoom(1/1.2)}>−</button><output>{Math.round(view.scale*100)}%</output><button aria-label="Aumenta zoom" onClick={()=>zoom(1.2)}>+</button><button title="Adatta mappa" onClick={fit}>⌑</button></div></section><footer>{master?(selected&&!viewAs?'Filtro visuale attivo · Clicca sullo sfondo per mostrare tutti i token.':'Tutti i token sono visibili · Seleziona un token per filtrare la visuale.'): 'La tua luce e la tua esplorazione sono personali.'} · Trascina per spostare · La luce si aggiorna al rilascio</footer>{error&&<div className="game-message" role="alert">{error}<button aria-label="Chiudi messaggio" onClick={()=>setError('')}>×</button></div>}{uploading&&<div className="game-message" role="status">Preparazione della scena…</div>}</main>
    <aside className="game-right"><div className="section-title">GIOCATORI IN PARTITA <span>{snapshot?.members.length??0}</span></div><div className="joined-players">{snapshot?.members.length?snapshot.members.map(m=><div className="joined-player" key={m.id}><span className="player-avatar">{m.name.slice(0,1).toUpperCase()}</span><div><strong>{m.name}</strong><small>{m.joinedAt?`Entrato alle ${new Date(m.joinedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}`:'Giocatore registrato'}</small></div></div>):<p className="empty-list">La compagnia si sta radunando.<br/>Condividi il codice per cominciare.</p>}</div>
      <div className="section-title">{master&&!viewAs?'TOKEN IN SCENA':'TOKEN VISIBILI'} <span>{sceneBoard?.tokens.length??0}</span></div><div className="scene-roster">{sceneBoard?.tokens.map(t=><button key={t.id} className={`${selected===t.id?'selected':''} ${dmMode&&!dmView.visibleIds.includes(t.id)?'outside-token-view':''}`} onClick={()=>setSelected(t.id)}><img src={t.src} alt=""/><span><strong>{t.name}</strong><small>{t.kind==='enemy'?'Nemico':master?tokenOwners(snapshot,t.id).map(id=>snapshot.members.find(m=>m.id===id)?.name).filter(Boolean).join(', ')||'Non assegnato':'Giocatore'}</small></span><b className={`dot ${t.kind}`}/></button>)}{!sceneBoard?.tokens.length&&<p className="empty-list">Nessun token in scena.</p>}</div>
      {master&&<div className="scene-transfer"><button disabled={disabled||!snapshot} onClick={exportBoard}>↓ Esporta partita</button><label className="scene-action">↑ Importa partita<input type="file" accept="application/json,.json" disabled={disabled||!snapshot} onChange={importBoard}/></label><small>Mappe e token inclusi nel file.</small></div>}
    </aside>
  </div>;
}
