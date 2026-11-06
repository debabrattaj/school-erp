// Pure browser-local engines, shared with the regression tests.
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function activeBreaks(c) {
  return (c.breaks ?? [{after:c.breakAfter ?? 0, minutes:c.breakMinutes ?? 20, name:'Break 1'}]).filter(b=>b.after!==0).sort((a,b)=>a.after-b.after);
}
export function timetableTimeline(c, start='09:00', duration=40) {
  const [h,m]=start.split(':').map(Number);
  let time=h*60+m;
  const fmt=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  const entries=[];
  const append=(entry,minutes)=>{entries.push({...entry,time:`${fmt(time)}–${fmt(time+minutes)}`});time+=minutes;};
  for(let p=0;p<c.periods;p++) {
    append({kind:'period',period:p,label:`Period ${p+1}`},duration);
    for(const b of activeBreaks(c).filter(b=>b.after===p+1))append({kind:'break',label:b.name,after:b.after},b.minutes);
  }
  return entries;
}
export function slots(text, days, periods) {
  if (!String(text).trim()) return [];
  return String(text).split(',').map(value => {
    const match = value.trim().match(/^(Mon|Tue|Wed|Thu|Fri|Sat):(\d+)$/i);
    const day = match && DAYS.findIndex(d => d.toLowerCase() === match[1].toLowerCase());
    const period = match ? Number(match[2]) - 1 : -1;
    if (!match || day < 0 || day >= days || period < 0 || period >= periods) throw Error(`Invalid slot “${value}”. Use Mon:1, Tue:3 within the selected week.`);
    return {day, period};
  });
}
export function validateConfig(c) {
  if (!Number.isInteger(c.days) || c.days < 1 || c.days > 6 || !Number.isInteger(c.periods) || c.periods < 1 || c.periods > 10) throw Error('Choose 1–6 working days and 1–10 periods.');
  const breaks=c.breaks ?? [{after:c.breakAfter ?? 0,minutes:c.breakMinutes ?? 20}];
  if(breaks.length>2)throw Error('Choose up to two breaks.');
  for(const b of breaks) {
    if(!Number.isInteger(b.after)||b.after<0||b.after>=c.periods)throw Error('Each break must be after a period before the last period, or 0 for none.');
    if(b.after && (!Number.isInteger(b.minutes)||b.minutes<1||b.minutes>120))throw Error('Each enabled break needs a duration of 1–120 minutes.');
  }
  if(new Set(activeBreaks(c).map(b=>b.after)).size!==activeBreaks(c).length)throw Error('Place the two breaks after different periods.');
  if (!c.rows.length || c.rows.length > 80) throw Error('Add between 1 and 80 teaching assignments.');
  const sections = new Set(), totals = new Map();
  c.rows.forEach((r, i) => {
    if (![r.section, r.subject, r.teacher].every(v => typeof v === 'string' && v.trim() && v.length <= 80)) throw Error(`Row ${i+1}: enter section, subject and teacher (up to 80 characters).`);
    sections.add(r.section);
    if (![1,2].includes(r.block) || !Number.isInteger(r.count) || r.count < 1 || r.count > c.days*c.periods || r.count % r.block) throw Error(`Row ${i+1}: weekly periods must be a positive multiple of the block length.`);
    if (r.fixed.length > r.count/r.block) throw Error(`Row ${i+1}: too many fixed lessons.`);
    for (const s of [...r.fixed, ...r.unavailable]) if (!Number.isInteger(s.day) || !Number.isInteger(s.period) || s.day<0 || s.day>=c.days || s.period<0 || s.period>=c.periods) throw Error('A slot is outside the selected week.');
    for (const key of [`Section ${r.section}`, `Teacher ${r.teacher}`, ...(r.room ? [`Room ${r.room}`] : [])]) totals.set(key, (totals.get(key)||0)+r.count);
  });
  if (sections.size > 5) throw Error('The free tool supports up to 5 sections per timetable.');
  for (const [key, count] of totals) if (count > c.days*c.periods) throw Error(`${key} needs ${count} periods but only ${c.days*c.periods} are available. Reduce its teaching load.`);
}
function unavailable(c, lesson, day, period) {
  return c.rows.some(r => r.teacher === lesson.teacher && r.unavailable.some(s => s.day === day && s.period >= period && s.period < period+lesson.block));
}
export function canPlace(c, placed, lesson, day, period) {
  if (day<0 || day>=c.days || period<0 || period+lesson.block>c.periods || activeBreaks(c).some(b=>period<b.after && period+lesson.block>b.after) || unavailable(c,lesson,day,period)) return false;
  return !placed.some(p => p.id !== lesson.id && p.day===day && p.period < period+lesson.block && period < p.period+p.block && (p.section===lesson.section || p.teacher===lesson.teacher || (p.room && p.room===lesson.room)));
}
export function generateTimetable(c, budget=12000) {
  validateConfig(c);
  const fixed=[], pending=[];
  c.rows.forEach((r,i) => {
    for (let n=0;n<r.count/r.block;n++) {
      const lesson={...r, id:`${i}-${n}`, fixed:n<r.fixed.length};
      if (lesson.fixed) {
        const s=r.fixed[n];
        if (!canPlace(c,fixed,lesson,s.day,s.period)) throw Error(`Fixed lesson conflict: ${r.section}, ${r.subject}, ${DAYS[s.day]} period ${s.period+1}. Check teachers, rooms, availability and breaks.`);
        fixed.push({...lesson,...s});
      } else pending.push(lesson);
    }
  });
  let best=[...fixed], visits=0;
  function search(placed, remaining) {
    if (placed.length>best.length) best=[...placed];
    if (!remaining.length) return true;
    if (++visits>budget) return false;
    let chosen=0, options=null;
    for (let i=0;i<remaining.length;i++) {
      const r=remaining[i], candidates=[];
      for(let d=0;d<c.days;d++) for(let p=0;p<c.periods;p++) if(canPlace(c,placed,r,d,p)) candidates.push({day:d,period:p});
      if (!candidates.length) return false;
      if (!options || candidates.length<options.length) {chosen=i;options=candidates;}
    }
    const lesson=remaining[chosen];
    const score=s => placed.filter(p=>p.section===lesson.section && p.day===s.day).reduce((v,p)=>v+p.block+(p.subject===lesson.subject?8:0),0);
    options.sort((a,b)=>score(a)-score(b)||a.period-b.period||a.day-b.day);
    const rest=remaining.filter((_,i)=>i!==chosen);
    for (const s of options) {placed.push({...lesson,...s});if(search(placed,rest))return true;placed.pop();if(visits>budget)break;}
    return false;
  }
  search([...fixed],pending);
  const ids=new Set(best.map(p=>p.id));
  return {placed:best, unplaced:pending.filter(p=>!ids.has(p.id)), visits};
}
export function moveLesson(c, placed, id, day, period) {
  const lesson=placed.find(p=>p.id===id);
  if (!lesson || lesson.fixed) throw Error('Fixed lessons cannot be moved. Change the fixed slot in setup and regenerate.');
  if (!canPlace(c,placed,lesson,day,period)) throw Error('This move clashes with a lesson, teacher, room, break or availability rule.');
  return placed.map(p=>p.id===id?{...p,day,period}:p);
}
export function csv(rows) {
  return '\ufeff'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
