# Blog and school-workflow alignment

The expanded blogs now distinguish product capabilities from recommended school procedures. The web app adds Reviews & Approvals and connects the family portal to published results, verified checkout, payment-report status and acknowledged notices. See [the feature audit](BLOG_FEATURE_AUDIT.md) for the full scope and remaining limitations.

## Before running an existing installation

Use the installation's normal database backup process. With the existing tenant environment configured, apply the migration before restarting the updated backend:

```sh
cd backend
python manage_migrations.py upgrade head
```

The new tenant-schema head is `b019aa202609`. Run the command for the actual installation environment; do not stamp over unapplied migrations. Fresh databases are created from the models. Keep `EVIDENCE_ARCHIVE_DIR` (default `uploads_private/evidence`) on persistent private storage outside the public uploads mount, and include it in the deployment's backup process.

This work does not apply migrations to a production database or deploy the application.

## Changes staff will see

1. Open **Reports & Administration → Reviews & Approvals**. Available sections depend on the built-in staff role.
2. In **Results**, select the student and exam, enter a reason and prepare a draft. Preview and review it; Admin/Principal publishes it. Existing saved marks are not automatically published. Releasing a correction creates another version.
3. In **Marks**, select Scored, Absent or Exempt. Absent counts as zero; Exempt is excluded from totals. Confirm that this policy matches the school's assessment rules.
4. In **Payments**, inspect reported UPI references or create an exception case. Assign an owner and due date, then record bank-verification evidence before approval. A refund case records a refund completed outside Schoolment; approval itself sends no money. Existing authorised manual fee entry remains available.
5. In **Settlements**, import UTF-8 CSV columns `reference,gross_amount,charges,net_amount,settlement_date`. Dates use `YYYY-MM-DD`. One payment reference belongs on each row. Import matches existing verified payments without changing their balances.
6. In **Attendance → Mark by Class**, period 0 is daily attendance. Use periods 1–30 for lessons. After saving every student's status, submit in **Registers**. Corrections reopen the register. Absence notices are optional and remain in the linked family's portal.
7. In **Homework → Submissions**, save draft grades, publish them, or return work with feedback. Returning work reopens submission even after the original deadline. Publication/return requires feedback or a review note.
8. In **Versions**, capture and approve timetable, evidence or dated passenger-list snapshots. Configure both the effective date and any end date carefully: once timetable versioning is used, dates without an applicable approved version return no published timetable. Assign substitute cover through the existing Staff Leave workflow.
9. In **Admissions**, finish onboarding after enquiry conversion using an existing Parent account. Select the applicable fee structure; repeat for another structure if needed. Document review records Received, Reviewed or Needs clarification.
10. In **History**, choose a listed record type and its ID to see retained values and the actor. History begins with this release and covers authenticated operational record changes; it is not retroactive or a universal database audit.

Teacher logins must match the Teacher staff email and have a class assigned through the teacher/class, class-subject or timetable records. A Teacher with no matching assignment sees no core assigned-class records. Review custom roles and optional modules separately.

## Validation

- The existing full backend suite plus the initial workflow acceptance tests passed: 833 tests at that stage. Additional evidence/document/refund/transport regression checks were then added and checked separately.
- The frontend production build passed. New workflow components pass ESLint. The repository's older pages still have existing lint findings, including effect-state and unused-variable rules; this is not a claim that the repository-wide lint command is clean.
- An isolated populated SQLite database was migrated from `af965fbca069` to the new head, downgraded and upgraded again; the pre-existing student record survived. No live database was used.
- API acceptance checks cover unpublished-result privacy, retained result versions and PDF downloads, teacher class restrictions, pending UPI approval and repeated decisions, statement import idempotency, register reopening, period/daily separation, guardian acknowledgement, onboarding idempotency and evidence preservation.
- Browser automation was unavailable in this session. Screens were built and API connections checked in source/tests, but visual browser acceptance remains outstanding. Live Razorpay checkout, bank/provider refunds, hardware, external-message delivery and PostgreSQL concurrency were not exercised.

## Remaining operating procedures

Complex scheduling constraints, automatic transport billing/handover, provider settlement batches, complete migration exports, offsite recovery drills, board filings and support guarantees are not supplied by these changes. Blog checklists explicitly remain procedures or evaluation questions where the application does not perform the step.
