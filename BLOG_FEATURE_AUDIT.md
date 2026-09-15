# Blog claims and workflow audit ? 11 September 2026

The 30 expanded blog articles now label their checklists and examples as recommended procedures. This release also adds the web workflows below. It does not turn every operational recommendation or service promise into an automated product feature.

The initial source audit reviewed `d216df329f31f4acd6d6acb4b961c1150b64abdf`. One correction to that audit: substitute cover already existed under Staff Leave. This release reuses it when resolving the effective timetable.

| Area | Backend evidence | Web interface | Implemented behavior |
|---|---|---|---|
| Teacher class access | [record_controls.py](backend/app/record_controls.py), [security.py](backend/app/security.py) | Existing class/student selectors and scoped API responses | Built-in Teacher accounts are matched by staff email and assigned classes. Core students, attendance, marks, exams, homework and result records are scoped. An unmatched teacher gets no assigned-class records. This is not a claim that every custom role or optional module has the same policy. |
| Result publication | [workflows.py routes](backend/app/routes/workflows.py), [portal.py](backend/app/routes/portal.py) | Reviews & Approvals ? Results; Portal ? Marks | Prepare a draft, review it, then publish as Admin/Principal. Changed source data invalidates a pending review. Published report data is retained as a version; later mark edits do not alter it. Families see published results and versioned PDFs. |
| Assessment exceptions | [marks.py](backend/app/routes/marks.py), [schemas.py](backend/app/schemas.py) | Marks ? Assessment outcome | Scored, Absent and Exempt. Absent contributes zero; Exempt is excluded from totals. Schools must approve this policy; it is not an arbitrary configurable exemption formula. |
| Correction history | [record_controls.py](backend/app/record_controls.py), [workflow_models.py](backend/app/workflow_models.py) | Reviews & Approvals ? History | Retains actor, before/after values and available reason for authenticated ORM changes to the listed operational records after installation. It does not reconstruct historical changes or capture every external database edit/background script. |
| Verified family payments | [payments.py](backend/app/payments.py), [portal.py](backend/app/routes/portal.py) | Portal ? Fees; [checkout.js](frontend/src/utils/checkout.js) | Configured Razorpay checkout validates signed callbacks and captured order/amount/currency. Parent-reported UPI references stay pending until a case is approved. Existing authorised staff fee-entry controls remain available. |
| Payment exceptions | [workflows.py routes](backend/app/routes/workflows.py) | Reviews & Approvals ? Payments | Cases have an owner, next-action date, reference and decision notes. Approved UPI, adjustment, reversal, reassignment and externally completed refund cases update balances; duplicate decisions are rejected. Disputes record an investigation decision. Approving a refund does not send money through a bank/provider. |
| Statement matching | [workflows.py routes](backend/app/routes/workflows.py) | Reviews & Approvals ? Settlements | UTF-8 CSV imports compare payment references, gross/charges/net and dates. Matches are Matched, Unmatched or Amount mismatch. Import is idempotent and does not credit fees. This is payment-reference matching, not a provider settlement-batch ledger or automatic bank feed. |
| Homework review | [homework.py](backend/app/routes/homework.py), [portal.py](backend/app/routes/portal.py) | Homework ? Submissions; Portal ? Homework | Save a draft grade, publish it or return work for resubmission. Draft grades stay hidden from families. Returned work may be resubmitted after the original deadline; previous content remains in correction history. |
| Timetable versions | [workflows.py](backend/app/workflows.py), [leave.py](backend/app/leave.py) | Reviews & Approvals ? Versions; Staff Leave | Dated approved snapshots determine the family timetable once versioning is used. Existing assigned substitute cover is overlaid for the relevant day. This is not a new solver for every room, workload and staff-availability constraint. |
| Transport manifests | [transport.py](backend/app/routes/transport.py), [workflows.py routes](backend/app/routes/workflows.py) | Transport ? Assignments; Reviews & Approvals ? Versions | Assignments record Morning/Afternoon/Both, date overlaps and seat limits. Staff can capture and approve a dated passenger-list snapshot. Approval does not automate driver handovers or transport-fee changes. |
| Admission onboarding | [workflows.py routes](backend/app/routes/workflows.py), [schemas.py](backend/app/schemas.py) | Reviews & Approvals ? Admissions | After enquiry conversion, assign class, create enrolment, link an existing parent account and add selected applicable fees with concessions. Repeating the same onboarding avoids its duplicate fees/links. Document review states are returned through the admissions API. Account creation and identity verification remain separate steps. |
| Attendance registers | [attendance.py](backend/app/routes/attendance.py), [workflows.py routes](backend/app/routes/workflows.py) | Attendance ? Mark by Class; Reviews & Approvals ? Registers | Daily period 0 and lesson periods 1?30; completed-register submission and missing-submission overview. Corrections reopen submitted registers. Portal/report-card/dashboard/device daily calculations exclude lesson records. |
| Family notices | [portal.py](backend/app/routes/portal.py), [workflows.py](backend/app/workflows.py) | Portal ? Notices | Result publication and optional absence notices are linked to the student. Guardians acknowledge notices for their linked child. This is an in-app acknowledgement, not proof of SMS/email/WhatsApp delivery. |
| Evidence preservation | [evidence_archive.py](backend/app/evidence_archive.py), [workflows.py routes](backend/app/routes/workflows.py) | Reviews & Approvals ? Versions | Retains versioned compliance records and copies of same-school uploaded files, with a checksum and private download. External links remain references; they are not fetched or archived. |

