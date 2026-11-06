export const $ = id => document.getElementById(id);
export const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
export function download(name,content,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function busy(button,on,label){button.disabled=on;button.innerHTML=on?'<span class="spinner" aria-hidden="true"></span>Generating…':label;button.setAttribute('aria-busy',String(on));}
export function field(label,id,value='',type='text',extra=''){return `<label>${label}<input id="${id}" type="${type}" value="${escape(value)}" ${extra}></label>`;}
export function select(label,id,options,value){return `<label>${label}<select id="${id}">${options.map(o=>`<option ${String(o)===String(value)?'selected':''}>${escape(o)}</option>`).join('')}</select></label>`;}
