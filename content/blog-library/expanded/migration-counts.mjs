export default [
  ['Introduction', `A migration summary saying “960 records imported” is incomplete without explaining how many records were expected and what happened to the rest. Some source rows may have been intentionally excluded, some rejected and some combined under an approved rule. The school needs a reconciliation that accounts for those outcomes rather than treating the destination total as proof of success.

Count reconciliation follows records through the migration stages. It asks what entered the process, what was included, what was accepted and what still needs attention. It also checks that the unit being counted remains consistent. Student records, guardian relationships and fee transactions are not interchangeable units.

This guide provides an operational review method for school staff and migration teams. It does not prescribe database commands or a particular import tool. The examples are illustrative, and every adjustment to real school records should follow the agreed migration and approval process.`],
  ['Define the unit before comparing any totals', `Start by naming what each count represents. A source spreadsheet may contain one row per student, while another file contains one row per student-contact relationship. Both may be called “student data”, yet their totals should not necessarily match.

For each dataset, record the unit, period and scope. State whether former students, incomplete applications or archived years are included. If the destination combines or splits source rows, document that transformation separately. A numerical difference can be legitimate, but it needs an explanation supported by the actual mapping.

Avoid comparing a dashboard total with a raw file count until their definitions are aligned. A dashboard may show only active records or use another filter. The review should establish what the two figures count before deciding whether they disagree. Otherwise staff can spend time correcting a difference that is only a difference in meaning.`],
  ['Create a stage-by-stage reconciliation sheet', `Use a concise worksheet showing the source total, approved exclusions, expected included population, accepted records and unresolved rejections. Add other dispositions only when the actual migration process requires them, such as an approved merge or a deferred record category.

Every stage should have a definition and an evidence source. “Accepted” might mean that a tool processed a row, but the school still needs to know whether the resulting record passed operational checks. Keep technical acceptance and business acceptance distinguishable where they are different events.

Name the owner of each count. The migration team may provide processing totals, while the school confirms approved exclusions and expected populations. Neither side should fill unexplained gaps with a balancing adjustment. A useful reconciliation sheet makes uncertainty visible and connects it to a person who can investigate it.`],
  ['Freeze the source version used for the comparison', `Count checks are unreliable when the source changes between measurements. Identify the file or source version used for the migration, including its generation time and agreed filters. Keep it distinguishable from earlier trial exports and later corrections.

If operational work continues during preparation, record how later changes will be carried forward. The reconciliation should not silently compare yesterday's import with today's live total. A supported update process or controlled exception list may be required, depending on the actual implementation plan.

Preserve the accepted source through the authorised storage process. This gives reviewers a stable reference when a destination record appears missing or unexpected. Without it, the team may be comparing different populations while believing it is discussing the same migration run. The source boundary is part of the evidence, not an administrative detail added afterwards.`],
  ['Make exclusions explicit and approved', `An exclusion removes a record from the intended migration population. It should have a documented reason, such as a record category outside the agreed scope. An exclusion is not the same as a failed import, and it should not be used to hide a record the team could not process.

Record excluded references or a clearly defined excluded group, together with the approving owner. The school should be able to explain why those records are not expected in the destination and where their authoritative history remains available if needed.

Review exclusions before the final run. A rule that was reasonable for a trial may not be appropriate for the production scope. For example, excluding former students from a current operational list does not establish that their history can be discarded. Scope decisions and retention arrangements need their own approved treatment.`],
  ['Distinguish rejected rows from records not attempted', `A rejected row was presented to a process and not accepted under its rules. A row not attempted may have been outside scope, deferred or omitted before processing. These outcomes require different follow-up and should not share a generic “pending” label.

For each rejection, retain the source reference and the reported reason where available. The correction owner needs enough context to decide whether the problem is a missing value, an invalid relationship or another issue. Avoid replacing missing information with invented values just to make a row pass.

For deferred records, state why they were deferred and the condition for including them later. The reconciliation remains open for that category until the agreed outcome is documented. A destination count can be accurate for the first phase while still being incomplete for the full migration, and the report should make that distinction clear.`],
  ['Use an illustrative count equation carefully', `Suppose a fictional source contains 1,000 student rows. The school approves 15 exclusions from the current migration scope, leaving 985 expected records. The first run accepts 960 and rejects 25. The count reconciliation is explainable: 1,000 source rows equal 15 approved exclusions plus 960 accepted rows plus 25 unresolved rejections.

This does not mean the migration is complete. The 25 rejected rows still require a disposition, and the 960 accepted records still need the agreed operational checks. A balanced equation accounts for the population; it does not establish that every value and relationship is correct.

If a report instead shows only 975 expected records without explaining the missing ten, the reviewer should stop and investigate the scope change. Do not adjust the expected total to match the result. The value of the equation is that it reveals unexplained movement between stages.`],
  ['Track corrections without counting the same source twice', `When rejected rows are corrected and processed again, retain their relationship to the original source references. A second run should not simply be added to the first accepted total without checking whether it contains only previously rejected records.

In the illustrative example, if all 25 rejected rows are corrected and accepted, the expected accepted population becomes 985, assuming no other approved changes. The school should verify that the rerun did not also recreate any of the original 960 records. That requires reference-level evidence, not merely a reassuring total.

Keep a run history showing which records were attempted in each stage and their latest disposition. The history does not need to be complicated, but it must explain how the final accepted set was formed. A record that appears in several run reports should still represent one intended source entity unless the agreed mapping explicitly says otherwise.`],
  ['Investigate additional destination records as well as missing ones', `Reviewers often focus on shortages, but an unexpectedly high destination count also needs explanation. It may reflect duplicate processing, pre-existing test records, a broader filter or a legitimate transformation into several destination rows. Establish the cause before removing anything.

Identify the destination population attributable to the migration separately from records that already existed. If the target environment contained approved operational data, the reconciliation needs to account for that starting state. Treating the destination as empty when it was not can make every later total misleading.

Use supported identifiers and run evidence to classify additional records. Do not delete a record just because its name resembles another one. Two students can share a name, and a repeated name may represent a valid relationship rather than a duplicate entity. Data removal requires an authorised, evidence-based decision.`],
  ['Check relationships with separate counts and samples', `A complete student count does not establish that contacts, classes or fees are linked correctly. Review related datasets using their own units and expected relationships. A student can exist in the destination while the associated guardian points to another record or a class assignment is absent.

Choose samples that include ordinary and more complex relationships. For example, a student with one contact, siblings sharing an authorised family contact and a student whose class changed near the source boundary can expose different mapping issues. Keep the sample appropriate to the agreed migration scope.

Document both the count checks and the relationship checks. If the student population reconciles but contact relationships do not, state that clearly. A single overall green status should not conceal a dataset that has passed one level of review and failed another.`],
  ['Review grouped totals without confusing them with proof', `Totals by class, status or academic year can help locate a discrepancy that is not obvious in the overall count. If the whole-school total matches but one class is short and another has extra records, a placement issue may be present even though the aggregate looks correct.

Use grouping definitions consistent with the accepted source. A class name may have been normalised or split into grade and section during migration. Confirm that the comparison uses the approved mapping rather than expecting labels to match character for character.

Grouped totals are diagnostic aids, not substitutes for record-level review. A matching class count can still contain the wrong students. When a grouped mismatch is found, identify the affected references and investigate their actual placement. The review should move from a useful signal to an explainable disposition, not stop at a chart.`],
  ['Keep a discrepancy register with an owner and outcome', `A discrepancy register turns findings into work. Each entry should identify the dataset, source or destination references, expected condition, observed condition and next investigation action. Include an owner and review date so a mismatch does not remain an unassigned note in a meeting document.

Separate source-data errors, transformation errors and scope misunderstandings. A name already wrong in the source needs a different correction path from a field mapped to the wrong destination. Record the classification when established, and leave it uncertain when the evidence is not yet sufficient.

Close an entry with the verified outcome and any rerun or correction reference. “Fixed” is too vague if another reviewer later needs to understand the change. The register should explain whether the record was corrected, legitimately excluded, confirmed as valid or left for an explicitly accepted later phase.`],
  ['Agree acceptance criteria before the final review', `The school and implementation team should agree what must reconcile before the migrated data can support normal work. Different datasets may have different acceptance conditions, but those conditions should be defined before the final totals are known.

Include the treatment of unresolved records. A small number is not automatically harmless; one missing record may block a consequential task. Assess the operational effect and identify who may accept a temporary limitation. Do not use a percentage alone to justify proceeding without understanding the exceptions.

Record the evidence required for sign-off, such as reconciled populations, reviewed relationships and a disposition for each known discrepancy. Acceptance should be a decision based on those results, not an automatic event triggered by the completion of a technical run. The report must remain understandable to school staff who did not perform the import.`],
  ['Communicate the result in language departments can use', `Department owners need to know which records are ready for their tasks and which limitations remain. A technical report listing processed rows may not answer whether teachers can rely on class lists or whether accounts can use opening fee information.

Summarise the accepted scope, the checks performed and any outstanding categories. Explain what staff should do if they discover a discrepancy during early use. Provide the authorised reporting route so corrections are coordinated rather than made independently in several copies.

Avoid announcing that “all data is verified” when the review covered only counts and a sample. Describe the actual assurance obtained. A precise report can still support a sound operational decision without overstating the depth of inspection. It also makes later questions easier to answer because the school can see what was and was not checked.`],
  ['Preserve the reconciliation evidence after launch', `Keep the accepted source reference, run summaries, discrepancy dispositions and sign-off together through the school's approved document process. These records explain the destination's starting position and can be important when a later question concerns an apparently missing or changed entry.

Restrict access according to the information contained in the evidence. Reconciliation files can include identifiers and private record details even when they are described as technical reports. Do not leave them in an informal shared folder simply because the migration project has ended.

If a later correction changes the accepted position, connect it to the normal operational record history rather than rewriting the original migration report as though the discrepancy never existed. The school benefits from a clear sequence: what was accepted at cutover, what was discovered later and how the later issue was resolved.`],
  ['A final count-reconciliation review', `Before accepting a migration, ask whether every source record has an explained disposition, whether reruns are linked to original references and whether additional destination records have been investigated. Confirm that the count units and filters are consistent across the comparison.

Then review the checks that counts cannot answer: field meaning, relationships and the operational effect of unresolved exceptions. Identify the person authorised to accept the result and the evidence supporting that decision. Keep the final report specific about its limitations.

For a Schoolment migration discussion, ask the delivery team to walk through these stages using an authorised sample and the actual planned data scope. A dependable migration is not simply one that produces a large destination total. It is one in which the school can explain how the intended population arrived, what happened to the exceptions and why the accepted records are ready for the work that follows.`],
];
