import {useEffect,useRef,useState} from 'react';

export default function LightSlider({label,value,disabled,onCommit}:{label:string;value:number;disabled:boolean;onCommit:(value:number)=>void}){
  const [draft,setDraft]=useState(value),committed=useRef(value);
  useEffect(()=>{if(!disabled){setDraft(value);committed.current=value}},[value,disabled]);
  function commit(next:number){if(disabled||committed.current===next)return;committed.current=next;onCommit(next)}
  return <label className="light-slider"><span>{label}<output>{draft} celle</output></span><input type="range" min={1} max={100} step={1} aria-label={label} value={draft} disabled={disabled} onChange={e=>setDraft(e.currentTarget.valueAsNumber)} onPointerUp={e=>commit(e.currentTarget.valueAsNumber)} onPointerCancel={()=>{setDraft(value);committed.current=value}} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))commit(e.currentTarget.valueAsNumber)}} onBlur={e=>commit(e.currentTarget.valueAsNumber)}/><small>1–100 celle · conferma al rilascio</small></label>;
}
