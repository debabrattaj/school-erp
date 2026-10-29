import supportEvidence from './expanded/support-evidence.mjs';
import exportAcceptance from './expanded/export-acceptance.mjs';
import integrationReconciliation from './expanded/integration-reconciliation.mjs';
import cutoverFreeze from './expanded/cutover-freeze.mjs';
import migrationCounts from './expanded/migration-counts.mjs';
import renewalScope from './expanded/renewal-scope.mjs';
import releaseNoteReview from './expanded/release-note-review.mjs';
import serviceHandover from './expanded/service-handover.mjs';
import accessibilityTaskReview from './expanded/accessibility-task-review.mjs';

export default [
  {
    slug: 'school-erp-support-ticket-evidence-pack',
    title: 'School ERP Support Tickets: Build an Evidence Pack That Explains the Failure',
    description: 'Prepare a useful school software support request with a clear task, reproducible steps, safe evidence and a verified outcome.',
    sections: supportEvidence,
  },
  {
    slug: 'school-software-export-acceptance-check',
    title: 'School Data Exports: Check Scope, Relationships and Meaning Before Acceptance',
    description: 'Validate a school software export using population counts, field definitions, representative records and clear handling responsibilities.',
    sections: exportAcceptance,
  },
  {
    slug: 'school-erp-integration-failure-reconciliation',
    title: 'School Integration Failures: Reconcile the Outcome Before Repeating the Action',
    description: 'Handle uncertain integration outcomes with matched references, approved recovery and record-level verification before closing exceptions.',
    sources: [['Stripe: idempotent requests', 'https://docs.stripe.com/api/idempotent_requests']],
    sections: integrationReconciliation,
  },
  {
    slug: 'school-system-cutover-freeze-plan',
    title: 'School System Cutover: Control New Entries During a Migration Freeze',
    description: 'Plan a school-system transition with explicit record authority, temporary exceptions, acceptance checks and a clear reopening decision.',
    sections: cutoverFreeze,
  },
  {
    slug: 'school-data-migration-count-reconciliation',
    title: 'School Data Migration Counts: Account for Accepted, Excluded and Rejected Records',
    description: 'Reconcile school migration populations with defined count units, approved exclusions, linked reruns and traceable exception outcomes.',
    sections: migrationCounts,
  },
  {
    slug: 'school-erp-renewal-scope-review',
    title: 'School ERP Renewal Review: Compare Agreed Scope With the Work Your School Uses',
    description: 'Prepare an operational renewal inventory covering enabled workflows, user populations, service dependencies and unresolved requirements.',
    sections: renewalScope,
  },
  {
    slug: 'school-software-release-note-triage',
    title: 'School Software Release Notes: Turn Relevant Changes Into Verified Staff Instructions',
    description: 'Review software announcements by affected school task, confirm applicability and update instructions using proportionate verification.',
    sections: releaseNoteReview,
  },
  {
    slug: 'school-erp-service-handover-directory',
    title: 'School Software Service Handovers: Record Owners, Support Routes and Open Work',
    description: 'Build a service directory that preserves school software ownership and support continuity without distributing credentials.',
    sections: serviceHandover,
  },
  {
    slug: 'school-software-accessibility-task-review',
    title: 'School Portal Accessibility: Organise a First Review Around Real User Tasks',
    description: 'Plan a bounded accessibility task review with safe practice records, useful observations and qualified follow-up without claiming certification.',
    sources: [
      ['W3C WAI: Easy Checks — a first review', 'https://www.w3.org/WAI/test-evaluate/preliminary/'],
      ['W3C WAI: labeling form controls', 'https://www.w3.org/WAI/tutorials/forms/labels/'],
      ['W3C WAI: form user notifications', 'https://www.w3.org/WAI/tutorials/forms/notifications/'],
    ],
    sections: accessibilityTaskReview,
  },
];
