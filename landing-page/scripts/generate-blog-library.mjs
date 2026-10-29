import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDocuments, readExistingBlogs, summarizeAudit } from '../../scripts/audit-blog-content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const landing = path.resolve(here, '..');
const blogRoot = path.join(landing, 'blog');
const sourceArticle = path.join(blogRoot, 'guide-to-online-fee-payment-systems', 'index.html');
const source = fs.readFileSync(sourceArticle, 'utf8');
const header = source.slice(source.indexOf('<header class="site-header"'), source.indexOf('  <!-- ===== Breadcrumb ===== -->'));
const footer = source.slice(source.indexOf('  <footer class="site-footer">'), source.lastIndexOf('</body>'));
const favicon = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Cg fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' transform='translate(4 4)'%3E%3Cpath d='M12 3 3.5 8h17z'/%3E%3Cpath d='M6.5 8v9'/%3E%3Cpath d='M10 8v9'/%3E%3Cpath d='M14 8v9'/%3E%3Cpath d='M17.5 8v9'/%3E%3Cpath d='M4 20h16'/%3E%3C/g%3E%3C/svg%3E" />`;

const clusters = [
  ['admissions', 'Admissions and enrolment', [
    ['school-admission-process-checklist', 'School Admission Process Checklist: From Enquiry to Enrolment', 'Build a dependable admission flow that helps office staff respond quickly, collect complete records and give every applicant a clear next step.'],
    ['admission-enquiry-follow-up-process', 'How to Manage Admission Enquiries Without Losing Prospective Families', 'A practical follow-up process for school admission enquiries, callbacks, visits and application completion.'],
    ['school-admission-document-checklist', 'School Admission Document Checklist for a Faster, Cleaner Verification Process', 'What to collect, when to verify it and how to avoid incomplete admission records.'],
    ['student-enrolment-workflow-for-schools', 'Student Enrolment Workflow for Schools: A Step-by-Step Operations Guide', 'Move an accepted applicant into the right class, section and parent account with fewer handoffs.'],
    ['admission-crm-for-schools-guide', 'What a School Admission CRM Should Actually Help Your Team Do', 'A buyer and operations guide to enquiry tracking, counsellor ownership and conversion reporting.'],
    ['reduce-admission-season-workload', 'How Schools Can Reduce Admission Season Workload Without Losing Personal Follow-Up', 'Design a repeatable admission routine that keeps families informed while protecting office time.'],
    ['school-admission-statuses-explained', 'School Admission Statuses Explained: How to Keep Every Application Moving', 'Use simple stages so applicants, office staff and school leaders can see what happens next.'],
    ['parent-communication-during-admissions', 'Parent Communication During Admissions: Messages That Build Trust Before Day One', 'A practical communication plan for enquiry acknowledgement, visits, documents and confirmation.'],
    ['school-waitlist-management-guide', 'School Waitlist Management: A Fair, Traceable Process for Admissions Teams', 'How to maintain a clear waitlist, record decisions and communicate respectfully with families.'],
    ['admission-reporting-for-school-leaders', 'Admission Reporting for School Leaders: Metrics That Improve Decisions', 'Track enquiry sources, turnaround time, application completion and enrolment without vanity metrics.']]],
  ['fees', 'Fees and finance', [
    ['school-fee-collection-calendar', 'How to Build a School Fee Collection Calendar That Parents Can Follow', 'Plan generation dates, due dates, reminders and review points around the school year.'],
    ['fee-structure-design-for-schools', 'Fee Structure Design for Schools: Amounts, Classes, Concessions and Clarity', 'Create fee rules that are easy for accounts teams to maintain and families to understand.'],
    ['school-fee-reminder-best-practices', 'School Fee Reminder Best Practices: Timely Follow-Up Without Friction', 'Create respectful, useful reminder schedules for unpaid and partially paid balances.'],
    ['school-fee-reconciliation-process', 'School Fee Reconciliation Process: A Daily Routine for Accurate Collections', 'Reconcile online, cash and bank payments with a clear exception workflow.'],
    ['fee-concession-management-in-schools', 'Fee Concession Management in Schools: Controls, Records and Fair Decisions', 'A practical process for documenting approvals, adjustments and communication.'],
    ['school-fee-receipt-management', 'School Fee Receipt Management: What an Audit-Friendly Process Looks Like', 'Keep receipt numbers, payment status and parent communication aligned.'],
    ['school-fee-defaulter-follow-up', 'School Fee Defaulter Follow-Up: A Structured, Respectful Collection Workflow', 'Move from a generic defaulter list to a prioritised and documented follow-up process.'],
    ['school-fee-payment-options-guide', 'School Fee Payment Options: How to Give Parents Choice Without Creating Reconciliation Work', 'Compare payment channels through the lens of operations, receipts and parent experience.'],
    ['school-fee-refund-process', 'School Fee Refund Process: How to Handle Requests with Clarity and Control', 'Set up records, approvals and parent updates for refunds and reversals.'],
    ['monthly-fee-generation-checklist', 'Monthly Fee Generation Checklist for School Accounts Teams', 'A repeatable checklist for fee rules, student eligibility, deadlines and post-run review.']]],
  ['attendance', 'Attendance and timetable', [
    ['daily-attendance-process-for-schools', 'Daily Attendance Process for Schools: A Reliable Routine from Class to Parent', 'Make attendance accurate, timely and useful for teachers, office staff and families.'],
    ['student-attendance-reporting-guide', 'Student Attendance Reporting: What Schools Should Review Each Week', 'Turn attendance data into actionable patterns instead of a monthly compliance exercise.'],
    ['attendance-follow-up-for-absent-students', 'Attendance Follow-Up for Absent Students: A Practical Communication Workflow', 'Know when to notify parents, escalate patterns and record the outcome consistently.'],
    ['biometric-attendance-for-schools', 'Biometric Attendance for Schools: Questions to Ask Before You Deploy', 'Assess reliability, privacy, fallback processes and integration before adopting biometric devices.'],
    ['teacher-attendance-management-guide', 'Teacher Attendance Management: Build a Clear, Fair Daily Process', 'Use records, approvals and reporting to reduce uncertainty around staff availability.'],
    ['school-timetable-planning-guide', 'School Timetable Planning: How to Balance Teachers, Rooms and Subject Time', 'A practical planning method for reducing conflicts before a term begins.'],
    ['substitute-teacher-management', 'Substitute Teacher Management: How Schools Can Handle Absences Without Chaos', 'Track availability, cover assignments and communication when the regular timetable changes.'],
    ['attendance-policy-digital-records', 'Attendance Policy and Digital Records: Turning Rules into a Consistent Workflow', 'Make policy expectations visible in daily recording, approvals and reporting.'],
    ['improve-student-attendance-school', 'How Schools Can Improve Student Attendance Using Early Signals', 'Use patterns, empathetic communication and clear ownership to support regular attendance.'],
    ['attendance-data-privacy-schools', 'Attendance Data Privacy for Schools: Access, Accuracy and Responsible Use', 'Practical safeguards for student and staff attendance data in school systems.']]],
  ['exams', 'Exams and academic records', [
    ['exam-planning-checklist-for-schools', 'Exam Planning Checklist for Schools: From Timetable to Result Release', 'A controlled preparation workflow for assessments, rooms, invigilation and communication.'],
    ['school-exam-timetable-management', 'School Exam Timetable Management: Preventing Clashes Before They Reach Students', 'Coordinate subjects, classes, rooms and announcements with less last-minute change.'],
    ['marks-entry-quality-checks', 'Marks Entry Quality Checks: How Schools Can Reduce Result Errors', 'Simple review controls for marks capture, absences, maximum marks and approval.'],
    ['report-card-generation-guide', 'Report Card Generation: A School Operations Guide for Accurate, Timely Results', 'Bring marks, grades, comments and publication controls into one repeatable workflow.'],
    ['exam-result-publication-process', 'Exam Result Publication Process: Review, Approve and Release with Confidence', 'Set clear checkpoints before families see results.'],
    ['grading-policy-management-schools', 'Grading Policy Management for Schools: Keeping Assessment Rules Consistent', 'Translate academic policy into clear grade bands, calculations and communication.'],
    ['student-progress-reporting-guide', 'Student Progress Reporting: Making Report Cards More Useful for Parents', 'Combine results, teacher context and next steps without overwhelming families.'],
    ['online-exam-readiness-checklist', 'Online Exam Readiness Checklist for Schools', 'Prepare students, teachers and support teams for fair, stable online assessments.'],
    ['exam-invigilation-management', 'Exam Invigilation Management: Roles, Records and Day-of-Exam Readiness', 'A practical guide to assignments, incident recording and room-level visibility.'],
    ['academic-records-management-guide', 'Academic Records Management: Keep Student History Complete and Accessible', 'Manage marks, report cards and progression records through the school lifecycle.']]],
  ['communication', 'Parent communication', [
    ['parent-school-communication-plan', 'Parent-School Communication Plan: Messages, Channels and Response Ownership', 'Build a communication system that is useful, consistent and respectful of family time.'],
    ['school-notice-management-guide', 'School Notice Management: How to Send Updates Parents Actually See', 'Write, target and track notices without relying on scattered groups and paper copies.'],
    ['parent-portal-adoption-strategy', 'How to Improve Parent Portal Adoption in Your School', 'Make accounts, notices, results and fee information easy for families to use.'],
    ['school-whatsapp-communication-guide', 'WhatsApp Communication for Schools: A Responsible Operations Guide', 'Use familiar channels with clear consent, timing and message ownership.'],
    ['parent-teacher-meeting-management', 'Parent-Teacher Meeting Management: Scheduling, Notes and Follow-Up', 'Organise appointment slots and record outcomes that support student progress.'],
    ['school-emergency-communication-plan', 'School Emergency Communication Plan: Fast, Clear Updates When It Matters', 'Prepare contacts, templates and escalation paths before an urgent situation occurs.'],
    ['multilingual-parent-communication', 'Multilingual Parent Communication: Making School Information More Accessible', 'Plan translation, review and channel choices for diverse school communities.'],
    ['school-feedback-collection-guide', 'School Feedback Collection: Turn Parent Input into Better Operations', 'Collect feedback with purpose, protect privacy and close the loop visibly.'],
    ['school-communication-calendar', 'School Communication Calendar: Reduce Last-Minute Notices and Parent Confusion', 'Plan recurring notices around academic, fee, transport and event milestones.'],
    ['parent-query-management-schools', 'Parent Query Management: A Clear Process from Question to Resolution', 'Assign ownership, set response expectations and prevent important messages from being lost.']]],
  ['operations', 'School operations', [
    ['school-year-setup-checklist', 'School Year Setup Checklist: Prepare Your Systems Before the First Day', 'A practical readiness list for classes, users, fees, timetables and communication.'],
    ['school-data-migration-guide', 'School Data Migration Guide: Moving Records Without Losing Trust', 'Plan data cleanup, mapping, validation and handover for a smoother ERP rollout.'],
    ['school-erp-implementation-plan', 'School ERP Implementation Plan: A Staged Rollout That Staff Can Adopt', 'Define priorities, owners, training and success checks before switching systems.'],
    ['school-erp-user-training-guide', 'School ERP User Training: How to Help Staff Build Daily Confidence', 'Create role-based training, practice tasks and support routes that stick.'],
    ['school-erp-permissions-guide', 'School ERP Permissions: Give Teams Access Without Losing Control', 'Design roles around real responsibilities and review access as people change roles.'],
    ['school-data-quality-checklist', 'School Data Quality Checklist: The Records That Need Attention First', 'Improve student, parent, class and finance data before reporting depends on it.'],
    ['school-workflow-automation-guide', 'School Workflow Automation: What to Automate First—and What to Keep Reviewed', 'Choose repetitive, rule-based processes while keeping important decisions human.'],
    ['school-operations-dashboard-guide', 'School Operations Dashboard: Metrics That Help Leaders Act', 'Focus dashboard reviews on exceptions, workload and progress rather than vanity numbers.'],
    ['school-records-retention-guide', 'School Records Retention: A Practical Guide to Organising Digital Information', 'Set ownership, access and review routines for important operational records.'],
    ['school-erp-change-management', 'School ERP Change Management: How to Bring Staff Along with a New System', 'Handle communication, training and feedback during a technology change.']]],
  ['lms', 'Learning and classroom', [
    ['school-lms-implementation-guide', 'School LMS Implementation Guide: From Content Setup to Classroom Adoption', 'Plan courses, users, teacher support and parent expectations for a successful LMS launch.'],
    ['digital-homework-management-schools', 'Digital Homework Management: Clear Assignments, Better Follow-Up', 'Create an assignment workflow that gives students and families clarity.'],
    ['teacher-resource-sharing-guide', 'Teacher Resource Sharing: Build a Useful Digital Library for Your School', 'Organise lesson resources so teachers can find, reuse and improve them.'],
    ['student-assignment-submission-guide', 'Student Assignment Submission: Make Expectations and Feedback Clear', 'Set deadlines, submission rules and review routines that work for students and staff.'],
    ['blended-learning-school-guide', 'Blended Learning for Schools: A Practical Operations Guide', 'Balance classroom instruction and digital learning without creating duplicate work.'],
    ['online-classroom-engagement-guide', 'Online Classroom Engagement: Routines That Keep Students Participating', 'Use structured activities, checkpoints and feedback to make digital lessons active.'],
    ['school-digital-content-governance', 'School Digital Content Governance: Ownership, Quality and Access', 'Set standards for course material, permissions and review across academic teams.'],
    ['learning-analytics-for-schools', 'Learning Analytics for Schools: Questions Worth Asking of Your Data', 'Use learning data to identify support needs while avoiding premature conclusions.'],
    ['teacher-lms-training-checklist', 'Teacher LMS Training Checklist: The Essential Skills Before Term Starts', 'Prepare teachers to publish content, manage learners and respond to questions.'],
    ['school-scorm-content-guide', 'SCORM Content for Schools: What Administrators Should Know', 'Understand packaging, compatibility and practical checks before uploading digital courses.']]],
  ['transport', 'Transport and student services', [
    ['school-transport-management-guide', 'School Transport Management: Routes, Students and Daily Visibility', 'A practical guide to managing routes and communication around student transport.'],
    ['school-bus-route-planning', 'School Bus Route Planning: Balancing Safety, Time and Capacity', 'Plan routes with clear stops, ownership and review points.'],
    ['student-transport-attendance', 'Student Transport Attendance: Why Boarding Records Matter', 'Use simple boarding and drop-off records to improve visibility and follow-up.'],
    ['school-library-management-guide', 'School Library Management: Books, Issues and Student Access', 'Create reliable cataloguing, issue and return routines for a more useful library.'],
    ['library-overdue-book-process', 'Library Overdue Book Process: Friendly Reminders and Better Records', 'Keep book returns moving without creating unnecessary friction for students.'],
    ['school-hostel-management-guide', 'School Hostel Management: Records, Fees and Student Wellbeing', 'Organise residential information around daily operations and clear responsibility.'],
    ['school-health-records-guide', 'School Health Records: Organise Important Information Responsibly', 'Keep essential information accessible to authorised staff with privacy safeguards.'],
    ['school-event-management-checklist', 'School Event Management Checklist: From Registration to Parent Updates', 'Coordinate participation, permissions, schedules and communications for school events.'],
    ['school-inventory-management-guide', 'School Inventory Management: A Practical System for Everyday Assets', 'Track supplies, ownership and replenishment without relying on informal lists.'],
    ['school-visitor-management-guide', 'School Visitor Management: A Safer, More Organised Front Desk Process', 'Create a consistent record of visitors, purpose and arrival procedures.']]],
  ['leadership', 'Leadership and governance', [
    ['school-principal-dashboard-guide', 'School Principal Dashboard: The Weekly View That Supports Better Decisions', 'A focused way to review attendance, fees, academics and operational exceptions.'],
    ['school-governance-digital-workflows', 'School Governance and Digital Workflows: Building Clear Accountability', 'Use approvals, records and reporting to make responsibilities visible.'],
    ['school-policy-management-guide', 'School Policy Management: Keep Important Rules Accessible and Current', 'Organise policies, ownership, review dates and communication in one process.'],
    ['school-compliance-calendar-india', 'School Compliance Calendar: How Indian Schools Can Plan Reviews Through the Year', 'Create a planning rhythm for documents, audits and operational evidence; confirm local requirements with qualified advisers.'],
    ['school-audit-readiness-guide', 'School Audit Readiness: Organise Records Before They Are Requested', 'Prepare roles, evidence and review routines without a last-minute scramble.'],
    ['school-risk-management-guide', 'School Risk Management: Practical Registers and Review Meetings', 'Identify operational risks, assign owners and track mitigation actions.'],
    ['school-procurement-approval-process', 'School Procurement Approval Process: Clear Requests, Quotes and Records', 'Bring purchasing requests into an accountable, repeatable workflow.'],
    ['school-budget-planning-guide', 'School Budget Planning: Connect Academic Priorities to Operational Decisions', 'Use a structured cycle for forecasts, approvals and in-year reviews.'],
    ['school-staff-performance-review-guide', 'School Staff Performance Reviews: A Practical, Respectful Process', 'Build role expectations, evidence and development conversations into a fair routine.'],
    ['school-board-reporting-guide', 'School Board Reporting: What Leaders Should Summarise Each Term', 'Prepare concise reporting around academic, finance and operational priorities.']]],
  ['security', 'Security and privacy', [
    ['school-data-security-basics', 'School Data Security Basics: Practical Safeguards for Everyday Operations', 'Protect student and staff information with roles, passwords, devices and review routines.'],
    ['student-data-privacy-guide-india', 'Student Data Privacy Guide for Indian Schools: Practical Questions to Ask', 'A plain-language guide to minimising access, documenting purpose and seeking qualified legal advice where needed.'],
    ['school-password-policy-guide', 'School Password Policy: Simple Rules Staff Can Actually Follow', 'Create a realistic policy around account ownership, resets and secure access.'],
    ['school-erp-backup-and-recovery', 'School ERP Backup and Recovery: Questions Every Administrator Should Ask', 'Understand backups, recovery steps, responsibilities and evidence before an incident.'],
    ['school-cybersecurity-awareness', 'Cybersecurity Awareness for School Staff: Habits That Reduce Risk', 'Build awareness around phishing, device use, shared accounts and reporting.'],
    ['school-data-access-review', 'School Data Access Reviews: How to Keep Permissions Current', 'Review access when staff join, change roles or leave the school.'],
    ['school-incident-response-plan', 'School Incident Response Plan: What to Do When a Digital Issue Is Reported', 'Set a calm, documented process for containment, communication and recovery.'],
    ['secure-parent-portal-guide', 'Secure Parent Portal: What Families and Schools Both Need', 'Balance easy access with sensible account security and communication.'],
    ['school-device-management-guide', 'School Device Management: A Practical Guide for Shared and Staff Devices', 'Set clear ownership, updates and return procedures for school technology.'],
    ['school-data-sharing-policy', 'School Data Sharing Policy: Make External Requests Easier to Assess', 'Document purpose, minimum data, approvals and review before sharing information.']]],
  ['ai', 'AI and digital transformation', [
    ['ai-for-school-administration-guide', 'AI for School Administration: Useful Starting Points and Responsible Boundaries', 'Identify low-risk administrative use cases while keeping final judgment with staff.'],
    ['school-ai-chatbot-guide', 'School AI Chatbots: Questions to Ask Before You Put One in Front of Parents', 'Assess scope, information quality, escalation and privacy before launch.'],
    ['ai-assisted-school-communication', 'AI-Assisted School Communication: Faster Drafts, Human Review', 'Use AI to support writing without losing accuracy, tone or accountability.'],
    ['school-automation-roi-guide', 'School Automation ROI: How to Measure Time Saved Without Overclaiming', 'Define baselines, process outcomes and adoption measures for digital projects.'],
    ['digital-transformation-roadmap-schools', 'Digital Transformation Roadmap for Schools: A Practical Sequence', 'Move from priority workflows to sustainable adoption without trying to change everything at once.'],
    ['ai-data-governance-schools', 'AI Data Governance for Schools: Questions to Answer Before Using New Tools', 'Clarify data, access, review and vendor responsibilities before adopting AI.'],
    ['school-technology-vendor-evaluation', 'School Technology Vendor Evaluation: A Better Demo and Decision Process', 'Compare workflows, support, implementation and controls—not just feature lists.'],
    ['school-erp-ai-features-guide', 'AI Features in School ERP: What Is Helpful, What Needs Oversight', 'Evaluate summaries, search and support features through real staff workflows.'],
    ['responsible-ai-school-policy', 'Responsible AI Policy for Schools: A Starting Framework for Staff Use', 'Set practical expectations for approved use, verification and student data.'],
    ['future-ready-school-operations', 'Future-Ready School Operations: Build Systems That Can Improve Over Time', 'Create clean data, clear workflows and staff confidence before adding more tools.']]],
  ['selection', 'Buying and implementation', [
    ['school-erp-vendor-demo-checklist', 'School ERP Vendor Demo Checklist: What to Test Before You Buy', 'Bring real school scenarios to a demo and assess what staff will do day to day.'],
    ['school-management-software-pricing-guide', 'School Management Software Pricing: How to Compare Value, Scope and Support', 'Look beyond headline price to implementation, user access, training and ongoing costs.'],
    ['questions-before-choosing-school-erp', 'Questions to Ask Before Choosing School ERP Software', 'A structured question list for principals, owners, accounts teams and IT leads.'],
    ['school-erp-contract-review-checklist', 'School ERP Contract Review Checklist: Practical Items to Clarify', 'Identify service, support, data and renewal questions to review with appropriate advisers.'],
    ['school-erp-pilot-program-guide', 'School ERP Pilot Program: How to Test a New System Before Full Rollout', 'Choose a manageable scope, set success criteria and learn before wider launch.'],
    ['school-erp-onboarding-checklist', 'School ERP Onboarding Checklist: A Better First 90 Days', 'Sequence data setup, role configuration, training and live support.'],
    ['school-erp-support-model-guide', 'School ERP Support Model: What Schools Should Expect After Go-Live', 'Define escalation, response, training refreshers and operational ownership.'],
    ['school-erp-integration-questions', 'School ERP Integrations: Questions to Ask About Data Flow and Ownership', 'Assess integration needs without assuming every connection solves an operational problem.'],
    ['school-erp-migration-timeline', 'School ERP Migration Timeline: How to Plan a Safer Changeover', 'Build a timeline around data, training, testing and an appropriate cutover period.'],
    ['school-erp-success-metrics', 'School ERP Success Metrics: How to Know the System Is Helping', 'Measure adoption, turnaround time, data quality and outcomes after implementation.']]],
];

