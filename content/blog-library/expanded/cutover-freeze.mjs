export default [
  ['Introduction', `Moving a school workflow to another system involves a moment when responsibility changes. Before that point, staff may still be updating the old records. Afterwards, the new process needs a dependable starting position. A cutover freeze defines how changes are controlled during that transition so the school does not lose track of work entered in the gap.

A freeze does not necessarily mean that the whole school stops operating. It means that the affected activities, authoritative records and exception routes are explicitly defined for a limited period. Reception may continue answering questions while a particular data-entry process pauses or uses an approved temporary record.

This guide is an operational planning framework, not a technical migration procedure. The examples are fictional. The school and its implementation team must agree on the actual scope, access arrangements and recovery options before changing a live system. A calendar entry alone is not evidence that a transition is ready.`],
  ['Define exactly which work is changing', `Name the workflows included in the cutover. A student-record migration may not involve fee collection, while a fee-system change may depend on current student identities. The plan should identify these boundaries instead of describing everything as “the ERP move”.

For each included workflow, state what the old system will stop accepting and what the new system will begin accepting. Distinguish viewing historical information from creating or correcting current records. Staff may still need to consult history even when new entry moves elsewhere.

Identify excluded work as well. If attendance continues in its current process, say so. Clear exclusions prevent staff from unnecessarily pausing unrelated tasks or trying to enter them into a system that is not ready for that purpose. The cutover scope should match the implementation team's tested plan and the school's operational responsibilities.`],
  ['Choose the authoritative record for every phase', `During preparation, the old process may remain authoritative. During a controlled freeze, an approved exception log may capture necessary changes. After acceptance, the new process becomes authoritative for the defined work. Write these phases explicitly so staff know where to enter and verify information at each point.

Avoid telling staff to “update both for safety” without a designed reconciliation procedure. Two independently maintained records can diverge quickly, leaving the school unsure which one reflects the latest approved decision. If parallel operation is part of the actual plan, specify which copy governs decisions and how differences are resolved.

The authority decision should cover corrections as well as new entries. A staff member may discover an incorrect contact during the freeze. The plan needs to say where that correction is recorded and who carries it into the accepted starting data. Otherwise even a small update can disappear between versions.`],
  ['Select a window using real operational dependencies', `Consider the school's scheduled work when proposing the freeze period. A window that overlaps a fee deadline, result release or admission event may create avoidable pressure. Review the affected teams' calendars rather than assuming that a technically convenient time is operationally quiet.

Estimate the activities that must fit inside the window: stopping defined entry, confirming the starting dataset, completing the technical work, checking results and communicating the decision. The implementation team should explain its timing assumptions. Do not treat a best-case estimate as a guaranteed reopening time.

Allow a clear decision point before staff are expected to resume the affected work. If verification takes longer, the school needs a communicated extension or alternative plan. The pressure to meet a published time should not lead to accepting records that have not passed the agreed checks.`],
  ['Assign decisions as well as tasks', `A cutover plan needs more than a list of people performing technical steps. Identify who may start the freeze, accept the migrated records, approve an extension and decide whether the planned transition should stop. These decisions can have different owners from the people running the transfer.

Name a school-side coordinator who gathers readiness confirmations and communicates the current state. Department owners should remain responsible for the meaning of their records. Accounts verifies fee-related outcomes; academic or administrative staff verify the relevant student and class information.

Provide a cover arrangement if a decision-maker becomes unavailable. A transition should not depend on an informal assumption that somebody will answer a message late in the evening. Record the escalation route and the limits of delegated authority before the window starts, while there is still time to resolve uncertainty.`],
  ['Prepare staff instructions that describe allowed actions', `Tell affected staff what they may view, enter and change during each phase. “System maintenance tonight” is not enough if someone still needs to record an urgent admission or answer a balance query. Use task-based instructions that connect the freeze to ordinary work.

Explain the temporary route for necessary activity. If a controlled exception log is used, identify its owner, access rules and required fields. Staff should not create private workarounds simply because the normal entry screen is unavailable or restricted.

State where status updates will appear and who can confirm that normal work may resume. Ask team leads to acknowledge the instructions, especially where staff work different shifts. A message sent to one group does not establish that every affected user understands the change in record authority.`],
  ['Design the exception log before the freeze begins', `An exception log captures authorised work that must occur while ordinary entry is paused. Define the minimum information needed to carry the event forward: a stable reference, the requested change, its time, the responsible person and any required approval. Keep the log in the school's authorised location.

Distinguish requests from completed actions. A parent reporting a new phone number may create a correction request that still needs verification. The log should not automatically turn every reported change into an accepted master-record update.

Give each exception a final disposition after cutover. It may be entered into the new process, confirmed as already included or rejected with an explanation. Do not discard the log merely because the new system opens successfully. The transition is incomplete while events captured during the freeze have no verified destination.`],
  ['Confirm the last accepted source version', `Before the technical transfer, identify the source version or export accepted for use. Record its scope and timing, including any agreed filters or exclusions. The school should be able to distinguish this starting point from an earlier trial file.

Ask the responsible team how changes after that point will be handled. They may be included through a supported final update process or recorded as controlled exceptions. The correct approach depends on the implementation; staff should not assume that a late edit will automatically appear in the destination.

Keep the source acceptance evidence with the cutover record. If a later discrepancy appears, the team needs to know whether the value was present in the accepted source, changed during the freeze or transformed during transfer. A clear starting version makes that investigation possible without relying on memory.`],
  ['Use a readiness review before starting the window', `Hold a concise readiness review with the people who own the affected work. Confirm that the agreed source is available, staff instructions have been acknowledged, exception handling is ready and the acceptance checks are understood. Record unresolved items rather than treating the meeting itself as approval.

Ask each owner to state whether their part is ready and what would prevent a safe start. A missing review account or unavailable decision-maker can be as significant as an incomplete technical step. The checklist should cover operational verification, not just transfer mechanics.

If a necessary condition is not met, use the agreed decision route to postpone or revise the plan. Do not begin simply because the scheduled time has arrived. The purpose of readiness review is to make a considered start decision, including the possibility that the current plan is not ready.`],
  ['Worked example: a student-record cutover over a weekend', `In a fictional school, current student and class records will move to a new administrative process over a weekend. Attendance and fee entry are outside this cutover's scope. Staff are told when student-record changes must stop and where verified late corrections should be recorded temporarily.

The school accepts a defined source version on Friday. During the freeze, a family submits a contact correction through the normal office channel. The responsible staff member records it as an exception awaiting the usual verification, rather than editing an untracked local copy or assuming the transfer team will notice the message.

On Sunday the department owners inspect the agreed sample and reconcile the relevant counts. The coordinator records the acceptance decision and tells staff when the new process becomes authoritative. The contact exception is then verified and entered through that process, with its disposition recorded. Opening the new application was one milestone; resolving work captured during the transition was another.`],
  ['Verify records before announcing normal operation', `Acceptance checks should be defined before the freeze, not invented after staff are waiting to resume. Include the population counts, relationships and representative cases relevant to the affected workflow. The reviewer needs to know what evidence would justify acceptance and what finding requires investigation.

Do not rely solely on a successful technical completion message. The school-side owners should verify that the resulting records mean what the operational process expects. A student may appear in the destination while a class relationship or important status is incorrect.

Record the checks performed and their outcomes. If acceptance is conditional, explain the condition and whether affected work may proceed. Avoid a broad announcement that everything is ready while a department has unresolved questions about records essential to its normal tasks.`],
  ['Plan the response to an extended freeze', `If the work or verification takes longer than expected, communicate the current state through the agreed channel. Staff need to know which instructions still apply, which tasks may proceed and when the next decision update is expected. Silence encourages improvised entry into the wrong place.

Review the operational effect of the extension with the affected owners. A temporary process that was manageable for a few hours may need additional supervision if it continues into a busy school day. Keep exception ownership and reconciliation capacity visible as the queue grows.

Do not shorten verification simply to remove the inconvenience of the freeze. Use the pre-agreed decision authority to choose an extension, a revised scope or another supported option. The decision should state its implications, not merely announce that the system will be available “soon”.`],
  ['Treat recovery options as plans that must be demonstrated', `A statement that the team can “roll back if needed” is incomplete unless the actual procedure, decision point and data consequences are understood. Ask the implementation team to explain the supported recovery option and the conditions under which it remains available.

Pay particular attention to new work created after the transition starts. Returning to an earlier state may require a separate treatment of those events. The school needs to know how they will be preserved and reconciled; it should not assume that reversing a technical change automatically preserves every operational update.

This guide does not prescribe a rollback command or guarantee that recovery is possible in every setup. The appropriate plan must come from the people responsible for the specific systems. Record what was tested, what remains uncertain and who may authorise the action if the agreed conditions arise.`],
  ['Reconcile the temporary work after acceptance', `Once the new process is accepted, review every item in the exception log. Assign entry or verification to the responsible team and record the final destination. Check whether an item was already included through a supported update before creating it again.

Use stable references to avoid duplicate entry. A late admission request or contact correction may have reached the office through more than one channel during the freeze. Resolve the relationship between those reports rather than treating each message as a separate approved event.

Keep the reconciliation open until all exceptions have a documented outcome or a named continuing owner. The school should be able to explain which work remains unresolved after the technical transition. A clean cutover report includes that residual work instead of hiding it behind the date the new system went live.`],
  ['Review the first operating day without changing everything at once', `The first day after cutover is a useful time to collect specific observations from affected staff. Ask whether they can complete the tasks included in scope and whether any records require review. Separate a genuine data discrepancy from a training question or a new feature request.

Route issues through a coordinated process so staff do not independently correct the same record in different ways. Preserve evidence of the starting state and any approved changes. If a discrepancy suggests a wider problem, the responsible owners should decide the review scope before broad corrections are attempted.

Avoid making unrelated configuration changes during this early review unless they are necessary and approved. Changing several variables at once can make it harder to understand whether an issue came from the transfer, the original data or a later adjustment. Stabilise the agreed workflow before expanding it.`],
  ['A clear completion record for the school', `The cutover completion record should identify the scope, accepted source, key decisions, checks performed and time the new process became authoritative. Include the disposition of temporary exceptions and any continuing issues with named owners. This is more useful than a celebratory message with no operational detail.

Keep the staff instructions and acceptance evidence accessible to the authorised people who may need them later. If a historical question arises, the school should be able to locate the transition boundary and explain where a record was maintained at that time.

When planning a Schoolment implementation, discuss this sequence with the actual delivery team and confirm responsibilities in your agreed scope. The objective of a cutover freeze is not a perfect-looking timetable. It is a controlled transfer of record ownership that lets school staff resume work knowing which information to trust and how unfinished events will be handled.`],
];
