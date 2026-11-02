import {useEffect,useRef,useState} from 'react';
import {OCCLUSION_PROMPT} from './occlusion-prompt';

export default function OcclusionPrompt(){
  const [copied,setCopied]=useState(false),[manual,setManual]=useState(false);
  const text=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),3000);return()=>clearTimeout(timer)},[copied]);
  useEffect(()=>{if(manual){text.current?.focus();text.current?.select()}},[manual]);
  async function copy(){try{await navigator.clipboard.writeText(OCCLUSION_PROMPT);setCopied(true);setManual(false)}catch{setCopied(false);setManual(true)}}
  return <div className="occlusion-prompt"><div className="occlusion-prompt-row"><span>Copia il prompt per generare la tua Occlusion map con Gemini</span><button type="button" aria-label={copied?'Prompt copiato':'Copia il prompt per Gemini'} title={copied?'Copiato!':'Copia prompt'} onClick={copy}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{copied?<path d="m5 12 4 4L19 6"/>:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></>}</svg>
  </button></div><span className="prompt-feedback" role="status">{copied?'Prompt copiato! Incollalo in Gemini con la tua mappa.':manual?'Copia automatica non disponibile: copia il testo selezionato qui sotto.':''}</span>{manual&&<textarea ref={text} readOnly value={OCCLUSION_PROMPT} aria-label="Prompt da copiare manualmente" onFocus={e=>e.currentTarget.select()}/>}</div>;
}