const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const today = '2026-10-09';
const related = (slug, group) => clusters.find(([key]) => key === group)[2].filter(([other]) => other !== slug).slice(0, 3);

function article(group, category, [slug, title, description]) {
  const url = `https://schoolment.com/blog/${slug}/`;
  const firstWord = title.replace(/:.*/, '');
  const relatedLinks = related(slug, group).map(([otherSlug, otherTitle]) => `<li><a href="/blog/${otherSlug}/">${esc(otherTitle)}</a></li>`).join('');
  const toc = [
    ['introduction', 'Introduction'], ['why-it-matters', `Why ${firstWord.toLowerCase()} matters`], ['workflow', 'A practical workflow'], ['roles', 'Roles and accountability'], ['implementation', 'Implementation checklist'], ['questions', 'Questions to review'], ['next-steps', 'Next steps']
  ].map(([id, label]) => `<li><a href="#${id}">${esc(label)}</a></li>`).join('');
  const body = `
      <article class="policy-content blog-policy-content">
        <div class="policy-block"><h2 id="introduction">Introduction</h2><p>${esc(description)} Schools get better results when the work is designed around the people who use it every day: office staff, teachers, leaders, students and families. The aim is not to introduce another task list; it is to make the next action clear and the record dependable.</p><p>This guide gives a practical starting point. It is written for Indian school teams, but each school should adapt the detail to its own board requirements, policies, staffing model and parent community.</p></div>
        <div class="policy-block"><h2 id="why-it-matters">Why ${esc(firstWord.toLowerCase())} matters</h2><p>Small operational gaps become visible quickly in a school. A missing document, an unclear owner or a delayed parent update can create repeated phone calls and uncertainty for students. A documented process makes the expected action visible, reduces reliance on memory and gives leaders a way to review exceptions before they grow.</p><p>Technology is most useful when it supports that discipline. The system should hold the current record, show what is incomplete, protect appropriate access and make it easy to find the next step. It should not ask staff to duplicate the same information across notebooks, spreadsheets and messaging groups.</p></div>
        <div class="policy-block"><h2 id="workflow">A practical workflow</h2><p>Start by mapping the workflow exactly as it happens today. Identify the trigger, the information required, the person responsible, the decision points and the final record. Then remove steps that only exist because information is hard to find. Keep the checks that protect students, families and the school.</p><ol><li><strong>Define the trigger.</strong> Agree on what starts the process and what information must be available.</li><li><strong>Assign an owner.</strong> One person or role should be accountable for the next action, even when several people contribute.</li><li><strong>Record the outcome.</strong> Capture the decision, date and supporting information in the system of record.</li><li><strong>Communicate the next step.</strong> Give the relevant student, parent or colleague a clear, timely update.</li><li><strong>Review exceptions.</strong> Look at incomplete, delayed or unusual cases on a regular rhythm.</li></ol><p>A short pilot with one class, team or fee head is safer than changing every workflow on the same day. Use the pilot to test real cases, including the exceptions that are usually handled informally.</p></div>
        <div class="policy-block"><h2 id="roles">Roles and accountability</h2><p>Roles should follow responsibility, not job title alone. A teacher may enter classroom information, an administrator may verify records, a finance or academic lead may approve an exception, and a principal may review the dashboard. Each role needs enough access to complete its work, but not more information than necessary.</p><p>Write down who owns routine review, who can correct an error and who can approve a change to the rule itself. That makes handovers smoother during leave, admissions season and staff changes. It also creates a better basis for training new team members.</p></div>
        <div class="policy-block"><h2 id="implementation">Implementation checklist</h2><ul class="check-list"><li>Document the current process and agree on the desired outcome.</li><li>Confirm the fields, documents and status values that staff need.</li><li>Assign owners for entry, verification, approval and exception handling.</li><li>Set realistic response times and review points.</li><li>Train users with examples from their real daily work.</li><li>Run a small pilot and correct unclear steps before wider rollout.</li><li>Review the first month of results with the people doing the work.</li></ul></div>
        <div class="policy-block"><h2 id="questions">Questions to review before you change the process</h2><p>What must never be missed? Which decisions need approval? What information do families need, and when? Which records are sensitive? Where do staff currently spend time looking for answers? The answers should shape the workflow more than any generic feature list.</p><p>Schools should also check their own policy and applicable regulatory requirements before relying on a new digital process. This guide is operational information, not legal, financial or compliance advice.</p></div>
        <div class="policy-block"><h2 id="next-steps">Next steps</h2><p>Choose one workflow to improve first, define a clear owner and test it with real cases. A well-run small change builds staff confidence and produces evidence for the next improvement. Schoolment can demonstrate how its modules support ${esc(category.toLowerCase())} workflows in a live school context.</p><h3>Related guides</h3><ul>${relatedLinks}</ul><p><a href="/#contact">Book a Schoolment demo</a> to walk through your school’s current process with the team.</p></div>
      </article>`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark"><head><meta charset="UTF-8" /><script>try { document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') === 'light' ? 'light' : 'dark'); } catch (_) {}</script><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} | Schoolment Blog</title><meta name="description" content="${esc(description)}" /><meta name="robots" content="index, follow" /><link rel="canonical" href="${url}" /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" /><link rel="stylesheet" href="/styles.css?v=content-depth-43" /><script src="/analytics.js?v=2" defer></script>${favicon}
<meta property="og:type" content="article" /><meta property="og:site_name" content="Schoolment" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="https://schoolment.com/og-image.png" /><meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:title,description,datePublished:today,dateModified:today,author:{'@type':'Organization',name:'Schoolment'},publisher:{'@type':'Organization',name:'Schoolment',url:'https://schoolment.com/'},mainEntityOfPage:url})}</script></head><body>
${header}<main><div class="container"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/blog/">Blog</a><span aria-hidden="true">/</span><span aria-current="page">${esc(title)}</span></nav></div><section class="section module-hero" style="padding-bottom:1.5rem;"><div class="container"><span class="eyebrow">${esc(category)}</span><h1>${esc(title)}</h1><p class="lede">${esc(description)}</p><p class="post-date">Published 9 October 2026 <span class="article-meta-separator" aria-hidden="true">&middot;</span> 7 min read</p></div></section><section class="section article-section" aria-label="Article" style="padding-top:1rem;"><div class="container article-layout"><aside class="article-sidebar"><details class="article-toc" open><summary>On this page</summary><nav aria-label="Article contents"><ol>${toc}</ol></nav></details></aside>${body}</div></section></main>${footer}</body></html>`;
}

