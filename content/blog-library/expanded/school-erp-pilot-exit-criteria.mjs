export default [
  ['Introduction', `A school software pilot can feel successful because several users like the screens while essential parts of the workflow remain untested. Staff may have entered attendance for a week without practising a correction, or created a fee without verifying how an exception is handled. A pilot should produce evidence about completed work, not merely a favourable first impression.

Exit criteria define what the school needs to observe before expanding the agreed scope. They connect each important task with an expected outcome, an evidence source and a responsible reviewer. The criteria also explain what happens when a result is incomplete or different from what was expected.

This guide describes a practical way to plan that decision. It is not a promise that a particular school platform provides every capability mentioned. Use the tasks and configuration actually proposed for your implementation. The examples are fictional and should be adapted with the staff who own the work being tested.`],
  ['Choose a bounded question for the pilot to answer', `A pilot of “the whole ERP” can become too broad to review meaningfully. Select a defined population and set of workflows, such as attendance and class notices for an agreed group. State the question the pilot should answer: can these users complete these tasks accurately under the school's operating rules?

Record what is outside scope. A successful attendance trial does not establish that the fee process, migration exports or examination release workflow is ready. Clear boundaries prevent later reports from claiming more than the evidence supports.

Choose a scope that includes realistic work rather than only a convenient demonstration. The pilot should be small enough to supervise but broad enough to expose the ordinary conditions that matter. If every case is complete and every user has administrator access, the trial may say little about the roles and exceptions the wider rollout will encounter.`],
  ['Define success as an observable outcome', `Write each criterion in terms of what a reviewer can check. “Teachers understand attendance” is difficult to verify. “An authorised teacher records the correct class register, submits it through the agreed process and can identify the approved correction route” describes work that can be observed.

Keep the expected result distinct from the action taken. Clicking Save is an action; confirming that the intended record exists with the correct status is an outcome. A criterion should identify the evidence that connects the two.

Avoid criteria that can only be answered with a general opinion. User feedback matters, but it should complement task evidence. Ask whether instructions were clear and where users hesitated, while also checking the actual records produced. This gives the review both operational accuracy and an understanding of whether the workflow is practical for its intended users.`],
  ['Assign a reviewer for each kind of result', `The person conducting a technical demonstration is not necessarily the person who can confirm the school's business outcome. Academic staff should review the meaning of class and attendance results; accounts should review the relevant fee outcomes; the authorised administrator should review access boundaries.

Name those reviewers before the pilot starts. Each should understand the criterion, the evidence needed and the point at which their review is due. Otherwise the pilot can finish with many activities completed but nobody willing to accept the resulting records.

Separate evidence collection from approval where the school's process requires it. A user can record that they completed a task, while the responsible owner confirms the result. The aim is not unnecessary bureaucracy. It is a clear decision trail showing who observed the task, who judged the outcome and what remained unresolved.`],
  ['Use representative roles and records', `Test the roles that will perform the work after expansion, not only a highly privileged account. A task that works for an administrator may behave differently for a teacher or reviewer because their responsibilities and permissions differ. That difference may be intentional, but it needs to be understood.

Select authorised sample records that include ordinary variations in the proposed scope. A class with a recent joiner, a corrected contact or an incomplete record may expose a dependency that a perfectly prepared demonstration misses. Use fictional data when appropriate to the environment and purpose.

Document why the sample was chosen. A small pilot cannot represent every possible situation, but it can be honest about the conditions it covered. The final decision should identify those limits rather than assuming that one successful case proves the workflow is ready for every class, user and exception.`],
  ['Include corrections and reversals in the task list', `School work does not end with correct first-time entry. Staff need an approved route when they enter something incorrectly or receive a legitimate change afterwards. Include at least the correction scenarios relevant to the pilot's actual scope.

For each scenario, define who may request, perform and approve the change. Check the resulting record and the history needed by the school. Do not assume that a visible edit button is the complete correction process or that every user should have access to it.

If a correction route is unavailable or unclear, record the finding as a limitation. The team may decide to adjust the process, clarify training or postpone expansion of that part of the workflow. What matters is that the issue is considered before many more users depend on the process, rather than discovered when an urgent live correction is needed.`],
  ['Test an ordinary exception, not just the ideal path', `Choose exceptions from the work staff actually encounter: a missing contact, an absent record, an unsubmitted register or a question awaiting another department. The purpose is to understand how the process behaves when its normal inputs are incomplete.

Define the expected handling before running the case. It may be correct for the system to stop an action and direct the user to an authorised reviewer. A stopped action is not automatically a defect, just as a successful action is not automatically appropriate.

Ask the user to explain the next step after the exception appears. A technically correct warning may still leave staff unsure who can resolve it. Record those usability and ownership gaps separately from software errors. An exception is well handled when the user understands the limit and can follow a practical approved route forward.`],
  ['Check dependencies before blaming the workflow', `A pilot can expose problems in the information or setup beneath the new task. Parent communication depends on approved contact links, attendance depends on current class membership and fee assignment depends on the relevant structure. Record those dependencies in the plan.

When a case fails, investigate whether the expected input was present and correctly interpreted. Do not classify every unsuccessful task as a software defect. Equally, do not dismiss a configuration or data issue as irrelevant; it may still prevent the school from expanding safely.

Give each dependency an owner and completion condition. A pilot finding that “contacts need cleaning” is too broad to guide the next decision. Identify the affected population, the review required and the point at which the workflow can be retested. The pilot should convert discovered uncertainty into specific work rather than leave it as a general warning.`],
  ['Worked example: an attendance pilot with an unresolved correction', `In a fictional school, one class records attendance through the proposed workflow for an agreed trial period. Teachers can open the correct register and submit it, and the academic reviewer can see the resulting status. Those criteria pass with recorded evidence.

The planned correction exercise then reveals that teachers do not know how to request a change after submission. One user proposes entering the correction through an administrator account. The pilot coordinator does not accept that workaround as proof of readiness. The issue is recorded against the correction criterion and referred to the responsible process owner.

The owner clarifies the supported route, the relevant permissions and the review responsibility. The same scenario is tested again using the intended roles. Only after the corrected record and its required history are checked does the team decide whether the attendance workflow is ready to expand. Successful initial entry was necessary, but it was not the entire pilot question.`],
  ['Keep findings classified by the decision they require', `Separate confirmed defects, configuration issues, training gaps, source-data problems and new requests. These categories need different owners and should not all be treated as an undifferentiated backlog. A new feature request may be valuable without being part of the pilot's agreed acceptance conditions.

Record the criterion affected, evidence observed and proposed next action. If the cause is uncertain, keep that uncertainty explicit rather than choosing a convenient category. The investigation can update the classification when evidence supports it.

Identify whether a finding blocks expansion, requires an agreed temporary arrangement or is outside the current scope. That judgement belongs to the authorised reviewers. The pilot coordinator should not hide a serious limitation by labelling it minor, or turn every preference into a blocker without explaining its operational consequence.`],
  ['Measure effort around the whole task', `A new process may reduce one activity while adding preparation or review elsewhere. If the pilot evaluates effort, observe the complete task rather than only the fastest visible action. Include setup, entry, verification and ordinary exception handling where they are relevant.

Keep the comparison fair. A new user learning the process and an experienced user following a familiar routine are not identical conditions. Record the circumstances of the observation and avoid presenting one trial result as a guaranteed saving for every school or workload.

Ask staff where effort moved. A clearer record may reduce later searching even if initial entry takes slightly longer. Conversely, a quick submission may create additional correction work. The pilot should help the school understand those trade-offs through actual tasks, not simply confirm an optimistic expectation established before the trial began.`],
  ['Review support and recovery responsibilities', `During a pilot, users often receive unusually close help from the implementation team. Before expanding, consider how questions will be handled under ordinary operating conditions. Identify the school-side contact, provider route and information required to report an issue.

Test the process with a realistic question or incident within the approved environment. The objective is not to manufacture an emergency. It is to confirm that staff know where to ask, who owns the response and how the outcome is verified.

Record any temporary support arrangements that will end after the pilot. A workflow may appear manageable only because one specialist is continuously present. The expansion decision should consider whether training, documentation or support ownership needs to change before a larger population relies on the same process.`],
  ['Hold an evidence-led exit review', `At the planned review, examine each criterion and its supporting result. Use clear outcomes such as passed, failed, not tested or accepted with an explicit limitation. Avoid a single average score that can conceal an essential task that was never completed.

Give reviewers time to question the evidence. If a result is described only as “worked in the demo”, ask which role, record and expected outcome were checked. A finding should be traceable without requiring the original presenter to reconstruct it from memory.

The decision may be to expand, extend the pilot with specific work, reduce the proposed scope or stop the current approach. Record the reason and the next owner. An extended pilot should have a new question or unresolved criterion to answer, not simply continue indefinitely because the team is uncomfortable making a decision.`],
  ['Define the next expansion boundary', `A successful pilot supports a defined next step, not an unlimited rollout. Identify which additional users, classes or workflows are approved to join and what preparation they require. The next stage should preserve the conditions that made the pilot meaningful while testing any new variation deliberately.

Carry forward unresolved findings with their owners and limitations. Do not erase them because the pilot phase has ended. A limitation accepted for one class may not be suitable for a larger population, especially if it depends on a manual review capacity that does not scale.

Explain the approved scope to staff in task terms. Users should know which work is ready, which procedure to follow for exceptions and which activities remain outside the rollout. Clear communication prevents enthusiasm about one successful workflow from becoming an assumption that every module is now ready for normal use.`],
  ['Preserve the evidence for later changes', `Keep the pilot plan, sample definitions, findings and exit decision together through the school's approved document process. These records explain why the rollout proceeded and what conditions were considered. They can also help when a later change affects a workflow that previously worked.

Use the completed criteria as a starting point for future checks, not as a permanent certification. A changed role, configuration or upstream record process may require retesting. Identify which criteria are affected rather than repeating the entire pilot without purpose.

When evaluating Schoolment, bring a small set of these task-based criteria to the demonstration and implementation discussion. Ask what can be shown in the proposed configuration and what needs a school-side procedure. A well-run pilot ends with a defensible decision about real work, including its limits, rather than a collection of screenshots that nobody can connect to an acceptance outcome.`],
];
