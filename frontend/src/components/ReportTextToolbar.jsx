import { useState } from "react";

export const TEXT_SECTIONS = [["title","Report heading",80],["feedback_title","Feedback heading",100],["feedback_prompt","Feedback instructions",250],["teacher_label","Teacher signature",60],["coordinator_label","Coordinator signature",60],["principal_label","Principal signature",60]];
export function reportTextStyle(design, key) {
  const s = design.text_styles?.[key];
  if (!s) return undefined;
  return {fontFamily: s.font === "serif" ? "Times New Roman, serif" : s.font === "mono" ? "Courier New, monospace" : "Arial, sans-serif", fontSize:`${s.size}pt`,fontWeight:s.bold ? 700 : 400,fontStyle:s.italic ? "italic" : "normal",textDecoration:s.underline ? "underline" : "none",color:s.color,textAlign:s.align,lineHeight:s.line_height,whiteSpace:"pre-wrap",textTransform:"none"};
}
export default function ReportTextToolbar({design,onChange}) {
  const [active,setActive] = useState("title");
  const [past,setPast] = useState([]);
  const [future,setFuture] = useState([]);
  const current = design.text_styles?.[active] || {font:"sans",size:active === "title" ? 18 : 10,bold:active === "title" || active === "feedback_title",italic:false,underline:false,color:"#263345",align:active.endsWith("label") || active === "title" ? "center" : "left",line_height:1.4};
  function change(next) {setPast(p=>[...p.slice(-49),design]);setFuture([]);onChange(next);}
  function format(patch) {change({...design,text_styles:{...design.text_styles,[active]:{...current,...patch}}});}
  function undo() {if (!past.length) return;setFuture(f=>[design,...f]);onChange(past.at(-1));setPast(p=>p.slice(0,-1));}
  function redo() {if (!future.length) return;setPast(p=>[...p,design]);onChange(future[0]);setFuture(f=>f.slice(1));}
  return <div className="report-word-editor">
    <h4>Template text editor</h4>
    <p>Select a section on the page below. Toolbar formatting applies to that whole section. Student details and marks are filled automatically.</p>
    <div className="report-word-toolbar" role="group" aria-label="Text formatting tools">
      <button type="button" onClick={undo} disabled={!past.length} title="Undo last editor change">↶ Undo</button>
      <button type="button" onClick={redo} disabled={!future.length} title="Redo editor change">↷ Redo</button>
      <label>Section<select value={active} onChange={e=>setActive(e.target.value)}>{TEXT_SECTIONS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
      <label>Font<select value={current.font} onChange={e=>format({font:e.target.value})}><option value="sans">Arial</option><option value="serif">Times New Roman</option><option value="mono">Courier New</option></select></label>
      <label>Size<select value={current.size} onChange={e=>format({size:Number(e.target.value)})}>{[8,9,10,11,12,14,16,18,20,24,28,32].map(n=><option key={n}>{n}</option>)}</select></label>
      {[["bold","B","Bold"],["italic","I","Italic"],["underline","U","Underline"]].map(([key,label,title])=><button type="button" key={key} title={title} aria-label={title} aria-pressed={current[key]} onClick={()=>format({[key]:!current[key]})}>{label}</button>)}
      <label>Text colour<input type="color" value={current.color} onChange={e=>format({color:e.target.value})}/></label>
      <label>Alignment<select value={current.align} onChange={e=>format({align:e.target.value})}>{["left","center","right","justify"].map(a=><option key={a}>{a}</option>)}</select></label>
      <label>Line spacing<select value={current.line_height} onChange={e=>format({line_height:Number(e.target.value)})}>{[1,1.15,1.4,1.5,2].map(n=><option key={n}>{n}</option>)}</select></label>
      <button type="button" onClick={()=>{const styles={...design.text_styles};delete styles[active];change({...design,text_styles:styles});}}>Clear formatting</button>
    </div>
    <div className="report-word-canvas">{TEXT_SECTIONS.map(([key,label,max])=><label key={key} className={active===key ? "is-active" : ""}><span>{label}</span><textarea aria-label={`Edit ${label}`} value={design[key]} maxLength={max} rows={key==="feedback_prompt" ? 3 : 2} onFocus={()=>setActive(key)} style={reportTextStyle(design,key)} onChange={e=>change({...design,[key]:e.target.value})}/></label>)}</div>
  </div>;
}
