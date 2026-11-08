import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalog,templates,defaultValues,slug} from '../landing-page/tools/document-catalog.mjs';
import {feeTotal,renderDocument} from '../landing-page/tools/document-render.mjs';
test('all ten categories render three templates and have linked static pages',()=>{
 assert.equal(catalog.length,10);assert.equal(templates.length,3);
 const hub=fs.readFileSync('landing-page/free-tools/index.html','utf8'),sitemap=fs.readFileSync('landing-page/sitemap.xml','utf8');
 for(const tool of catalog){for(const template of templates){const v={...defaultValues(tool),template:template.id};const html=renderDocument(tool,v);assert.ok(html.includes(`template-${template.id}`));assert.ok(html.includes(tool.title));}
 const page=fs.readFileSync(`landing-page/${slug(tool)}/index.html`,'utf8');assert.ok(page.includes(`data-tool="${tool.id}"`));assert.ok(hub.includes(`href="/${slug(tool)}/"`));assert.ok(sitemap.includes(`https://schoolment.com/${slug(tool)}/`));
 const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 }
});
test('fee totals use minor currency units and reject invalid values',()=>{
 assert.equal(feeTotal([{label:'Tuition',amount:'1000.10'},{label:'Library',amount:'0.20'}]),100030);
 for(const amount of ['-1','1.001','abc','Infinity','1e6'])assert.throws(()=>feeTotal([{label:'Fee',amount}]));
 assert.throws(()=>feeTotal([]));assert.throws(()=>feeTotal([{label:'',amount:'10'}]));
});
test('documents escape user content and do not inject HTML',()=>{
 for(const tool of catalog){const v=defaultValues(tool);for(const f of tool.fields)if(f.type==='text'||f.type==='textarea')v[f.id]='<script>alert(1)</script>';v.school='<img src=x onerror=alert(1)>';v.items=[{label:'<img src=x>',amount:'10'}];const html=renderDocument(tool,v);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img'));}
});
test('attendance handles leap years, holidays and multiple pages',()=>{
 const tool=catalog.find(t=>t.kind==='attendance');let v={...defaultValues(tool),month:'2028-02',roster:Array.from({length:41},(_,i)=>`Student ${i+1}`).join('\n')};let html=renderDocument(tool,v);assert.equal((html.match(/class="document-sheet/g)||[]).length,3);assert.ok(html.includes('>29</th>'));assert.ok(!html.includes('>30</th>'));assert.ok(html.includes('Page 3 of 3'));assert.ok(html.includes('holiday'));
 assert.throws(()=>renderDocument(tool,{...v,month:'2026-13'}));
 assert.throws(()=>renderDocument(tool,{...v,roster:Array(101).fill('Student').join('\n')}));
});
test('clearance defaults pending and challan is not a paid receipt',()=>{
 const tool=catalog.find(t=>t.kind==='no-dues');const html=renderDocument(tool,defaultValues(tool));assert.ok(html.includes('Pending verification'));assert.ok(!html.includes('confirms that no dues remain'));
 const challan=catalog.find(t=>t.kind==='challan');assert.ok(renderDocument(challan,defaultValues(challan)).includes('not proof of payment'));
});
