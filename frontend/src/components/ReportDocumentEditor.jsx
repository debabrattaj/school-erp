import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { Node, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { REPORT_FIELDS } from "./reportDocument";
import { scoreBand, contrastingText } from "../config/reportCardColors";

const PageBreak = Node.create({name:"pageBreak",group:"block",atom:true,parseHTML:()=>[{tag:'div[data-page-break]'}],renderHTML:()=>["div",{"data-page-break":"true",class:"report-page-break"},"Page break"]});
const CellColour = Extension.create({name:"cellColour",addGlobalAttributes(){return [{types:["tableCell","tableHeader"],attributes:{backgroundColor:{default:null,parseHTML:el=>el.style.backgroundColor,renderHTML:attrs=>attrs.backgroundColor ? {style:`background-color:${attrs.backgroundColor}`} : {}}}}];}});
const SizedImage = Image.extend({addAttributes(){return {...this.parent?.(),width:{default:180,renderHTML:attrs=>({width:attrs.width})}};}});
function usePreview(extension) {
  const [,update]=useState(0);
  useEffect(()=>{const callback=()=>update(n=>n+1);extension.options.preview.listeners.add(callback);return ()=>extension.options.preview.listeners.delete(callback);},[extension]);
  return extension.options.preview.current;
}
function FieldView({node,extension}) {
  const {data}=usePreview(extension);
  return <NodeViewWrapper as="span" className="report-auto-field" title={`Automatic: ${REPORT_FIELDS[node.attrs.field]}`} contentEditable={false}>{data[node.attrs.field] ?? `[${REPORT_FIELDS[node.attrs.field]}]`}</NodeViewWrapper>;
}
function MarksView({extension}) {
  const {data,colours}=usePreview(extension);
  return <NodeViewWrapper className="report-auto-marks" contentEditable={false}><small className="no-print">Automatic marks table · move or delete this block; marks come from the student record</small><table><thead><tr>{["Subject","Marks","Maximum","Grade","Remarks"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.rows?.length ? data.rows.map((r,i)=>{const band=scoreBand({...r,marks_obtained:r.obtained,max_marks:r.max},data.pass_percentage ?? 40);const color=colours[band];return <tr key={i}><td>{r.subject}</td><td style={color ? {background:color,color:contrastingText(color)} : undefined}>{r.obtained}</td><td>{r.max}</td><td style={color ? {background:color,color:contrastingText(color)} : undefined}>{r.grade}</td><td>{r.remarks}</td></tr>}) : <tr><td colSpan="5">Select a student and exam with marks to preview results.</td></tr>}</tbody></table></NodeViewWrapper>;
}

export default function ReportDocumentEditor({document,onChange,data,colours,readOnly=false}) {
  const latest=useRef(onChange);latest.current=onChange;
  const preview=useRef({data,colours});preview.current={data,colours};
  if(!preview.listeners) preview.listeners=new Set();
  const imageInput=useRef();
  const [message,setMessage]=useState("");
  const [full,setFull]=useState(false);
  const [,refresh]=useState(0);
  const editor=useEditor({editable:!readOnly,extensions:[StarterKit.configure({link:false,code:false,codeBlock:false,heading:{levels:[1,2,3]}}),TableKit.configure({table:{resizable:true}}),CellColour,SizedImage.configure({allowBase64:true}),TextStyleKit,TextAlign.configure({types:["heading","paragraph"]}),PageBreak,
    Node.create({name:"reportField",group:"inline",inline:true,atom:true,addOptions:()=>({preview}),addAttributes:()=>({field:{default:"student_name"}}),parseHTML:()=>[{tag:"span[data-report-field]",getAttrs:el=>({field:el.getAttribute("data-report-field")})}],renderHTML:({node})=>["span",{"data-report-field":node.attrs.field},`[${REPORT_FIELDS[node.attrs.field]}]`],addNodeView:()=>ReactNodeViewRenderer(FieldView)}),
    Node.create({name:"reportMarks",group:"block",atom:true,draggable:true,addOptions:()=>({preview}),parseHTML:()=>[{tag:"div[data-report-marks]"}],renderHTML:()=>["div",{"data-report-marks":"true"}],addNodeView:()=>ReactNodeViewRenderer(MarksView)})
  ],content:document,onUpdate:({editor:e})=>latest.current(e.getJSON()),onSelectionUpdate:()=>refresh(n=>n+1),onTransaction:()=>refresh(n=>n+1),editorProps:{attributes:{class:"report-document-page",'aria-label':"Editable report document"},handlePaste:(_view,event)=>{if(event.clipboardData?.files.length){setMessage("Use Insert image for pictures. Paste text and tables directly into the page.");return true;}return false;}}});
  useEffect(()=>{if(editor && JSON.stringify(editor.getJSON())!==JSON.stringify(document)) editor.commands.setContent(document,{emitUpdate:false});},[document,editor]);
  // Node views use current student data without writing those values into the saved template.
  useEffect(()=>{preview.listeners.forEach(callback=>callback());},[data,colours,editor]);
  useEffect(()=>{editor?.setEditable(!readOnly);},[editor,readOnly]);
  if(!editor) return null;
  const run=(fn)=>{fn(editor.chain().focus()).run();refresh(n=>n+1);};
  const button=(label,fn,active=false,disabled=false)=><button type="button" key={label} disabled={disabled} aria-pressed={active} onMouseDown={e=>e.preventDefault()} onClick={()=>run(fn)}>{label}</button>;
  async function uploadImage(event) {
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    if(!["image/png","image/jpeg"].includes(file.type)||file.size>1024*1024){setMessage("Choose a PNG or JPEG image smaller than 1 MB.");return;}
    const reader=new FileReader();reader.onload=()=>{editor.chain().focus().setImage({src:String(reader.result),alt:file.name,width:180}).run();setMessage("");};reader.readAsDataURL(file);
  }
  return <section id="report-document-editor" className={`report-document-editor ${full ? "is-fullscreen" : ""}`}>
    {!readOnly && <>
    <div className="report-document-heading no-print"><div><h3>Edit the complete report</h3><p>Click anywhere on the page to type. Select words to format them. Cut and paste paragraphs or tables to rearrange them. Blue fields update for each student.</p></div><button type="button" onClick={()=>setFull(!full)}>{full ? "Exit full screen" : "Full screen"}</button><a href="#report-template-editor" onClick={()=>setFull(false)}>Save template</a></div>
    <div className="report-document-toolbar no-print" role="group" aria-label="Document editing toolbar">
      {button("Undo",c=>c.undo(),false,!editor.can().undo())}{button("Redo",c=>c.redo(),false,!editor.can().redo())}
      <label>Style<select value={editor.isActive("heading") ? editor.getAttributes("heading").level : "paragraph"} onChange={e=>run(c=>e.target.value==="paragraph" ? c.setParagraph() : c.setHeading({level:Number(e.target.value)}))}><option value="paragraph">Normal</option>{[1,2,3].map(n=><option value={n} key={n}>Heading {n}</option>)}</select></label>
      <label>Font<select value={editor.getAttributes("textStyle").fontFamily || "Arial"} onChange={e=>run(c=>c.setFontFamily(e.target.value))}>{["Arial","Times New Roman","Courier New"].map(f=><option key={f}>{f}</option>)}</select></label>
      <label>Size<select value={editor.getAttributes("textStyle").fontSize || "11pt"} onChange={e=>run(c=>c.setFontSize(e.target.value))}>{[8,9,10,11,12,14,16,18,20,24,28,32,36,48].map(n=><option value={`${n}pt`} key={n}>{n}</option>)}</select></label>
      {button("Bold",c=>c.toggleBold(),editor.isActive("bold"))}{button("Italic",c=>c.toggleItalic(),editor.isActive("italic"))}{button("Underline",c=>c.toggleUnderline(),editor.isActive("underline"))}{button("Strike",c=>c.toggleStrike(),editor.isActive("strike"))}
      <label>Text<input type="color" value={editor.getAttributes("textStyle").color || "#263345"} onChange={e=>run(c=>c.setColor(e.target.value))}/></label>
      <label>Highlight<input type="color" value={editor.getAttributes("textStyle").backgroundColor || "#ffffff"} onChange={e=>run(c=>c.setBackgroundColor(e.target.value))}/></label>
      {['left','center','right','justify'].map(a=>button(a,c=>c.setTextAlign(a),editor.isActive({textAlign:a})))}
      <label>Spacing<select value={editor.getAttributes("textStyle").lineHeight || "1.4"} onChange={e=>run(c=>c.setLineHeight(e.target.value))}>{["1","1.15","1.4","1.5","2"].map(n=><option key={n}>{n}</option>)}</select></label>
      {button("Bullets",c=>c.toggleBulletList(),editor.isActive("bulletList"))}{button("Numbering",c=>c.toggleOrderedList(),editor.isActive("orderedList"))}
      {button("Clear format",c=>c.unsetAllMarks().clearNodes())}
      {button("Insert table",c=>c.insertTable({rows:3,cols:3,withHeaderRow:true}))}
      <button type="button" onClick={()=>imageInput.current.click()}>Insert image</button><input ref={imageInput} hidden type="file" accept="image/png,image/jpeg" onChange={uploadImage}/>
      {editor.isActive("image") && <label>Image width<select value={editor.getAttributes("image").width || 180} onChange={e=>run(c=>c.updateAttributes("image",{width:Number(e.target.value)}))}>{[60,100,180,240,360,480].map(n=><option key={n} value={n}>{n} px</option>)}</select></label>}
      {button("Divider",c=>c.setHorizontalRule())}{button("Page break",c=>c.insertContent({type:"pageBreak"}),false,editor.isActive("table") || editor.isActive("listItem"))}
      <label>Automatic field<select value="" onChange={e=>{if(e.target.value)run(c=>c.insertContent({type:"reportField",attrs:{field:e.target.value}}));}}><option value="">Insert field…</option>{Object.entries(REPORT_FIELDS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
      {button("Marks table",c=>c.insertContent({type:"reportMarks"}),false,editor.isActive("table") || editor.isActive("listItem"))}
    </div>
    {editor.isActive("table") && <div className="report-document-toolbar no-print" role="group" aria-label="Table tools">{button("Add row",c=>c.addRowAfter())}{button("Delete row",c=>c.deleteRow())}{button("Add column",c=>c.addColumnAfter())}{button("Delete column",c=>c.deleteColumn())}{button("Merge cells",c=>c.mergeCells(),false,!editor.can().mergeCells())}{button("Split cell",c=>c.splitCell(),false,!editor.can().splitCell())}{button("Delete table",c=>c.deleteTable())}<label>Cell fill<input type="color" onChange={e=>run(c=>c.setCellAttribute("backgroundColor",e.target.value))}/></label></div>}
    {message && <p role="status" className="no-print">{message}</p>}
    </>}
    <EditorContent editor={editor} className="report-document-sheet print-area"/>
    {!readOnly && <p className="no-print">A4 document · PDF adds page numbers and paginates long content. Use Download PDF to check the final page breaks.</p>}
  </section>;
}
