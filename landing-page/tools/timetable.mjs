import {DAYS,slots,moveLesson,csv,activeBreaks,timetableTimeline} from './engine.mjs?v=2';
import {sampleAssignments} from './timetable-sample.mjs?v=1';
import {$,escape as e,status,download,busy,field,select} from './ui.mjs?v=1';
let result=null,config=null,serial=0,worker=null;
const ids=['school','days','periods','start','duration','breakAfter','breakMinutes','breakAfter2','breakMinutes2'];
function addRow(r={}) {
  const id=++serial, box=document.createElement('div');box.className='assignment';box.dataset.id=id;
  box.innerHTML=`<div class="assignment-head"><strong>Teaching assignment</strong><button type="button" class="tool-secondary remove">Remove</button></div><div class="tool-fields">${field('Section',`section-${id}`,r.section||'','text','maxlength="80" placeholder="e.g. 6-A" required')}${field('Subject',`subject-${id}`,r.subject||'','text','maxlength="80" required')}${field('Teacher (same name = same teacher)',`teacher-${id}`,r.teacher||'','text','maxlength="80" required')}${field('Periods per week',`count-${id}`,r.count||5,'number','min="1" max="60" required')}${select('Consecutive periods per lesson',`block-${id}`,[1,2],r.block||1)}${field('Room (optional, same name = shared)',`room-${id}`,r.room||'','text','maxlength="80"')}${field('Fixed lesson starts (optional)',`fixed-${id}`,r.fixed||'','text','placeholder="Mon:1, Fri:2"')}${field('Teacher unavailable (optional)',`unavailable-${id}`,r.unavailable||'','text','placeholder="Tue:3, Tue:4"')}</div>`;
  box.querySelector('.remove').onclick=()=>{box.remove();invalidate();};$('assignments').append(box);
}
function rawRows(){return [...$('assignments').children].map(box=>{const id=box.dataset.id;return Object.fromEntries(['section','subject','teacher','count','block','room','fixed','unavailable'].map(key=>[key,$(`${key}-${id}`).value.trim()]));});}
function setup(){const days=+$('days').value,periods=+$('periods').value;return {days,periods,breaks:[{name:'Break 1',after:+$('breakAfter').value,minutes:+$('breakMinutes').value},{name:'Break 2',after:+$('breakAfter2').value,minutes:+$('breakMinutes2').value}],rows:rawRows().map(r=>({...r,count:+r.count,block:+r.block,fixed:slots(r.fixed,days,periods),unavailable:slots(r.unavailable,days,periods)}))};}
function invalidate(){if(worker){worker.terminate();worker=null;busy($('generate'),false,'Generate timetable');}if(result){result=null;$('output').hidden=true;status('Setup changed. Generate a new timetable to apply these settings.');}}
$('setup').addEventListener('input',invalidate);
$('add').onclick=()=>{if($('assignments').children.length>=80)return status('Maximum 80 assignments.',true);addRow();invalidate();};
$('sample').onclick=()=>{
  $('assignments').replaceChildren();$('days').value=5;$('periods').value=6;$('breakAfter').value=2;$('breakMinutes').value=15;$('breakAfter2').value=4;$('breakMinutes2').value=30;
  sampleAssignments().forEach(addRow);
  invalidate();status('Sample loaded: 2 sections × 8 subjects = 16 assignments. Each section has 30 weekly periods (5 days × 6 periods), including one double-period computer lab. Click Generate timetable to arrange all 60 periods. You can edit every assignment.');
};
$('save').onclick=()=>{try{localStorage.setItem('schoolment-timetable-v1',JSON.stringify({settings:Object.fromEntries(ids.map(id=>[id,$(id).value])),rows:rawRows()}));status('Draft saved on this browser. No timetable data was sent to Schoolment.');}catch{status('Browser storage is unavailable. Download the setup instead.',true);}};
$('load').onclick=()=>{try{const saved=JSON.parse(localStorage.getItem('schoolment-timetable-v1'));if(!saved||!Array.isArray(saved.rows)||saved.rows.length>80)throw Error();$('breakAfter2').value=0;$('breakMinutes2').value=30;for(const id of ids)if(saved.settings[id]!==undefined)$(id).value=saved.settings[id];$('assignments').replaceChildren();saved.rows.forEach(addRow);invalidate();status('Saved setup restored. Generate to see the timetable.');}catch{status('No valid saved draft found in this browser.',true);}};
$('setupDownload').onclick=()=>download('schoolment-timetable-setup.json',JSON.stringify({settings:Object.fromEntries(ids.map(id=>[id,$(id).value])),rows:rawRows()},null,2),'application/json');
$('setup').onsubmit=event=>{
  event.preventDefault();try{config=setup();}catch(error){return status(error.message,true);}
  result=null;$('output').hidden=true;busy($('generate'),true,'Generate timetable');status('Checking constraints and arranging lessons…');
  worker=new Worker(new URL('./timetable-worker.mjs?v=2',import.meta.url),{type:'module'});
  const timeout=setTimeout(()=>{if(worker){worker.terminate();worker=null;busy($('generate'),false,'Generate timetable');status('Search took too long. Reduce constraints or assignments and try again.',true);}},25000);
  worker.onmessage=({data})=>{clearTimeout(timeout);worker.terminate();worker=null;busy($('generate'),false,'Generate timetable');if(data.error)return status(data.error,true);result=data.result;render();const periods=result.placed.reduce((n,p)=>n+p.block,0);status(result.unplaced.length?`Partial timetable: ${periods} periods placed. ${result.unplaced.length} lessons remain unplaced. The search could not fit every request; loosen fixed slots, availability or loads and regenerate.\n${result.unplaced.map(p=>`${p.section}: ${p.subject} (${p.block} periods)`).join('\n')}`:`Timetable ready: ${periods} periods placed without teacher, room or section clashes. Empty cells are free periods. Check the draft before use.`,Boolean(result.unplaced.length));};
  worker.onerror=()=>{clearTimeout(timeout);worker.terminate();worker=null;busy($('generate'),false,'Generate timetable');status('Could not start the timetable engine. Refresh the page and try again.',true);};worker.postMessage(config);
};
function timeline(){return timetableTimeline(config,$('start').value,+$('duration').value);}
function periodTime(p){return timeline().find(t=>t.kind==='period'&&t.period===p).time;}
function render(){
  $('output').hidden=false;const by=$('view').value==='Teacher'?'teacher':'section';const names=[...new Set(config.rows.map(r=>r[by]))];
  const daysDown=$('layout').value==='Weekdays in first column';
  $('tables').innerHTML=names.map(name=>{
    const entries=timeline();
    const entryHeader=t=>`${e(t.label)}<br><small>${t.time}</small>`;
    const entryCell=(d,t)=>t.kind==='break'?`<td class="break-cell"><strong>${e(t.label)}</strong><small>${t.time}</small></td>`:cell(d,t.period);
    const cell=(d,p)=>{const lesson=result.placed.find(l=>l[by]===name&&l.day===d&&p>=l.period&&p<l.period+l.block);return lesson?`<td class="filled">${e(lesson.subject)}<small>${e(by==='section'?lesson.teacher:lesson.section)}${lesson.room?' · '+e(lesson.room):''}${lesson.fixed?' · Fixed':''}${p>lesson.period?' · Continued':''}</small></td>`:'<td>Free</td>';};
    const headers=daysDown?entries.map(entryHeader):DAYS.slice(0,config.days);
    const rows=daysDown
      ? DAYS.slice(0,config.days).map((day,d)=>`<tr><th scope="row">${day}</th>${entries.map(t=>entryCell(d,t)).join('')}</tr>`).join('')
      : entries.map(t=>`<tr><th scope="row" class="${t.kind==='break'?'break-cell':''}">${entryHeader(t)}</th>${DAYS.slice(0,config.days).map((_,d)=>entryCell(d,t)).join('')}</tr>`).join('');
    return `<section class="print-block"><h2>${e($('school').value||'School timetable')} · ${e(name)}</h2><p>${result.unplaced.length?'PARTIAL DRAFT — some lessons are unplaced.':'Draft timetable'}${activeBreaks(config).map(b=>` · ${e(b.name)}: ${b.minutes} minutes after period ${b.after}`).join('')}</p><div class="tool-scroll"><table><thead><tr><th scope="col">${daysDown?'Day':'Period'}</th>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }).join('');
  $('lesson').innerHTML=result.placed.map(l=>`<option value="${l.id}" ${l.fixed?'disabled':''}>${e(l.section)} · ${e(l.subject)} · ${DAYS[l.day]}:${l.period+1}${l.fixed?' (fixed)':''}</option>`).join('');const first=result.placed.find(l=>!l.fixed);if(first)$('lesson').value=first.id;
  $('moveDay').innerHTML=DAYS.slice(0,config.days).map((d,i)=>`<option value="${i}">${d}</option>`).join('');$('movePeriod').innerHTML=Array.from({length:config.periods},(_,p)=>`<option value="${p}">${p+1}</option>`).join('');$('move').disabled=!first;
}
$('view').onchange=()=>{if(result)render();};
$('layout').onchange=()=>{if(result)render();};
$('move').onclick=()=>{try{result.placed=moveLesson(config,result.placed,$('lesson').value,+$('moveDay').value,+$('movePeriod').value);render();status('Lesson moved. Teacher, room, section and availability checks passed.');}catch(error){status(error.message,true);}};
$('csv').onclick=()=>{if(!result)return;download('schoolment-timetable.csv',csv([['Status',result.unplaced.length?'PARTIAL DRAFT':'Draft'],['Section','Subject','Teacher','Room','Day','Period','Time','Fixed'],...result.placed.flatMap(l=>Array.from({length:l.block},(_,i)=>[l.section,l.subject,l.teacher,l.room,DAYS[l.day],l.period+i+1,periodTime(l.period+i),l.fixed?'Yes':'No'])),...DAYS.slice(0,config.days).flatMap(day=>timeline().filter(t=>t.kind==='break').map(t=>['All sections',t.label,'','',day,`After period ${t.after}`,t.time,''])),...result.unplaced.map(l=>[l.section,l.subject,l.teacher,l.room,'UNPLACED',l.block,'',''])]));};
$('print').onclick=()=>window.print();
addRow({section:'6-A',subject:'Maths',teacher:'',count:5});