Shared web implementation: [Workflows.jsx](frontend/src/pages/Workflows.jsx), [Portal.jsx](frontend/src/pages/Portal.jsx), [FamilyNotices.jsx](frontend/src/components/FamilyNotices.jsx). Database migration: [b019aa202609_school_workflows.py](backend/alembic/versions/b019aa202609_school_workflows.py).

## Boundaries that remain explicit

- Full relational customer exports with every attachment, offsite backup scheduling, production restoration drills and support response-time commitments have not been established by this work. Existing CSV reports and platform backups remain available.
- There is no automated board/accreditation filing or blanket legal-compliance certification.
- Refund execution, bank settlement investigations, transport billing changes, driver handovers and complex scheduling constraints still need the relevant staff/provider process.
- The new approval workspace is a web interface. This release does not add a native-mobile approval workspace.
- Deployment configuration, live provider transactions, PostgreSQL concurrency and real hardware/messaging integrations need environment-specific acceptance. No live payment or external message was sent while testing.

## Coverage of all expanded articles

Every article below includes the guide/procedure distinction. Product-specific capability notes explain the relevant controls where applicable.

| Article | Treatment |
|---|---|
| [back-to-school-checklist-erp-setup](landing-page/blog/back-to-school-checklist-erp-setup/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [best-school-management-system-erp-odisha](landing-page/blog/best-school-management-system-erp-odisha/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [cbse-state-board-compliance-checklist](landing-page/blog/cbse-state-board-compliance-checklist/index.html) | Evidence preservation; authority requirements and filing remain external. |
| [challenges-managing-school-transport](landing-page/blog/challenges-managing-school-transport/index.html) | Dated journey manifests; billing and handovers remain staff procedures. |
| [cloud-vs-on-premise-school-erp](landing-page/blog/cloud-vs-on-premise-school-erp/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [data-privacy-best-practices-student-information-systems](landing-page/blog/data-privacy-best-practices-student-information-systems/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [digital-report-cards-benefits](landing-page/blog/digital-report-cards-benefits/index.html) | Result release, assessment policy and correction guidance. |
| [exam-season-survival-guide-report-cards](landing-page/blog/exam-season-survival-guide-report-cards/index.html) | Result release, assessment policy and correction guidance. |
| [future-of-edtech-ai-school-administration](landing-page/blog/future-of-edtech-ai-school-administration/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [guide-to-online-fee-payment-systems](landing-page/blog/guide-to-online-fee-payment-systems/index.html) | Payment verification and exception guidance; external refunds remain explicit. |
| [how-ai-changed-school-management-systems](landing-page/blog/how-ai-changed-school-management-systems/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [how-biometric-attendance-systems-work](landing-page/blog/how-biometric-attendance-systems-work/index.html) | Attendance procedures; daily and period records remain distinct. |
| [how-schools-reduce-fee-collection-time-with-erp](landing-page/blog/how-schools-reduce-fee-collection-time-with-erp/index.html) | Payment verification and exception guidance; external refunds remain explicit. |
| [how-to-choose-school-erp-software-2026](landing-page/blog/how-to-choose-school-erp-software-2026/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [how-to-compare-school-erp-vendors](landing-page/blog/how-to-compare-school-erp-vendors/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [how-to-evaluate-school-erp-software-india-2026](landing-page/blog/how-to-evaluate-school-erp-software-india-2026/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [manage-admissions-season-efficiently](landing-page/blog/manage-admissions-season-efficiently/index.html) | Onboarding and document review; existing parent account required. |
| [naac-accreditation-digital-records](landing-page/blog/naac-accreditation-digital-records/index.html) | Evidence preservation; authority requirements and filing remain external. |
| [paper-registers-to-digital-erp-transformation](landing-page/blog/paper-registers-to-digital-erp-transformation/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [parent-teacher-communication-apps-engagement](landing-page/blog/parent-teacher-communication-apps-engagement/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [questions-to-ask-before-buying-school-management-system](landing-page/blog/questions-to-ask-before-buying-school-management-system/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [reduce-fee-collection-delays](landing-page/blog/reduce-fee-collection-delays/index.html) | Payment verification and exception guidance; external refunds remain explicit. |
| [school-digitization-2026-trends](landing-page/blog/school-digitization-2026-trends/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [school-erp-vs-learning-management-system](landing-page/blog/school-erp-vs-learning-management-system/index.html) | Learning guidance; homework grades now use draft/publication controls. |
| [school-erp-vs-spreadsheets](landing-page/blog/school-erp-vs-spreadsheets/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [signs-your-school-needs-attendance-system](landing-page/blog/signs-your-school-needs-attendance-system/index.html) | Attendance procedures; daily and period records remain distinct. |
| [simplify-timetable-scheduling-multiple-sections](landing-page/blog/simplify-timetable-scheduling-multiple-sections/index.html) | Timetable versioning and existing cover; advanced constraints require review. |
| [what-does-a-school-erp-do](landing-page/blog/what-does-a-school-erp-do/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |
| [what-does-an-lms-do](landing-page/blog/what-does-an-lms-do/index.html) | Learning guidance; homework grades now use draft/publication controls. |
| [why-indian-schools-moving-to-cloud-based-erp](landing-page/blog/why-indian-schools-moving-to-cloud-based-erp/index.html) | Operational/evaluation advice; no additional service or deployment guarantees. |

See [WORKFLOW_RELEASE_NOTES.md](WORKFLOW_RELEASE_NOTES.md) for migration, usage and validation.
