import base64
import io
import pytest
from PIL import Image
from app.report_document import document_pdf, validate_document

def p(value): return {"type":"paragraph","content":[{"type":"text","text":value}]}
def sample():
    return {"type":"doc","content":[
        {"type":"heading","attrs":{"level":1,"textAlign":"center"},"content":[{"type":"text","text":"Term achievement","marks":[{"type":"bold"},{"type":"textStyle","attrs":{"color":"#663399","fontSize":"24pt","fontFamily":"Times New Roman"}}]}]},
        {"type":"paragraph","content":[{"type":"reportField","attrs":{"field":"student_name"}}]},
        {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","attrs":{"colspan":2,"backgroundColor":"#eef2ff"},"content":[p("Merged heading")] }]},{"type":"tableRow","content":[{"type":"tableCell","content":[p("Left")]},{"type":"tableCell","content":[p("Right")]}]}]},
        {"type":"reportMarks"},{"type":"pageBreak"},p("Second page")
    ]}

def test_full_document_persistence_and_editing(client,auth):
    doc=sample()
    response=client.post('/marks/templates',json={"name":"Full document QA","configuration":{"document_json":doc}},headers=auth)
    assert response.status_code==201,response.text
    row=response.json()
    reopened=next(item for item in client.get('/marks/templates',headers=auth).json() if item['id']==row['id'])
    assert reopened['configuration']['document_json']==doc
    reopened['configuration']['document_json']['content'].append(p('New editable paragraph'))
    updated=client.put(f"/marks/templates/{row['id']}",json={"name":row['name'],"revision":row['revision'],"configuration":reopened['configuration']},headers=auth)
    assert updated.status_code==200,updated.text
    assert updated.json()['configuration']['document_json']['content'][-1]==p('New editable paragraph')

@pytest.mark.parametrize('node',[
    {'type':'script'}, {'type':'image','attrs':{'src':'https://example.com/private.png'}},
    {'type':'reportField','attrs':{'field':'password'}},
    {'type':'paragraph','content':[{'type':'text','text':'Unsafe','marks':[{'type':'textStyle','attrs':{'color':'url(test)'}}]}]},
    {'type':'paragraph','content':[{'type':'pageBreak'}]},
])
def test_rejects_unsupported_or_unsafe_document_content(node):
    with pytest.raises(ValueError): validate_document({'type':'doc','content':[node]})

def test_renders_formatted_merged_tables_images_and_pagination():
    doc=sample();image=io.BytesIO();Image.new('RGB',(20,20),'blue').save(image,format='PNG')
    doc['content'].append({'type':'image','attrs':{'src':'data:image/png;base64,'+base64.b64encode(image.getvalue()).decode(),'width':100}})
    doc['content'].extend([p('Paragraph with wrapping and user text <script> & special characters. '*8) for _ in range(30)])
    pdf=document_pdf({'student_name':'Sample Student','rows':[{'subject':'Mathematics','obtained':93,'max':100,'grade':'A+'}]},doc)
    assert pdf.startswith(b'%PDF') and len(pdf)>5000

def test_schema_rejects_invalid_document_with_422(client,auth):
    response=client.post('/marks/templates',json={'name':'Invalid document','configuration':{'document_json':{'type':'doc','content':[{'type':'image','attrs':{'src':'file:///etc/passwd'}}]}}},headers=auth)
    assert response.status_code==422,response.text
