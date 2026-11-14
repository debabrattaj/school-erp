export const REPORT_FIELDS = {school_name:"School name", student_name:"Student name", admission_no:"Admission number", class_label:"Class / section", exam_name:"Exam", academic_year:"Academic year", total_obtained:"Total obtained", total_max:"Total maximum", percentage:"Percentage", overall_grade:"Overall grade", result:"Result", rank:"Class rank", attendance_percent:"Attendance"};
export const text = (value) => ({type:"text",text:String(value)});
export const field = (key) => ({type:"reportField",attrs:{field:key}});
const paragraph = (content,attrs={}) => ({type:"paragraph",attrs,content:typeof content === "string" ? (content ? [text(content)] : []) : content});
export const DOCUMENT_THEMES = {
  heritage:{accent:"#1e3554",tint:"#f6f2e9",font:"Times New Roman"},
  scholar:{accent:"#195548",tint:"#edf5f0",font:"Arial"},
  horizon:{accent:"#086879",tint:"#eaf6f8",font:"Arial"},
  ledger:{accent:"#252525",tint:"#f3f3f3",font:"Arial"},
  studio:{accent:"#73415b",tint:"#f7eff4",font:"Arial"},
};
export function createReportDocument(design, template) {
  const theme=DOCUMENT_THEMES[template] || DOCUMENT_THEMES.heritage;
  const accent=design.accent_color || theme.accent;
  const styled=(node,size=11,bold=false)=>({...node,marks:[...(bold ? [{type:"bold"}] : []),{type:"textStyle",attrs:{color:accent,fontFamily:theme.font,fontSize:`${size}pt`}}]});
  function heading(value,level=2) {return {type:"heading",attrs:{level,textAlign:template==="ledger" ? "right" : "center"},content:[styled(text(value),level===2 ? 18 : 11,true)]};}
  function detail(label,content) {return {type:"tableCell",attrs:{backgroundColor:theme.tint},content:[paragraph([{...text(label.toUpperCase()),marks:[{type:"textStyle",attrs:{fontSize:"8pt",color:"#526174"}}]}]),paragraph(content.map(n=>styled(n,11,true)))]};}
  const table=rows=>({type:"table",content:rows.map(content=>({type:"tableRow",content}))});
  const facts=[detail("Total marks",[field("total_obtained"),text(" / "),field("total_max")]),detail("Percentage (%)",[field("percentage")]),detail("Overall grade",[field("overall_grade")]),detail("Result",[field("result")])];
  if(design.show_rank)facts.push(detail("Class rank",[field("rank")]));
  if(design.show_attendance)facts.push(detail("Attendance (%)",[field("attendance_percent")]));
  const factRows=[];for(let i=0;i<facts.length;i+=2)factRows.push(facts.slice(i,i+2));
  if(factRows.at(-1).length===1)factRows.at(-1)[0].attrs.colspan=2;
  return {type:"doc",content:[
    {type:"heading",attrs:{level:1,textAlign:"center"},content:[styled(field("school_name"),24,true)]},
    {type:"horizontalRule"},
    heading(design.title || "Report Card"),
    paragraph([field("exam_name"),text(" | Academic year "),field("academic_year")],{textAlign:"center"}),
    table([[detail("Student name",[field("student_name")]),detail("Admission number",[field("admission_no")])],[detail("Class / section",[field("class_label")]),detail("Academic year",[field("academic_year")])]]),
    heading("Subject performance",3),{type:"reportMarks"},
    heading("Result summary",3),table(factRows),
    ...(design.show_feedback ? [table([[{type:"tableCell",content:[paragraph([styled(text(design.feedback_title || "Teacher feedback"),11,true)]),paragraph(design.feedback_prompt || ""),paragraph("____________________________________________"),paragraph("____________________________________________")]}]])] : []),
    paragraph(""),
    table([[design.teacher_label,design.coordinator_label,design.principal_label].map(label=>({type:"tableCell",content:[paragraph("________________",{textAlign:"center"}),paragraph(label || "Signature",{textAlign:"center"})]}))]),
  ]};
}
