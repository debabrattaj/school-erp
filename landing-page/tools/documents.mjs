import {catalog,templates,defaultValues} from './document-catalog.mjs?v=1';
import {renderDocument} from './document-render.mjs?v=1';
import {$,escape as e,download} from './ui.mjs?v=1';
const tool=catalog.find(t=>t.id===document.body.dataset.tool);
let values=defaultValues(tool), logo='', timer;
const key=`schoolment-document-${tool.id}-v1`;
function field(f){const value=values[f.id]??'';let input;
 if(f.type==='textarea')input=`<textarea id="field-${f.id}" data-field="${f.id}" maxlength="${['roster','body'].includes(f.id)?8000:2000}" rows="4">${e(value)}</textarea>`;
 else if(f.type.startsWith('select:'))input=`<select id="field-${f.id}" data-field="${f.id}">${f.type.slice(7).split('|').map(o=>`<option ${o===value?'selected':''}>${e(o)}</option>`).join('')}</select>`;
 else input=`<input id="field-${f.id}" data-field="${f.id}" type="${f.type}" maxlength="200" value="${e(value)}">`;
 return `<label class="${f.type==='textarea'?'wide-field':''}" for="field-${f.id}">${e(f.label)}${input}</label>`;
}
function setup(){
 $('fields').innerHTML=tool.fields.map(field).join('');
 for(const id of ['school','addressSchool','contactSchool','signatory','place'])$(id).value=values[id]||'';
 $('templateOptions').innerHTML=templates.map(t=>`<label class="template-choice ${values.template===t.id?'selected':''}"><input type="radio" name="template" value="${t.id}" ${values.template===t.id?'checked':''}><span class="template-mini mini-${t.id}" aria-hidden="true">Aa<br>━━━━<br>── ──</span><strong>${e(t.name)}</strong><span>${e(t.detail)}</span></label>`).join('');
 $('feeItems').hidden=!['receipt','challan'].includes(tool.kind);items();render();
}
function items(){ $('items').innerHTML=values.items.map((item,i)=>`<div class="fee-item"><label>Fee description<input data-item="${i}" data-key="label" maxlength="150" value="${e(item.label)}"></label><label>Amount (₹)<input data-item="${i}" data-key="amount" type="number" min="0" max="99999999.99" step="0.01" value="${e(item.amount)}"></label><button type="button" class="tool-secondary" data-remove="${i}" aria-label="Remove fee item ${i+1}">Remove</button></div>`).join('');
 $('items').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{read();values.items.splice(+b.dataset.remove,1);items();render();});
}
function read(){for(const el of document.querySelectorAll('[data-field]'))values[el.dataset.field]=el.value;for(const id of ['school','addressSchool','contactSchool','signatory','place'])values[id]=$(id).value;for(const el of document.querySelectorAll('[data-item]'))values.items[+el.dataset.item][el.dataset.key]=el.value;values.template=document.querySelector('input[name="template"]:checked')?.value||'classic';values.logo=logo;}
function message(text,error=false){$('docStatus').textContent=text;$('docStatus').dataset.error=String(error);}
function render(){read();try{$('documentPreview').innerHTML=renderDocument(tool,values);$('printDocument').disabled=false;$('downloadDocument').disabled=false;message('Preview updated. Blank fields appear as writing spaces. Review before issuing.');return true;}catch(error){$('documentPreview').replaceChildren();$('printDocument').disabled=true;$('downloadDocument').disabled=true;message(error.message,true);return false;}}
$('documentForm').addEventListener('input',event=>{if(event.target.name==='template')document.querySelectorAll('.template-choice').forEach(l=>l.classList.toggle('selected',l.querySelector('input').checked));clearTimeout(timer);timer=setTimeout(render,150);});
$('documentForm').onsubmit=event=>{event.preventDefault();render();};
$('addItem').onclick=()=>{read();if(values.items.length>=20)return message('Maximum 20 fee items.',true);values.items.push({label:'',amount:'0'});items();render();};
$('logo').onchange=async event=>{const file=event.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1500000){event.target.value='';return message('Choose a PNG, JPEG or WebP logo smaller than 1.5 MB.',true);}const reader=new FileReader();reader.onload=()=>{logo=String(reader.result);render();};reader.readAsDataURL(file);};
$('removeLogo').onclick=()=>{logo='';$('logo').value='';render();};
$('saveDraft').onclick=()=>{read();try{localStorage.setItem(key,JSON.stringify(values));message('Draft saved on this device. Use Clear saved draft to remove it, especially on a shared computer.');}catch{message('Browser storage is full or unavailable. Download an editable HTML copy instead.',true);}};
$('loadDraft').onclick=()=>{try{const data=JSON.parse(localStorage.getItem(key));if(!data||typeof data!=='object'||!Array.isArray(data.items)||data.items.length>20)throw Error();const fresh=defaultValues(tool);for(const k of Object.keys(fresh))if(typeof fresh[k]==='string'&&typeof data[k]==='string')fresh[k]=data[k];fresh.items=data.items.map(i=>({label:String(i.label||''),amount:String(i.amount??'0')}));values=fresh;logo=values.logo;setup();message('Saved draft loaded.');}catch{message('No valid saved draft found for this tool.',true);}};
$('clearDraft').onclick=()=>{try{localStorage.removeItem(key);message('Saved draft removed from this browser. The current preview is unchanged.');}catch{message('Browser storage is unavailable.',true);}};
$('resetDocument').onclick=()=>{values=defaultValues(tool);logo='';$('logo').value='';setup();};
$('printDocument').onclick=()=>{if(!$('documentForm').reportValidity()||!render())return;window.print();};
$('downloadDocument').onclick=async()=>{
 if(!$('documentForm').reportValidity()||!render())return;
 const button=$('downloadDocument');button.disabled=true;button.textContent='Preparing download…';
 try{const response=await fetch($('documentStyles').href);if(!response.ok)throw Error();const style=await response.text();download(`${tool.id}.html`,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(tool.name)}</title><style>${style}</style></head><body class="standalone-document"><p class="no-print">Click the document to edit text. Use your browser's Print command to save as PDF.</p><main contenteditable="true">${$('documentPreview').innerHTML}</main></body></html>`,'text/html;charset=utf-8');message('Editable HTML downloaded with its styles and logo included.');}
 catch{message('Could not prepare the HTML download. Try Print / Save PDF instead.',true);}
 finally{button.disabled=false;button.textContent='Download editable HTML';}
};
setup();
