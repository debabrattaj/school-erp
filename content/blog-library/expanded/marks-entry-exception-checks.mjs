export default [
  ['Introduction', `A blank mark, a zero and an absence are different statements about an assessment. A blank may mean that entry is unfinished. A zero may be a valid assessed score. An absence may require a particular treatment under the school's approved rules. Substituting one for another simply to complete a screen can produce a tidy result that misrepresents what happened.

Marks-entry review should therefore examine meaning as well as permitted numbers. The reviewer needs to know which students and components are expected, which states are allowed and what evidence supports the recorded outcome. A software validation message can help identify some errors, but it cannot establish that an in-range score belongs to the right student.

This guide proposes an exception-checking process for academic staff. Its examples are fictional and do not prescribe a grading policy. Use the school's approved assessment rules and verify the behaviour of the configured system before relying on it for published results.`],
  ['Confirm the assessment setup before entering scores', `Identify the examination, subject, class, academic year and components being entered. Confirm maximum marks and any approved component structure with the academic owner. A correct score entered into the wrong assessment is still an incorrect record.

Check whether the applicable student list reflects the intended assessment population. Recent class transfers, new admissions or approved subject choices may require review. Do not assume that a current class list automatically represents the population that sat an earlier assessment.

Resolve setup questions before treating entry errors individually. If the maximum is wrong for every student, correcting scores one at a time will conceal the underlying configuration problem. Keep the approved setup reference available to the entry and review teams so they are checking against the same definition of the assessment.`],
  ['Define the allowed non-score states', `The academic policy should explain how absence, exemption, not-yet-entered work and other applicable states are represented. Staff need to understand those meanings before they begin entry. A field that accepts only a number does not justify inventing a numerical substitute for a different state.

Ask the responsible administrator or provider how the configured workflow supports the approved distinctions. If a necessary state is not available, record the gap and agree on an authorised procedure. Do not assume that a dash, blank or arbitrary code will be interpreted consistently by calculations and reports.

Give teachers a short example for each allowed state. Include what evidence is needed and who can approve an exception. These examples help prevent different teachers from using the same value to mean different things, which can make later totals and reports difficult to interpret.`],
  ['Keep zero separate from incomplete entry', `A zero should mean what the school's assessment process says it means, not simply that another value is unavailable. If a teacher has assessed a student's work and the valid score is zero, the record should preserve that outcome. If the teacher has not entered the score, the work remains incomplete.

Review any process that fills blanks with zero automatically or through a spreadsheet shortcut. That transformation can erase the distinction between unfinished data and an assessed result. The academic owner should determine whether such behaviour is appropriate for the specific assessment, rather than allowing convenience to decide.

During review, inspect zero scores with the same care as other exceptions. A zero is not automatically an error, but it should be consistent with the source evidence. Equally, an ordinary-looking positive number should not escape review merely because it avoids an exception flag.`],
  ['Treat absence as an academic decision state', `An absence record should follow the school's approved process for that assessment. The marks-entry operator should not independently decide whether absence produces a zero, a separate label, a deferred assessment or another outcome. Those are policy and academic decisions, not formatting choices.

Confirm the evidence and the authorised decision where required. A student's name missing from one working sheet is not necessarily proof of absence. The reviewer may need to consult the appropriate attendance or examination record through the normal process.

Check how the approved absence treatment appears in totals, grades and report cards. A staff entry screen may display a label correctly while a later export interprets the underlying value differently. The end-to-end review should establish that the published result communicates the intended academic state without an unintended numerical substitution.`],
  ['Review exemptions and optional components separately', `An approved exemption or optional subject can change which components are expected. Record the applicable decision and scope so the reviewer knows whether a missing component is a problem or an authorised condition. Avoid treating every student as though the same component set applies automatically.

Check the calculation rule associated with the exception. The academic owner should specify the intended treatment; the entry team should not improvise a denominator or redistribute weights to make a result appear complete. Any illustrative calculation used for training must be distinguished from the school's actual policy.

Inspect the resulting report as well as the entry record. A student should not appear to have failed a component that was formally not required. Conversely, a required component should not disappear from the report merely because it was left blank. These cases need explicit review rather than a general missing-value cleanup.`],
  ['Use range checks to locate candidates for review', `A score outside the permitted range should be investigated against the assessment setup and source record. For an assessment out of 40, a value of 43 is a useful exception signal. It might reflect a typing error, the wrong maximum or entry into the wrong assessment. The flag identifies a problem to investigate, not its cause.

Check lower bounds and decimal rules according to the approved assessment design. Do not assume that every assessment permits the same precision or scoring method. Keep validation rules aligned with the actual assessment rather than copying settings from another examination without review.

After resolving an out-of-range value, confirm whether other records were affected by the same issue. A wrong maximum can produce many exceptions, while a single transposed digit may be local. The correction should address the established cause and preserve the appropriate review history.`],
  ['Compare student identity before comparing marks', `A score can be within range and still belong to another student. Check stable student identifiers and the order of the source records, especially when entering from a spreadsheet or a paper list. Names alone can be ambiguous, and sorting one column independently can disconnect values from their intended rows.

Use the school's approved entry and import procedures rather than relying on visual similarity between two lists. Where a file is used, preserve the original source and review the mapping before submission. If a row is rejected, keep its identity connected to the rejection reason.

Sample ordinary records alongside exceptional values. Select cases from different parts of the list and include similar names where relevant. The purpose is not to declare every in-range score correct after a superficial check; it is to ensure the review can detect identity and alignment errors that numerical validation does not reveal.`],
  ['Worked example: four values that need different actions', `In a fictional assessment marked out of 40, one student has 43 recorded, another has zero, a third has a blank and a fourth is marked absent. The reviewer does not convert all four into zero to produce a complete column.

The value 43 is compared with the source and setup, revealing a typing error. The zero is confirmed as the assessed result. The blank belongs to work whose score has not yet been entered, so it remains an outstanding entry task. The absence is checked against the appropriate record and treated under the approved academic rule.

Each outcome has a different reason and next action. After the corrections and outstanding work are resolved, the reviewer checks the resulting total and report representation. The example shows why completeness must preserve the meaning of the assessment rather than simply ensure that every row contains a number.`],
  ['Maintain an exception register that leads to resolution', `For each flagged record, identify the assessment, student reference, issue, responsible teacher or reviewer and next action. Keep sensitive details in the authorised academic record rather than distributing a full marks list in a general message thread.

Distinguish unresolved questions from confirmed corrections. A reviewer may notice that a component is missing without yet knowing whether it was required. The register should preserve that uncertainty until the responsible person supplies the academic decision or source evidence.

Close an exception with the outcome and relevant approval or correction reference. A note saying “done” does not explain whether the value was corrected, confirmed as valid or treated under an authorised exception. A clear record supports later queries and helps another staff member understand why the final result differs from an earlier working version.`],
  ['Recalculate affected results after a correction', `Changing a component score can affect a total, percentage, grade or report comment depending on the assessment design. After a correction, verify the dependent outputs that the school actually uses. Do not assume that every downstream view refreshed merely because the entry screen saved successfully.

Use a small expected-result calculation where appropriate, based on the approved rules. Keep that calculation separate from a software-generated result so the reviewer can compare them. If the rule itself is unclear, resolve the rule before changing individual student outcomes to fit a preferred answer.

Check the version of any exported or printed report. A corrected system record does not automatically replace a file already downloaded by staff. The release process should identify which outputs need regeneration and how obsolete working copies are kept from being mistaken for the final result.`],
  ['Separate entry completion from review completion', `A teacher finishing data entry and an academic reviewer approving results are different milestones. Record the distinction where the school's workflow separates those responsibilities. A complete column of values may still contain unresolved exceptions or require moderation.

Agree what evidence allows a class or subject to move to the next stage. The condition might include required components entered, flagged records resolved and the source comparison completed. Use the actual approved process rather than treating a percentage-complete indicator as a substitute for review.

If different groups reach readiness at different times, keep their scopes clear. A general message that marks are complete should not imply that every class is approved for release. The person authorising publication needs an accurate view of which result set was reviewed and which work remains outstanding.`],
  ['Protect working records from premature publication', `Before release, confirm what students and families can see through the configured workflow. A staff preview is not evidence that working marks are hidden from every other role. Use authorised test access and the school's supported review process to verify the intended boundary.

Keep any exported working reports clearly distinguishable from the approved version. A teacher may need a preview for review, but that file should not be distributed as a final report. If a preview is shared with an authorised reviewer, state its purpose and status.

Where an unexpected publication occurs, use the school's incident and correction process. Do not silently alter results and assume that no explanation is needed. The response should establish what was visible, what correction is authorised and how affected recipients will receive accurate information.`],
  ['Review imports and bulk entry with a controlled sample', `A bulk process can save repetitive entry, but it can also repeat an error across many records. Before using an import or copied dataset, confirm the assessment mapping, identifiers and permitted value representations. Test an authorised sample containing ordinary scores and the relevant non-score states.

Review accepted and rejected rows separately. An import report showing most rows accepted does not establish that the missing rows are unimportant. Each rejected record needs a disposition, and the accepted sample should still be checked for correct identity and interpretation.

Do not rerun a full file without understanding how the supported process handles existing records. The responsible technical or administrative owner should explain whether the action updates, duplicates or rejects them. Record the run and review outcome so a later investigator can understand how the final marks population was formed.`],
  ['Improve the instructions from recurring exceptions', `After the assessment cycle, review which exceptions occurred repeatedly. If several teachers confuse absence and incomplete entry, improve the examples and field guidance. If the same component is missing across a class, examine the setup or communication rather than assuming many independent typing errors.

Use fictional cases in training so staff can practise the distinction without exposing student results. Include a valid zero, an out-of-range score, a required blank and an approved exception. Ask participants to state the next action rather than merely choose a status label.

Update the procedure when assessment rules or software configuration change. An old instruction can remain plausible while no longer matching the current workflow. Keep the owner and current version visible so staff know where to ask when the entry screen does not support the academic meaning they need to record.`],
  ['A final marks-entry review checklist', `Confirm the assessment setup, expected student population and permitted states before entering data. Check identity as well as numerical range. Keep zero, absence, exemption and unfinished entry distinct according to the school's approved rules, and assign each unresolved exception to a responsible reviewer.

After corrections, verify affected totals and report outputs. Record the reviewed scope and keep entry completion separate from release approval. A technically valid dataset is not necessarily an academically accurate result set, so the review must connect values to evidence and policy.

When evaluating the marks workflow in Schoolment, demonstrate these cases with fictional records and confirm how the configured system represents them. The desired outcome is not a spreadsheet without blanks at any cost. It is a result that accurately describes each student's assessment and can be explained by the staff who approved it.`],
];
