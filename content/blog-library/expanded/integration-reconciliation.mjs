export default [
  ['Introduction', `A school workflow can involve more than one system. A payment provider may report a result to the school application, an attendance device may send records to a register, or a messaging service may receive a notice for delivery. When a connection is interrupted, the school needs to establish which part of the work happened before deciding what to repeat.

The most important distinction is between a confirmed failure and an unknown outcome. A missing confirmation does not by itself tell the office whether the receiving system accepted an operation. Repeating a request without checking can create a second problem while attempting to solve the first.

This guide describes an operational reconciliation process for authorised school and technical staff. It does not provide commands for changing production integrations. Use the actual provider documentation and supported recovery procedure for the connected services. The examples are fictional and illustrate questions to ask, not a claim that Schoolment implements every integration or recovery mechanism discussed.`],
  ['Map the two sides of the exchange', `Identify the sending system, receiving system and business event being exchanged. “Payment integration failed” is too broad if the payment was accepted externally but the school's receipt record was not updated. The operational response depends on where the confirmed outcome exists and which step remains incomplete.

Describe the expected sequence in plain language. For a hypothetical payment workflow, the sequence might include a request, an external result, a school-side update and a confirmation to the family. Do not assume those steps all occur together or share the same status label. Ask the responsible technical team to explain the actual implementation.

Record which team can verify each side. Accounts may be authorised to inspect a provider report, while application support investigates the received event. A useful incident record connects those responsibilities so the school does not ask one team to make claims about records it cannot access.`],
  ['Preserve identifiers that connect the records', `Reconciliation needs a supported way to match the same event across systems. This may involve an external transaction reference, a school-side record identifier or another integration-specific key. Ask which identifier is authoritative for the exchange rather than matching records solely by a student's name and an approximate time.

Keep the identifiers in the authorised investigation record. Do not place private information into public issue descriptions or informal group messages. The school-side owner should know where the evidence is stored and who can access it, while the technical team determines what diagnostic details are necessary.

If an identifier is absent or inconsistent, record that as an unresolved matching issue. Avoid selecting the nearest-looking record merely to clear the exception. A wrong match can make two systems appear reconciled while allocating an event to the wrong person or task. Uncertainty should remain visible until the relationship is established.`],
  ['Define statuses separately for each system', `The same word can mean different things at different stages. “Sent” might mean that the school submitted a request, not that the receiving service completed it. “Accepted” might describe receipt for processing rather than the final business outcome. Use the connected service's actual definitions.

Create a small status comparison for the incident: what the school system shows, what the external system shows and what each observation proves. Include the time at which each status was checked. If a value changes while the investigation is underway, preserve the sequence instead of replacing the earlier observation without explanation.

Avoid compressing the whole incident into a single success or failure label too early. A partially completed workflow needs a description of the completed and outstanding stages. That description helps staff decide whether to wait, investigate, communicate or perform an approved recovery action.`],
  ['Treat retries as a technical procedure, not a reflex', `Some services provide mechanisms intended to make supported retries safe. Stripe's documentation, for example, describes idempotency keys for recognising retries of an operation. That example does not establish how another provider behaves, or whether a school's integration uses the mechanism correctly.

Before repeating a state-changing request, ask the technical owner whether the supported recovery procedure applies to this operation and what evidence is required. The answer should come from the implemented integration and its documentation, not from a general belief that clicking again is harmless.

School staff should not invent identifiers, replay events or alter technical settings to force completion. Where a retry is authorised, record who initiated it, the relevant reference and the result. The operational goal is one correct outcome with an explainable history, rather than a series of attempts whose relationships nobody can reconstruct.`],
  ['Separate live work from the exception queue', `Normal operations may continue while a subset of integration events needs review, but that decision requires an understanding of the incident's scope. Identify the affected workflow and any known time window. The responsible team should state which activities can safely continue and which should pause.

Create an exception queue for the uncertain records rather than asking staff to remember them. Each item needs the relevant references, observed states, next investigation action and owner. A queue entry should not itself change the underlying business record; it documents work still required.

Avoid broad manual workarounds that bypass the normal process for unaffected cases. For example, an isolated unmatched payment should not automatically lead to recreating every demand or receipt in a class. Keep recovery targeted to the evidence, and ask for a wider review only when the investigation supports one.`],
  ['Choose an evidence window without assuming the cause', `Record when the first observed failure occurred and when normal behaviour was last confirmed, if known. These observations help define an investigation window, but they do not prove that every event within that period failed or that all earlier events succeeded.

Include changes known to be relevant, such as a scheduled service change reported by the responsible team. Mark uncertain explanations as hypotheses. A correlation between a change and a symptom is useful context, not a complete diagnosis.

Ask the technical owner how the affected population will be established. The answer may require supported reports or logs from both sides. School staff should provide operational context and authorised examples rather than collecting large amounts of unrelated private data. The exception list can expand as evidence becomes available, with a clear reason for each added item.`],
  ['Worked example: an external payment with no school receipt', `In a fictional case, a parent reports a successful payment, but the school portal still shows the fee as unpaid. The accounts team does not immediately ask the parent to pay again. It records the reported reference and checks the authorised external record through the established process.

The external service shows a completed payment associated with the reference. The school-side receipt is absent, so the team records a mismatch between the two stages. Application support investigates whether the relevant result reached the school system and what supported recovery action is appropriate. The parent receives an accurate acknowledgement that the school is checking the record, not a premature claim that the portal has been corrected.

After an authorised recovery, accounts verifies the payment allocation, balance and receipt history. It also checks that a second record was not created during the investigation. The incident closes only when the intended school-side outcome is confirmed and the family-facing information reflects the verified result.`],
  ['Use manual adjustments only through the approved route', `A manual correction may be necessary in some incidents, but it should be an authorised operational decision with a documented reason. The person investigating a connection problem should not silently rewrite a fee, attendance or message record simply to make a dashboard look consistent.

Before an adjustment, establish what the source evidence proves and what the correction is intended to achieve. Identify the approver and the normal record-history requirements. Keep the adjustment linked to the incident so later reviewers can understand why it occurred.

Consider what happens if the delayed integration event arrives afterwards. The responsible technical and operational teams should agree how that possibility is handled before a manual action is taken. Do not assume that a later event will be ignored or merged automatically. This is a question for the actual supported workflow, not a property that can be inferred from the screen.`],
  ['Communicate the verified state to families and staff', `People affected by an uncertain result need a clear statement of what is known and what is being checked. Avoid technical explanations that imply more certainty than the investigation supports. A parent primarily needs to understand whether another action is required and how the school will provide the next update.

Use one school-side communication owner where practical. Conflicting messages from accounts, reception and technical support can cause a family to repeat an action that another team has asked them to pause. Record the current instruction in the authorised case history.

When an update is due before the investigation is complete, explain the outstanding step and the next contact plan. Do not describe a pending reconciliation as a confirmed failure or a completed correction. Accurate interim communication helps the school avoid creating additional operational work while the technical issue is still being resolved.`],
  ['Reconcile totals only after matching individual exceptions', `Aggregate totals can help identify a discrepancy, but matching totals do not prove that every record is correctly associated. Two errors can offset each other. Use totals alongside record-level review, especially when the incident involves allocations to individual students or demands.

Define the population and period consistently on both sides. A provider report and a school report may use different dates or status definitions. Record those distinctions before concluding that a difference represents missing information. The responsible teams should explain any legitimate timing or scope difference.

For the confirmed exception set, track which items are matched, corrected, still uncertain or outside the incident's scope. A clear disposition for each item is more useful than a single reconciled total with no explanation of how it was reached. Preserve the supporting references for the school's normal review process.`],
  ['Test recovery on a controlled case where possible', `Before applying a recovery action widely, ask whether it can be demonstrated on an authorised test case or a limited confirmed exception. The test should have a defined starting state, expected result and review owner. Avoid using an arbitrary live record simply because it is easy to find.

Check the complete business outcome after the action. A successful technical response may not establish that the correct student, fee, register or message was updated. The operational owner should verify the result relevant to the school's work, while technical staff confirm the integration's supported behaviour.

If the controlled case produces an unexpected result, stop and revise the recovery plan. Do not apply the same action to the rest of the queue in the hope that the broader run will behave differently. A small test is valuable because it makes uncertainty visible before more records are affected.`],
  ['Define incident closure before clearing the queue', `An integration incident should have a closure condition that includes both technical stability and operational reconciliation. The connection may be working again while earlier exceptions still require review. Conversely, individual records may be corrected while the underlying interruption remains unresolved.

Record which conditions have been met and which remain open. A technical team can close its repair task while the school keeps a linked reconciliation task active, provided the distinction is explicit. Avoid a single closed status that conceals unfinished work owned by another team.

The closure note should identify the confirmed scope, approved recovery, verification evidence and any remaining limitations. State whether the affected records were individually reviewed or accepted through another documented method. This gives school leadership a useful account of the incident without implying a level of verification that was not performed.`],
  ['Review the monitoring and ownership gaps the incident exposed', `After the immediate work is complete, consider how the school discovered the issue. Did a family notice it first? Did an expected report show a mismatch? Was an exception visible but unowned? These questions can reveal a process gap even when the technical cause was outside the school's control.

Agree on a practical review that would identify a similar problem without creating excessive manual checking. The appropriate approach depends on the workflow and the monitoring actually available. Do not promise real-time alerts or automatic recovery unless those capabilities are demonstrated in the configured service.

Update the contact and escalation information used during the incident. Staff should know who can verify each system, who approves operational corrections and who communicates with families. A reliable ownership map often makes the next investigation clearer because the school no longer has to discover those responsibilities while an exception queue grows.`],
  ['A school-side reconciliation checklist', `For each integration exception, identify the business event, references on both sides, observed statuses and the meaning of those statuses. Record what is confirmed, what remains uncertain and the next action. Keep technical hypotheses separate from operational facts.

Before repeating or correcting anything, confirm the supported recovery route with the responsible team. After recovery, verify the intended record and any dependent outcome, then review the possibility of duplicates or delayed events. Communicate only the state supported by that evidence.

When discussing connected services in a Schoolment demonstration, ask how exceptions are identified and who investigates them in your proposed setup. Request a realistic interrupted-workflow example rather than only a successful exchange. The aim is not to eliminate every possible interruption through a promise; it is to ensure that an interruption can be investigated and resolved without losing the meaning of the school's records.`],
];
