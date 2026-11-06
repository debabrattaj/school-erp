"""Build the static timetable tool using Schoolment's existing public header/footer."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'landing-page'
reference = (ROOT / 'online-school-management-erp-bhubaneswar/index.html').read_text(encoding='utf-8')
header = re.search(r'<header\b.*?</header>', reference, re.S).group()
footer = re.search(r'<footer\b.*?</footer>', reference, re.S).group()
links = '\n        <a href="/free-school-timetable-generator/">Free Timetable Generator</a>'
if '/free-school-timetable-generator/' not in footer:
    footer = footer.replace('<h4>Product</h4>', '<h4>Product</h4>' + links)
favicon = re.search(r'<link rel="icon"[^>]+>', reference).group()

def field(label, id, value='', type='text', extra=''):
    return f'<label>{label}<input id="{id}" type="{type}" value="{value}" {extra}></label>'

def select(label, id, options, selected):
    return f'<label>{label}<select id="{id}">' + ''.join(f'<option {"selected" if str(o)==str(selected) else ""}>{o}</option>' for o in options) + '</select></label>'

def button(id, text, primary=False, type='button'):
    return f'<button id="{id}" type="{type}" class="{"btn btn-primary" if primary else "tool-secondary"}">{text}</button>'

timetable = f'''
<section class="tool-panel no-print"><h2>How to fill your school week</h2><p><strong>Weekly capacity = working days × teaching periods per day.</strong> For example, 5 days × 6 periods gives <strong>30 periods for each section</strong>. Configure up to two breaks using the period after which each starts and its duration. Set its after-period value to 0 to turn a break off. Both breaks appear as labelled rows or columns with their times. Breaks do not count as teaching periods, so 6 daily teaching periods still means 30 per week.</p><ol><li>Set your working days and daily periods.</li><li>Add one teaching assignment for each subject in each section. An assignment means, for example, “Anita teaches Maths to 6-A for 6 periods per week”.</li><li>Add up the <strong>Periods per week</strong> values separately for each section. To fill a 30-period week, that section's subject totals must equal 30. A smaller total leaves free periods; a larger total will not fit.</li><li>Use the same teacher name consistently across sections so the generator can prevent clashes. Keep consecutive periods at 1 for regular lessons. For a two-period lab, set weekly periods to 2 and consecutive periods to 2; it occupies two slots, not four.</li><li>Click <strong>Generate timetable</strong>, review any unplaced lessons, then select a section or teacher view and your preferred row/column layout before printing.</li></ol><p><strong>Try a sample school</strong> loads 6-A and 6-B with 8 subjects each (16 assignment rows). Each section has Maths 6 + English 5 + Science 5 + Social Studies 4 + Second Language 5 + Computer Lab 2 + Physical Education 2 + Art 1 = <strong>30 periods</strong>. Click Generate timetable to fill the complete week. You can adjust this example to your school's subjects.</p></section>
<form id="setup" class="no-print">
<section class="tool-panel"><h2>01 / Set up your school week</h2><p>Build up to five sections together so shared teachers and rooms are checked across the whole week.</p>
<div class="tool-fields">{field('School name (optional)','school','','text','maxlength="100" placeholder="Your school"')}{select('Working days (starting Monday)','days',[1,2,3,4,5,6],5)}{select('Teaching periods per day','periods',list(range(1,11)),6)}{field('School starts','start','09:00','time','required')}{field('Period duration (minutes)','duration',40,'number','min="10" max="120" required')}{field('Break 1 after period (0 = off)','breakAfter',2,'number','min="0" max="9" required')}{field('Break 1 duration (minutes)','breakMinutes',15,'number','min="1" max="120" required')}{field('Break 2 after period (0 = off)','breakAfter2',4,'number','min="0" max="9" required')}{field('Break 2 duration (minutes)','breakMinutes2',30,'number','min="1" max="120" required')}</div></section>
<section class="tool-panel"><h2>02 / Add teaching assignments</h2><p>Use consistent section, teacher and room names. Enter fixed lesson starts and unavailable periods as <strong>Mon:1, Tue:3</strong>. Teacher unavailability applies to all their assignments. A double lesson uses two weekly periods and cannot cross either break.</p><div class="tool-actions">{button('sample','Try a sample school')}{button('load','Load saved draft')}</div><div id="assignments"></div><div class="tool-actions">{button('add','+ Add assignment')}{button('save','Save draft locally')}{button('setupDownload','Download setup')}</div></section>
<div class="tool-actions">{button('generate','Generate timetable',True,'submit')}</div></form>
<div id="status" class="tool-status no-print" role="status" aria-live="polite"></div>
<section id="output" class="tool-panel" hidden><div class="no-print"><h2>03 / Review your timetable</h2><div class="tool-actions review-actions">{select('View by','view',['Section','Teacher'],'Section')}{select('Timetable layout','layout',['Weekdays in first row','Weekdays in first column'],'Weekdays in first row')}{button('csv','Download CSV (Excel)')}{button('print','Print / Save PDF')}</div><details><summary>Move a lesson</summary><p>Moves are checked against the same clash and availability rules. Fixed lessons must be changed in setup.</p><div class="tool-fields"><label>Lesson<select id="lesson"></select></label><label>Day<select id="moveDay"></select></label><label>Start period<select id="movePeriod"></select></label></div>{button('move','Move lesson')}</details></div><div id="tables"></div></section>
<section class="tool-panel no-print"><h2>A useful first draft, with constraints you control</h2><p>Empty slots stay free. If the bounded search cannot place every lesson, the result is labelled partial and lists the missing lessons. This does not prove a schedule is impossible. Adjust loads, fixed lessons or availability and try again. Review workload balance before sharing.</p><p>Timetable processing stays in your browser. Save draft stores setup on this device only. Download CSV opens in Excel or other spreadsheets. For PDF, choose Save as PDF in your browser's print dialog; landscape works well for wider tables.</p><p>Need timetable management inside your ERP? <a class="tool-link" href="/modules/student-attendance-and-timetable-system/">Explore Schoolment attendance &amp; timetable</a>.</p></section>'''

for slug,title,description,module,content,badges in [
    ('free-school-timetable-generator','Free School Timetable Generator','Arrange your school week with teacher-clash checks, fixed lessons, double periods and printable class or teacher timetables.','timetable',timetable,['Up to 5 sections','No sign-up','Runs in your browser']),
]:
    page=f'''<!DOCTYPE html>
<html lang="en" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} | Schoolment</title><meta name="description" content="{description}"><meta name="robots" content="index,follow"><link rel="canonical" href="https://schoolment.com/{slug}/">
<meta property="og:type" content="website"><meta property="og:title" content="{title} | Schoolment"><meta property="og:description" content="{description}"><meta property="og:url" content="https://schoolment.com/{slug}/"><meta property="og:image" content="https://schoolment.com/og-image.png">
{favicon}<script>try{{document.documentElement.dataset.theme=localStorage.getItem('theme')||'dark'}}catch{{}}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css?v=content-depth-43"><link rel="stylesheet" href="/tools/tools.css?v=3"><script src="/analytics.js?v=2" defer></script></head>
<body class="tool-page">{header}<main id="main-content"><section class="tool-hero"><div class="container"><a class="tool-kicker" href="/">Schoolment / Free tools for educators</a><h1>{title}</h1><p>{description}</p><div class="tool-badges">{''.join('<span>'+b+'</span>' for b in badges)}</div></div></section><div class="container tool-workspace"><noscript><p>Enable JavaScript to use this interactive tool.</p></noscript>{content}</div></main>{footer}<script src="/script.js?v=dark-default-1"></script><script type="module" src="/tools/{module}.mjs?v=3"></script></body></html>'''
    directory=ROOT/slug
    directory.mkdir(exist_ok=True)
    (directory/'index.html').write_text(page,encoding='utf-8')

# Idempotently add links to every existing Product footer, including the new pages.
for path in ROOT.rglob('*.html'):
    text=path.read_text(encoding='utf-8')
    if '<h4>Product</h4>' in text and '/free-school-timetable-generator/' not in text[text.index('<h4>Product</h4>'):text.index('<h4>Product</h4>')+700]:
        path.write_text(text.replace('<h4>Product</h4>','<h4>Product</h4>'+links),encoding='utf-8')
sitemap=ROOT/'sitemap.xml'
text=sitemap.read_text(encoding='utf-8')
for slug in ['free-school-timetable-generator']:
    if f'https://schoolment.com/{slug}/' not in text:
        text=text.replace('</urlset>',f'  <url><loc>https://schoolment.com/{slug}/</loc></url>\n</urlset>')
sitemap.write_text(text,encoding='utf-8')
print('Built timetable tool, added Product footer links and sitemap entry.')
