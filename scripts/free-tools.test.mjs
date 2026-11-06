import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateTimetable,canPlace,moveLesson,slots,csv,timetableTimeline,validateConfig} from '../landing-page/tools/engine.mjs';
import {sampleAssignments} from '../landing-page/tools/timetable-sample.mjs';
test('sample fills all 30 slots in both sections without clashes',()=>{
 const rows=sampleAssignments().map(r=>({...r,fixed:[],unavailable:[]}));
 const config={days:5,periods:6,breaks:[{name:'Break 1',after:2,minutes:15},{name:'Break 2',after:4,minutes:30}],rows};
 const result=generateTimetable(config);
 assert.equal(result.unplaced.length,0);
 for(const section of ['6-A','6-B']) {
   assert.equal(rows.filter(r=>r.section===section).reduce((n,r)=>n+r.count,0),30);
   for(let day=0;day<5;day++)for(let period=0;period<6;period++)
     assert.equal(result.placed.filter(p=>p.section===section&&p.day===day&&p.period<=period&&p.period+p.block>period).length,1);
 }
 for(const lesson of result.placed)assert.ok(canPlace(config,result.placed,lesson,lesson.day,lesson.period));
});
const row=(overrides={})=>({section:'6-A',subject:'Maths',teacher:'A',room:'',count:5,block:1,fixed:[],unavailable:[],...overrides});
test('two breaks are explicit timeline entries and both block double lessons',()=>{
 const c={days:5,periods:6,breaks:[{name:'Break 1',after:2,minutes:15},{name:'Break 2',after:4,minutes:30}],rows:[row()]};
 const entries=timetableTimeline(c,'09:00',40);
 assert.equal(entries.length,8);
 assert.deepEqual(entries.filter(t=>t.kind==='break').map(t=>t.time),['10:20–10:35','11:55–12:25']);
 assert.equal(entries.at(-1).time,'13:05–13:45');
 assert.equal(canPlace(c,[],row({block:2}),0,1),false);
 assert.equal(canPlace(c,[],row({block:2}),0,3),false);
 assert.equal(canPlace(c,[],row({block:2}),0,4),true);
 assert.throws(()=>validateConfig({...c,breaks:[{after:2,minutes:15},{after:2,minutes:30}]}),/different periods/);
 assert.throws(()=>validateConfig({...c,breaks:[{after:4,minutes:0}]}),/duration/);
 assert.equal(timetableTimeline({...c,breaks:[{after:0,minutes:15},{after:0,minutes:30}]}).length,6);
});
test('shared teachers and rooms, double periods, fixed lessons and availability',()=>{
 const c={days:5,periods:6,breakAfter:3,rows:[row({fixed:[{day:0,period:0}],unavailable:[{day:1,period:0}]}),row({section:'6-B'}),row({subject:'Lab',teacher:'B',count:4,block:2,room:'Lab'}),row({section:'6-B',subject:'Lab',teacher:'C',count:4,block:2,room:'Lab'})]};
 const result=generateTimetable(c);assert.equal(result.unplaced.length,0);assert.equal(result.placed.reduce((n,p)=>n+p.block,0),18);
 for(const p of result.placed)assert.ok(canPlace(c,result.placed,p,p.day,p.period));
 assert.equal(result.placed.find(p=>p.fixed).period,0);
 assert.throws(()=>moveLesson(c,result.placed,'0-0',2,2),/Fixed/);
 const other=result.placed.find(p=>p.section==='6-B'&&p.teacher==='A');assert.throws(()=>moveLesson(c,result.placed,other.id,0,0),/clashes/);
});
test('bad slots, overloaded teachers, invalid double blocks and fixed clashes are rejected',()=>{
 assert.throws(()=>slots('Tue:9',5,6),/Invalid/);assert.deepEqual(slots('mon:1, Fri:6',5,6),[{day:0,period:0},{day:4,period:5}]);
 assert.throws(()=>generateTimetable({days:1,periods:3,breakAfter:0,rows:[row({count:3}),row({section:'B',count:2})]}),/Teacher A needs/);
 assert.throws(()=>generateTimetable({days:5,periods:6,breakAfter:3,rows:[row({block:2})]}),/multiple/);
 assert.throws(()=>generateTimetable({days:5,periods:6,breakAfter:3,rows:[row({block:2,count:2,fixed:[{day:0,period:2}]})]}),/Fixed lesson conflict/);
});
test('unschedulable constraints produce a clearly incomplete result',()=>{
 const result=generateTimetable({days:1,periods:2,breakAfter:0,rows:[row({count:2,unavailable:[{day:0,period:0},{day:0,period:1}]})]});assert.equal(result.unplaced.length,2);assert.equal(result.placed.length,0);
});
test('CSV escapes formulas and quotes',()=>{assert.equal(csv([['=1+2','a"b','line\nbreak']]),'\ufeff"\'=1+2","a""b","line\nbreak"');});
test('every Product footer links the timetable; page has unique IDs and assets',()=>{
 let count=0;function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${ent.name}`;if(ent.isDirectory())walk(path);else if(path.endsWith('.html')){const text=fs.readFileSync(path,'utf8');if(text.includes('<h4>Product</h4>')){const footer=text.split('<h4>Product</h4>')[1].split('</div>')[0];assert.doesNotMatch(footer,/free-question-paper-generator/);assert.match(footer,/href="\/free-school-timetable-generator\/"/);count++;}}}}walk('landing-page');assert.ok(count>=99);
 for(const slug of ['free-school-timetable-generator']){const text=fs.readFileSync(`landing-page/${slug}/index.html`,'utf8');const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);assert.ok(text.includes(`rel="canonical" href="https://schoolment.com/${slug}/"`));for(const match of text.matchAll(/(?:href|src)="(\/[^"?#]+\.(?:css|mjs|js))(?:\?[^"#]*)?"/g))assert.ok(fs.existsSync('landing-page'+match[1]),match[1]);}
});