const records = clusters.flatMap(([group, category, items]) => items.map((item) => ({ group, category, item })));

// Render in memory for review. Importing this module must never publish files.
export function buildCandidates() {
  return records.map(({ group, category, item }) => ({
    slug: item[0],
    source: 'candidate',
    html: article(group, category, item),
  }));
}

function writeLibrary() {
for (const { group, category, item } of records) {
  const [slug] = item;
  const destination = path.join(blogRoot, slug);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'index.html'), article(group, category, item));
}

const sitemapPath = path.join(landing, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
const closing = '</urlset>';
const additions = records.map(({ item: [slug] }) => `  <url>\n    <loc>https://schoolment.com/blog/${slug}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n');
for (const { item: [slug] } of records) {
  const pattern = new RegExp(`\\s*<url>\\s*<loc>https://schoolment\\.com/blog/${slug}/</loc>[\\s\\S]*?</url>`, 'g');
  sitemap = sitemap.replace(pattern, '');
}
sitemap = sitemap.replace(closing, `${additions}\n${closing}`);
fs.writeFileSync(sitemapPath, sitemap);

const libraryPath = path.join(blogRoot, 'index.html');
let library = fs.readFileSync(libraryPath, 'utf8');
const marker = '<!-- GENERATED LIBRARY START -->';
const endMarker = '<!-- GENERATED LIBRARY END -->';
const cards = records.map(({ category, item: [slug, title, description] }) => `<a class="blog-card" href="/blog/${slug}/"><span class="eyebrow">${category}</span><h3>${esc(title)}</h3><p>${esc(description)}</p><span class="featured-article-link">Read guide <span aria-hidden="true">→</span></span></a>`).join('\n');
const block = `${marker}<section class="section" id="school-operations-library"><div class="container"><div class="section-head blog-section-head"><span class="eyebrow">Operations library</span><h2>Practical guides for every school workflow</h2><p>Explore 120 detailed guides for school leaders, administrators, accounts teams and teachers.</p></div><div class="blog-grid">${cards}</div></div></section>${endMarker}`;
const generated = new RegExp(`${marker}[\\s\\S]*?${endMarker}`);
library = generated.test(library) ? library.replace(generated, block) : library.replace('</main>', `${block}\n  </main>`);
fs.writeFileSync(libraryPath, library);

console.log(`Created ${records.length} article pages, updated sitemap and blog library.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--check', '--write'].includes(arg)) || args.length > 1) {
    throw new Error('Usage: node landing-page/scripts/generate-blog-library.mjs [--check|--write]');
  }
  const report = auditDocuments([...readExistingBlogs(blogRoot), ...buildCandidates()]);
  console.log(JSON.stringify(summarizeAudit(report), null, 2));
  if (report.blockers.length) {
    console.error('Content validation failed. No article, blog index or sitemap files were written.');
    process.exitCode = 1;
  } else if (args.includes('--write')) {
    writeLibrary();
  } else {
    console.log('Validation only. No files were written.');
  }
}
