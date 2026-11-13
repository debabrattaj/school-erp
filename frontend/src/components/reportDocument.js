export const REPORT_FIELDS = {school_name:"School name", student_name:"Student name", admission_no:"Admission number", class_label:"Class / section", exam_name:"Exam", academic_year:"Academic year", total_obtained:"Total obtained", total_max:"Total maximum", percentage:"Percentage", overall_grade:"Overall grade", result:"Result", rank:"Class rank", attendance_percent:"Attendance"};
export const text = (value) => ({type:"text",text:String(value)});
export const field = (key) => ({type:"reportField",attrs:{field:key}});
const paragraph = (content,attrs={}) => ({type:"paragraph",attrs,content:typeof content === "string" ? (content ? [text(content)] : []) : content});
const cell = (content) => ({type:"tableCell",content:[paragraph(content)]});
export function createReportDocument(design, template) {
  const accent=design.accent_color || ({heritage:"#1e3554",scholar:"#195548",horizon:"#086879",ledger:"#252525",studio:"#73415b"}[template]);
  function heading(value,level=2) {return {type:"heading",attrs:{level,textAlign:"center"},content:[{...text(value),marks:[{type:"textStyle",attrs:{color:accent}}]}]};}
  return {type:"doc",content:[
    {type:"heading",attrs:{level:1,textAlign:"center"},content:[field("school_name")]},
    heading(design.title || "Report Card"),
    paragraph([field("exam_name"),text(" | Academic year "),field("academic_year")],{textAlign:"center"}),
    {type:"horizontalRule"},
    {type:"table",content:[[[text("Student: "),field("student_name")],[text("Admission no: "),field("admission_no")]],[[text("Class / section: "),field("class_label")],[text("Academic year: "),field("academic_year")]]].map(row=>({type:"tableRow",content:row.map(cell)}))},
    {type:"paragraph"}, {type:"reportMarks"}, {type:"paragraph"},
    paragraph([text("Total: "),field("total_obtained"),text(" / "),field("total_max"),text("     Percentage: "),field("percentage"),text("%")]),
    paragraph([text("Grade: "),field("overall_grade"),text("     Result: "),field("result")]),
    ...(design.show_rank ? [paragraph([text("Class rank: "),field("rank")])] : []),
    ...(design.show_attendance ? [paragraph([text("Attendance: "),field("attendance_percent"),text("%")])] : []),
    ...(design.show_feedback ? [heading(design.feedback_title || "Teacher feedback",3),paragraph(design.feedback_prompt || ""),paragraph(""),paragraph("")] : []),
    {type:"table",content:[{type:"tableRow",content:[design.teacher_label,design.coordinator_label,design.principal_label].map(label=>cell(label || "Signature"))}]},paragraph("")
  ]};
}
