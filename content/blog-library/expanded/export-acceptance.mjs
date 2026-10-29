export default [
  ['Introduction', `A successful download does not prove that a school can use the information inside it. An export may open correctly yet omit identifiers, include only the current page of results or represent a status differently from the screen. The school needs an acceptance check that connects the downloaded data to the purpose for which it was requested.

Begin by identifying the intended use. A class contact list, a year-end archive and a migration dataset have different requirements. A file suitable for one purpose may be incomplete for another. Avoid accepting an export merely because it contains many rows and familiar column names.

This guide proposes a practical review for authorised school staff. It focuses on scope, meaning, completeness and safe handling rather than on a particular file format or vendor. The examples are fictional, and the suggested checks should be adapted to the actual export options and data-access arrangements available in your school system.`],
  ['Write an export request that defines the population', `Describe which records should appear before generating the file. Identify the academic year, record type, relevant status and any class or date restriction. “All students” is ambiguous when the school has active students, applicants, former students and archived years in the same environment.

State whether the request concerns the population as it exists now or at an earlier date. A current student list may not answer a question about enrolment at the start of term. If the system does not provide the historical view required, record that limitation rather than treating current records as a substitute.

Name the person authorised to request and receive the export. The scope should follow the task and the recipient's role, not the maximum amount the software can download. A precise request helps the reviewer distinguish a genuinely missing record from one that was correctly excluded by the agreed criteria.`],
  ['Agree on the fields and their meanings', `List the fields needed for the task and explain any that could be interpreted in more than one way. A column labelled “date” might represent admission, joining, creation or last modification. A column labelled “class” might describe current placement or the placement associated with a historical record.

Include stable identifiers where relationships must be preserved. Names are useful for human recognition, but two people may share the same name and one person's name may change. The reviewer needs to know how the system distinguishes records and how an exported relationship refers to the intended student, guardian or transaction.

Separate required fields from optional context. An archive may need different information from a contact list prepared for an event. Do not add sensitive columns simply because they are available. Ask how blanks, unavailable values and multiple linked records are represented so the receiving team does not invent meanings during later processing.`],
  ['Record the settings used to create the file', `Keep a small export note containing the request reference, creator, generation time and selected filters. If the export depends on a view, record the relevant view settings. This gives the school a basis for repeating the download and explaining why two files may contain different populations.

Confirm whether the export action applies to all matching results or a narrower selection. Do not infer this from the number of rows visible on the screen. Use the product's demonstrated behaviour or an authorised sample check. A download that silently contains only a selected subset can look plausible until someone tries to reconcile it.

Give successive files distinguishable names or versions through the approved storage process. Avoid replacing an earlier file without preserving the context needed for the review. If a request is regenerated after a correction, label the new version clearly so recipients do not continue working from the rejected one.`],
  ['Reconcile counts using the same scope', `Compare the number of exported records with a source count using the same population, date and filters. A mismatch is a prompt to investigate, not automatic proof that the export failed. The source view may count people while the file contains one row per relationship or transaction.

Document the unit represented by a row. A student with two authorised contacts could appear twice in a contact-relationship export while appearing once in a student master export. Both can be correct for their purposes, but the acceptance criteria must identify which arrangement is expected.

If the count differs, inspect the excluded and additional cases before making changes. Look for status filters, archived records, multiple relationships and selection limits. Do not insert or remove rows merely to make totals match. The goal is a justified reconciliation in which the reviewer can explain the difference or confirm that a correction is required.`],
  ['Check identifiers before checking presentation', `An export can look tidy while losing the information that connects it to the source. Review the student, application or transaction identifiers needed for the task. Confirm that they remain distinguishable and that the receiving process preserves their intended representation.

Use samples that include values likely to expose interpretation problems, such as identifiers with leading zeros or names containing punctuation. Treat identifiers as identifiers, not quantities to be recalculated. If a receiving tool changes a value, investigate the import or display settings before assuming that the source exported it incorrectly.

Where a file contains several related record types, identify the linking fields explicitly. The receiving team should not have to match students to fees by name alone. If the export lacks the necessary relationship information, document the gap and request an appropriate supported export rather than devising a fragile manual matching rule.`],
  ['Review dates, amounts and statuses in context', `Select a few records whose meaning you can verify from the authorised source. Compare the relevant dates, amounts and statuses. A correct-looking number is not enough if it refers to a different period or excludes an adjustment that the task requires.

For a fee export, distinguish the original demand, payments, approved adjustments and remaining balance according to the system's actual definitions. Do not assume that a column labelled “total” includes the same components in every report. For student records, distinguish active enrolment from an application or historical placement.

Record the interpretation used during acceptance. If the export supplies a code rather than a descriptive label, obtain the relevant meaning from the supported documentation or responsible team. Avoid replacing codes with guessed descriptions. A usable file is one whose values the recipient can interpret consistently, not merely one that opens without an error.`],
  ['Test blanks and multi-value records deliberately', `Missing information should remain distinguishable from information that is not applicable or intentionally excluded. Ask how the export represents these cases and test a sample. A blank phone field, for example, should not automatically be treated as proof that the school has no authorised contact route.

Check records with more than one relevant value. A student may have several contacts, a fee may have several payments, or an application may have more than one document. The export might use separate rows, separate files or a supported combined representation. The reviewer needs to understand that design before declaring the file complete.

Do not reduce several values to the first one simply to simplify a spreadsheet. That decision can remove information necessary for the receiving task. If a simplified operational list is required, define its selection rule separately from the complete export and make the resulting limitation clear to the recipient.`],
  ['Worked example: a contact export for a class event', `In a fictional school, the office requests an event contact list for currently enrolled Class 5 students. The approved purpose is to send an event notice through the school's normal communication process. The request does not require fee balances, identity documents or unrelated family notes.

The exported file has more rows than the class enrolment count. The reviewer establishes that each row represents an authorised student-contact relationship, so some students appear more than once. The difference is explained rather than corrected by deleting apparently duplicate names. The communication owner then applies the approved recipient-selection rule for the event.

The reviewer checks a student with one contact, a student with two contacts and a recent class transfer. The sample reveals that the export was generated before the transfer was approved. A new file is requested using the agreed current population, and the earlier version is marked as superseded. Acceptance rests on scope and meaning, not on whether the first spreadsheet looked convenient.`],
  ['Keep original exports separate from working copies', `Once an export is accepted for review, retain the original through the approved storage process and perform analysis on a clearly identified working copy. This helps the school distinguish source data from later sorting, filtering, calculations or manual annotations.

If the working copy reveals a problem, trace it back to the original and the source record. A changed value in a spreadsheet may have been introduced after download. Without a preserved original, the investigation can become a disagreement about whether the application or the analyst caused the discrepancy.

Use access appropriate to the information contained in the file. A local export can be easier to copy or forward than a controlled application view. Share it only with the intended recipients and follow the school's process for retention and disposal. Export acceptance includes handling arrangements, not just the content of the download.`],
  ['Define what acceptance does not establish', `Passing a sample check does not prove that every field in every record is correct. State the scope of the review: which counts were reconciled, which cases were sampled and which interpretations were confirmed. This allows the recipient to judge whether the evidence is sufficient for the intended use.

An export review also does not establish that the original data was accurate when entered. If the source itself contains an incorrect contact or class assignment, a faithful export can reproduce that error. Keep source-data correction separate from export correctness so the responsible team knows which issue needs attention.

Likewise, acceptance for one task does not approve every later reuse. A list prepared for an internal event may not be appropriate for a different recipient or purpose. The export note should identify the approved use and any limitations, rather than allowing a convenient file to become an unofficial universal database.`],
  ['Create an exception list instead of editing silently', `When a review finds a discrepancy, record the source reference, expected value or relationship, observed result and reason for concern. Assign the issue to the appropriate owner. The person reviewing the file should not silently alter it and then describe the result as an accepted system export.

Some issues require a source correction followed by regeneration. Others may involve a misunderstood filter or an export option that does not support the requested scope. Classify the finding accurately so the response addresses the cause. Preserve the distinction between an approved transformation and a repair to an incorrect source record.

After a new version is supplied, repeat the affected checks and any broader reconciliation needed to ensure the change did not alter the population unexpectedly. Close the exception only when the reason for the discrepancy is understood and the intended use can proceed with a documented, reliable version.`],
  ['Review export capability before a migration or service change', `If the school expects to move information into another system, demonstrate the required export early enough to discover gaps. A basic student list may not include historical fees, document references or relationships needed by the destination. The migration team should define its needs before treating an available download as a complete exit dataset.

Ask which record types can be exported, how their relationships are represented and what separate arrangements apply to documents or history. Record what was demonstrated and what remains to be provided. Do not assume that a screen displaying information means every element is available through the same export route.

Use a representative authorised sample to test the destination's interpretation. Keep export acceptance distinct from import acceptance: a correct source file can still be mapped incorrectly at the destination. Each side needs its own review, with a clear record of transformations and unresolved limitations.`],
  ['Make recurring exports repeatable without hiding changes', `For a recurring report, keep the agreed filters, field meanings and reconciliation approach in a short operating note. A replacement staff member should be able to create the same type of file without relying on undocumented choices. Include the circumstances that require a fresh review, such as a changed report layout or an additional status value.

Compare like with like when reviewing successive periods. A change in the exported population can explain a changed total even when no individual record is wrong. Note when the school adds a class, changes its definition of active enrolment or includes a previously excluded record category.

Do not let a familiar filename replace verification. A monthly file can still be generated with an old year filter. Repeat the essential scope and count checks each time, while reserving deeper field-level testing for the situations where the risk or change warrants it.`],
  ['Record the acceptance decision and next owner', `The final acceptance note should identify the file version, intended purpose, population, checks performed and unresolved limitations. Name the reviewer and the person responsible for the next step. If the file is accepted conditionally, state what that condition means rather than using a vague “looks fine”.

For a simple operational list, the note may be short. For migration or historical archiving, more detailed evidence may be needed. Match the review to the consequences of an error, not to the visual complexity of the spreadsheet. A small file used for a consequential decision can deserve careful attention.

When demonstrating Schoolment or another school platform, use this acceptance process to examine the exports your team actually needs. Confirm the available fields and supported relationships. A dependable export is one whose scope, meaning and handling are understood by the people who will rely on it after the download is complete.`],
];
