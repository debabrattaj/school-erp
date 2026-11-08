import {escape as esc} from './ui.mjs?v=1';
export function money(value){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value/100);}
export function feeTotal(items){
 if(!Array.isArray(items)||items.length<1||items.length>20)throw Error('Add 1–20 fee items.');
 return items.reduce((sum,item)=>{if(!item.label?.trim())throw Error('Give each fee item a description.');if(!/^\d{1,8}(\.\d{1,2})?$/.test(String(item.amount)))throw Error('Enter non-negative amounts with up to two decimal places (maximum ₹99,999,999.99 per item).');return sum+Math.round(Number(item.amount)*100);},0);
}
const value=v=>v?esc(v):'<span class="doc-blank">________________</span>';
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.split('-').reverse().join('/'):v;
const lines=v=>String(v||'').split('\n').map(x=>x.trim()).filter(Boolean);
const para=s=>`<p>${s}</p>`;
function pairs(rows){return `<dl class="doc-pairs">${rows.map(([label,v])=>`<div><dt>${esc(label)}</dt><dd>${value(v)}</dd></div>`).join('')}</dl>`;}
function header(tool,v){return `<header class="doc-header">${/^data:image\/(png|jpeg|webp);base64,/.test(v.logo||'')?`<img class="doc-logo" src="${esc(v.logo)}" alt="School logo">`:''}<div><h2>${value(v.school)}</h2><p>${esc(v.addressSchool)}</p><p>${esc(v.contactSchool)}</p></div></header><h3 class="doc-title">${esc(tool.title)}</h3>`;}
function signature(v){return `<footer class="doc-signatures"><div>Place: ${value(v.place)}<br><br>School seal</div><div><span class="signature-line"></span>${value(v.signatory)}</div></footer>`;}
function sheet(tool,v,body,page=''){return `<section class="document-sheet template-${['classic','modern','minimal'].includes(v.template)?v.template:'classic'} ${tool.kind==='attendance'?'attendance-page':''}">${header(tool,v)}${page?`<p class="doc-page-number">${page}</p>`:''}${body}${signature(v)}</section>`;}
export function renderDocument(tool,v){
 const common=pairs([['Reference',v.reference],['Date',date(v.date)]]);
 const student=pairs([['Student',v.student],['Admission / roll no.',v.admission],['Class / section',v.className],['Parent / guardian',v.parent]]);
 let body='';
 if(['receipt','challan'].includes(tool.kind)){
   const total=feeTotal(v.items);
   body=common+student+pairs([['Academic year',v.year],...(tool.kind==='receipt'?[['Payment mode',v.paymentMode],['Transaction reference',v.transaction]]:[['Due date',date(v.due)]])])+`<table class="doc-table"><thead><tr><th>Fee description</th><th class="amount">Amount (INR)</th></tr></thead><tbody>${v.items.map(i=>`<tr><td>${esc(i.label)}</td><td class="amount">${money(Math.round(Number(i.amount)*100))}</td></tr>`).join('')}</tbody><tfoot><tr><th>${tool.kind==='receipt'?'Total received':'Total payable'}</th><th class="amount">${money(total)}</th></tr></tfoot></table>`;
   if(tool.kind==='challan')body+=pairs([['Bank',v.bank],['Beneficiary',v.beneficiary],['Account number',v.account],['IFSC',v.ifsc]])+para('<strong>Payment demand only — not proof of payment.</strong> Please quote the challan number when paying.');
   else body+=para('Received the amount listed above towards the stated fee items.');
   body+=para(esc(v.remarks));
 } else if(tool.kind==='transfer'){
   body=common+student+pairs([['Date of birth',date(v.dob)],['Date of admission',date(v.joined)],['Date of leaving',date(v.leaving)],['Last class studied',v.lastClass],['Promotion / examination result',v.result],['Conduct',v.conduct],['Reason for leaving',v.reason]])+para(esc(v.remarks))+para('The above particulars are to be checked against the school admission and academic records before issue.');
 } else if(tool.kind==='notice'){
   body=common+`<h4 class="notice-heading">${value(v.heading)}</h4>`+pairs([['To',v.audience],...(v.eventDate?[['Event date',date(v.eventDate)]]:[]),...(v.venue?[['Venue',v.venue]]:[])])+`<div class="notice-body">${value(v.body)}</div>`+pairs([['Issued by',v.authority],['Contact',v.contact]]);
 } else if(tool.kind==='bonafide'){
   body=common+para(`This is to certify that <strong>${value(v.student)}</strong>, child / ward of ${value(v.parent)}, admission number ${value(v.admission)}, is a bonafide student of <strong>${value(v.school)}</strong>, studying in ${value(v.className)} during the academic year ${value(v.year)}.`)+para(`This certificate is issued for ${value(v.purpose)}.`)+para(esc(v.remarks));
 } else if(tool.kind==='character'){
   body=common+para(`This is to certify that <strong>${value(v.student)}</strong>, child / ward of ${value(v.parent)}, admission number ${value(v.admission)}, studied at ${value(v.school)} from ${value(date(v.from))} to ${value(date(v.to))}, in ${value(v.className)}.`)+para(`According to the records reviewed by the issuing authority, the student's conduct is recorded as: <strong>${value(v.conduct)}</strong>.`)+para(esc(v.remarks));
 } else if(tool.kind==='study'){
   body=common+para(`This is to certify that <strong>${value(v.student)}</strong>, child / ward of ${value(v.parent)}, admission number ${value(v.admission)}, studied at <strong>${value(v.school)}</strong> from ${value(date(v.from))} to ${value(date(v.to))}.`)+pairs([['Classes studied',v.classes],['Class / section',v.className],['Medium of instruction',v.medium]])+para(`Issued for ${value(v.purpose)} on the basis of school records.`);
 } else if(tool.kind==='no-dues'){
   const departments=lines(v.departments);if(departments.length>15)throw Error('Use up to 15 departments.');
   const cleared=v.clearance==='All listed departments verified clear';
   body=common+student+para(cleared?'The issuing authority confirms that no dues remain outstanding in the departments listed below as of the issue date.':'<strong>Pending verification.</strong> This clearance record does not certify that all dues have been cleared.')+`<table class="doc-table"><thead><tr><th>Department</th><th>Status</th><th>Verifier / signature</th></tr></thead><tbody>${departments.map(d=>`<tr><td>${esc(d)}</td><td>${cleared?'Verified clear':'Pending'}</td><td>________________</td></tr>`).join('')}</tbody></table>`+para(esc(v.remarks));
 } else if(tool.kind==='admission'){
   const docs=lines(v.documents);if(docs.length>15)throw Error('Use up to 15 required documents.');
   body=pairs([['Application number',v.reference],['Academic year',v.year],['Class applied for',v.className]])+`<div class="photo-space">Applicant<br>photograph</div><h4>Applicant details</h4>`+pairs([['Full name',v.student],['Date of birth',date(v.dob)],['Previous school',v.previous],['Parent / guardian',v.parent],['Contact number',v.phone],['Email',v.email],['Residential address',v.address]])+`<h4>Document checklist</h4><ul class="doc-checklist">${docs.map(d=>`<li>☐ ${esc(d)}</li>`).join('')}</ul>`+para(esc(v.instructions))+`<h4>Declaration</h4>${para('I confirm that the information provided is accurate to the best of my knowledge. Submission of this form does not guarantee admission.')}<p>Parent / guardian signature: ____________________ &nbsp; Date: ______________</p><h4>For office use</h4><p>Documents checked by: ____________________ &nbsp; Decision: ______________</p>`;
 } else if(tool.kind==='attendance'){
   if(!/^\d{4}-\d{2}$/.test(v.month))throw Error('Choose the attendance month.');
   const [year,month]=v.month.split('-').map(Number);if(year<1900||year>2200||month<1||month>12)throw Error('Choose a month between 1900 and 2200.');
   const names=lines(v.roster);if(names.length>100)throw Error('Use up to 100 students.');
   const count=new Date(year,month,0).getDate(), roster=names.length?names:Array(20).fill('');
   const holiday=d=>{const day=new Date(year,month-1,d).getDay();return v.weekend==='Sunday'?day===0:v.weekend==='Saturday and Sunday'?[0,6].includes(day):false;};
   const pages=[];
   for(let start=0;start<roster.length;start+=20){const part=roster.slice(start,start+20);body=pairs([['Class / section',v.className],['Month',v.month],['Teacher',v.teacher]])+`<table class="doc-table attendance-grid"><thead><tr><th>No.</th><th class="student-column">Student name</th>${Array.from({length:count},(_,i)=>`<th class="${holiday(i+1)?'holiday':''}">${i+1}</th>`).join('')}<th>P</th><th>A</th></tr></thead><tbody>${part.map((name,i)=>`<tr><td>${start+i+1}</td><td>${esc(name)}</td>${Array.from({length:count},(_,d)=>`<td class="${holiday(d+1)?'holiday':''}">${holiday(d+1)?'—':''}</td>`).join('')}<td></td><td></td></tr>`).join('')}</tbody></table>`+para('Mark P = present, A = absent, L = leave, H = holiday. Shaded / dashed dates are configured weekly holidays. Fill totals after marking attendance.');pages.push(sheet(tool,v,body,`Page ${pages.length+1} of ${Math.ceil(roster.length/20)}`));}return pages.join('');
 }
 return sheet(tool,v,body);
}
