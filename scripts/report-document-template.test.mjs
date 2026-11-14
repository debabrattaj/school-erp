import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportDocument, DOCUMENT_THEMES} from '../frontend/src/components/reportDocument.js';

const design={title:'Term Report',show_rank:true,show_attendance:true,show_feedback:true,feedback_title:'Learning goals',feedback_prompt:'Progress and next steps',teacher_label:'Mentor',coordinator_label:'Coordinator',principal_label:'Head'};
function nodes(root){return [root,...(root.content || []).flatMap(nodes)];}
test('all starter designs retain structured details, results, feedback and signatures',()=>{
  for(const [name,theme] of Object.entries(DOCUMENT_THEMES)){
    const doc=createReportDocument(design,name), all=nodes(doc);
    assert.equal(doc.type,'doc');
    assert.equal(all.filter(n=>n.type==='table').length,4);
    for(const key of ['school_name','student_name','admission_no','class_label','academic_year','percentage','rank','attendance_percent']) assert(all.some(n=>n.type==='reportField'&&n.attrs.field===key),key);
    for(const value of ['Term Report','Learning goals','Mentor','Coordinator','Head']) assert(all.some(n=>n.text===value),value);
    assert(all.some(n=>n.type==='tableCell'&&n.attrs?.backgroundColor===theme.tint));
    assert(all.some(n=>n.marks?.some(m=>m.attrs?.fontFamily===theme.font)));
  }
});
test('optional sections stay excluded when converting to the document editor',()=>{
  const all=nodes(createReportDocument({...design,show_rank:false,show_attendance:false,show_feedback:false},'heritage'));
  assert(!all.some(n=>n.attrs?.field==='rank'||n.attrs?.field==='attendance_percent'));
  assert(!all.some(n=>n.text==='Learning goals'));
});
