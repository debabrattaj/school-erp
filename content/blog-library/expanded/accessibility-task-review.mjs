export default [
  ['Introduction', `A school portal can look attractive in a demonstration while still making an ordinary task difficult for some users. A parent may struggle to identify a form field, a staff member may lose their place while navigating controls, or a learner may not understand whether a submission succeeded. A useful review starts with those tasks, not with the assumption that visual polish establishes accessibility.

W3C's preliminary accessibility guidance explicitly describes its easy checks as limited first checks, not a comprehensive assessment. The same distinction matters for a school-led task review. It can reveal practical barriers and prepare useful evidence, but it is not a certification of accessibility or legal compliance.

This guide describes how a school can organise that initial review with appropriate participants, fictional records and a clear reporting process. Technical findings should be evaluated by people with the relevant expertise, using the applicable standards and the actual product configuration rather than treating this article as a complete testing method.`],
  ['Choose tasks that represent real school use', `Select a small set of important journeys. Examples might include finding an approved notice, locating a student's timetable or completing a practice information-update form. The chosen tasks should reflect what the intended users actually need to accomplish, rather than only the screens that are easiest to demonstrate.

Write the starting point and completion condition for each task. “Use the parent portal” is too broad; “find the date and reporting location in this fictional event notice” gives the participant a clear objective. Avoid prescribing every click if the purpose is to learn whether the route is understandable.

Include different user roles where they genuinely use different interfaces. A staff member's successful experience in an administrative account does not establish that the parent-facing route works equally well. Keep the scope manageable and document which roles and tasks were not included in the first review.`],
  ['Prepare a safe practice environment', `Use fictional or appropriately authorised sample information so participants are not exposed to unrelated student records. Arrange accounts and permissions before the session. The review should not require a participant to borrow another person's credentials or demonstrate a private production task to a group.

Confirm which actions are safe to perform. A form submission may create a record or send a message even when the tester thinks it is only a demonstration. Where a supported practice environment is unavailable, define a read-only exercise or another approved method rather than improvising consequential live actions.

Keep the test materials clear and limited to the task. Prepare the notice, sample class or practice form needed for the exercise, and identify who can reset the scenario afterwards. A well-prepared environment lets the reviewer focus on the experience rather than spending the session resolving unrelated account and data problems.`],
  ['Involve users without making assumptions about their needs', `Invite relevant participants through an appropriate, respectful process. Ask what arrangements they need for the review instead of assuming that a particular device, condition or role predicts how they will use the system. Participation should not require disclosure of unnecessary personal information.

Explain the purpose and the limits of the exercise. The product and task are being evaluated, not the participant's ability. Make it clear that stopping, asking for a break or declining a task is acceptable. Avoid treating difficulty as a personal failure or coaching the participant so heavily that the barrier disappears from the evidence.

Agree on how observations will be recorded and shared. A written task note may be sufficient; a recording is not automatically necessary. Use the school's approved process for any collection of participant information and keep the resulting report focused on the interface and workflow rather than on private personal details.`],
  ['Review field labels and instructions in context', `W3C's form guidance explains that controls need labels describing their purpose and that labels should be associated with their controls. For a school task review, ask whether the participant can identify what information belongs in each field and what action the form is requesting.

Record the specific field or instruction that creates uncertainty. A screenshot of the relevant area can support the observation, but include the task context: was the user entering a joining date, a payment reference or a contact detail? Similar-looking fields can have different meanings.

Do not assume that a visible word beside a field proves the technical association is correct. That requires an appropriate technical check. The school-side observation should accurately describe what the participant encountered and route the implementation question to a qualified reviewer. Clear task evidence and technical evaluation complement one another.`],
  ['Observe navigation without hiding the difficulty', `Ask the participant to follow the agreed task using their normal method where the practice setup supports it. Note where they lose orientation, cannot find the next relevant action or need an explanation not present in the interface. Record the point of difficulty rather than immediately giving the correct route.

W3C's preliminary checks include keyboard access and visible focus. Where the review includes those checks, use the official guidance and appropriate expertise rather than assuming that one successful key press demonstrates complete keyboard support. Keep a precise record of which controls and task steps were examined.

If assistance is necessary to continue, record it. A task completed after a facilitator explains an unlabeled control is not equivalent to a task completed independently. The report should preserve that distinction so the provider understands the barrier instead of seeing only a final success mark.`],
  ['Check readable presentation under the agreed viewing conditions', `Review the task under the viewing conditions relevant to the participants and the agreed scope. W3C's preliminary material includes resizing text as one limited check. Observe whether important instructions remain available and whether the user can still understand the task after the supported adjustment.

Describe concrete problems, such as a field instruction becoming obscured or a required action no longer being visible in the reviewed view. Do not infer the technical cause from appearance alone. A qualified reviewer can investigate whether the issue arises from layout, content or another implementation detail.

Avoid declaring the whole application accessible because one page remained readable. Different forms, dialogs and reports can behave differently. Record the page, role and condition checked, and include important untested tasks in the follow-up scope. A bounded observation is more useful than a broad claim that the evidence cannot support.`],
  ['Review the meaning of success and error feedback', `W3C's notification guidance recommends clear feedback about whether a submission succeeded or encountered errors, with understandable instructions for resolving problems. In a school workflow, that feedback helps users know whether to wait, correct an entry or seek help.

Use a safe practice case to observe both an ordinary completion and a relevant validation problem when the environment permits it. Ask what the participant believes happened. A green indicator or disappearing form may not communicate enough if the person cannot tell whether the intended record was saved.

Record the wording and location of the feedback, together with the task outcome the user understood. Leave technical questions about how assistive technologies receive that feedback to the appropriate review. The school can still provide valuable evidence by showing that the message was unclear or that the participant could not identify the next supported action.`],
  ['Worked example: correcting a practice contact form', `In a fictional review, a participant is asked to update a contact preference in a practice parent account. The form contains a field whose purpose is unclear, and the participant enters a value in the wrong place. On submission, a short error appears without explaining which entry needs attention.

The facilitator records the task, the field and the participant's interpretation. They do not mark the task as successful merely because the participant eventually finishes after verbal coaching. The report separates two findings: unclear identification of the input and insufficiently useful feedback after the practice submission.

The provider receives the fictional reproduction steps and the relevant observations. A qualified reviewer examines the implementation, and the school later repeats the task with the agreed corrected version. The follow-up checks whether the participant can understand the field and recover from the validation problem without the missing explanation being supplied by the facilitator.`],
  ['Separate usability observations from technical conclusions', `A participant's difficulty is important evidence, but it does not automatically identify a particular standards failure. Record the observed barrier and the conditions under which it occurred. The technical assessment can then determine the relevant implementation issue and applicable criterion.

Likewise, an automated tool result should not be presented as a complete account of the user's experience. The school may have observations that need further investigation even when a limited automated check reports no issue. Keep the different types of evidence distinguishable in the report.

Use careful language for conclusions. “The participant could not identify the submit action in this task” is specific. “The entire system is unusable” is much broader and may not follow from the exercise. A precise report makes it easier to address the actual problem without understating the effect on the affected task.`],
  ['Record barriers with an actionable evidence structure', `For each finding, include the task, role, page or step, expected outcome, observed barrier and any assistance needed. Add the relevant environment information without collecting unnecessary personal details. This structure helps the provider reproduce and investigate the issue.

Explain the operational consequence. A problem that prevents a parent from retrieving a notice has a different effect from a confusing label that the user can work around after reading an existing instruction. Both can deserve attention, but the report should describe their consequences accurately.

Assign a school-side owner to coordinate follow-up. Avoid leaving findings in an unreviewed presentation after the session ends. The owner can track the provider's response, request clarification and organise a retest when a change is available. The evidence is useful only if it reaches a process capable of acting on it.`],
  ['Plan alternatives without treating them as proof of accessibility', `A school may need an approved alternative route while a barrier is investigated. Identify who provides that assistance and how the user can access it without repeatedly explaining the same problem. The arrangement should support the person's task while the underlying issue remains visible.

Do not describe the existence of an alternative as proof that the original interface has no problem. A telephone or office-based route may help in a particular situation, but it is not the same as the user independently completing the intended digital task.

Keep the alternative's scope and review point explicit. Staff need to know when it applies and who follows up on the original finding. Otherwise a temporary arrangement can become permanent by accident, leaving the school unaware that a digital barrier continues to affect users long after the initial review.`],
  ['Prioritise follow-up around blocked tasks and affected users', `Discuss the findings with the relevant school and technical owners. Identify which issues prevent task completion, which create a significant risk of misunderstanding and which need more evidence. Use the observed consequences rather than the visual size of the problem to guide the discussion.

Avoid ranking participants or groups by convenience. A barrier affecting a less frequently used route can still prevent an essential task. The review should preserve the actual need even when the number of observed cases is small.

Record the agreed next step for each finding: investigation, clarification, correction or further testing. A priority label alone is not an action plan. Keep ownership and the next review point visible so the school can distinguish an issue being investigated from one that has merely been acknowledged.`],
  ['Retest the original task after a proposed correction', `When a correction is available, return to the task and conditions that revealed the barrier. Confirm the relevant version and role. A changed screenshot is not enough if the user still cannot complete the action or understand the result.

Record what improved and what remains difficult. A fix may address the field label while leaving the error feedback unclear. Treat partial improvement accurately rather than closing the entire finding because one element changed.

Where a broader technical assessment is needed, arrange it through the responsible team. The school-led retest can confirm observations within its scope, but it should not claim comprehensive conformance from a small exercise. Keep the final statement aligned with the evidence collected and the expertise involved in the review.`],
  ['Carry useful findings into training and procurement questions', `Some observations may improve the school's instructions or training materials even when a technical change is also needed. Update guidance carefully, using the corrected and verified workflow rather than teaching users to depend on an unexplained workaround indefinitely.

Use the experience to prepare clearer questions for future demonstrations. Ask to see important tasks under the conditions relevant to your users and request evidence about the provider's accessibility evaluation. Do not substitute a general marketing statement for an assessment of the actual product and configuration being considered.

Keep the review record available to the authorised people responsible for future changes. If a later release alters the same form, the school can revisit the relevant task instead of starting from an empty checklist. The aim is ongoing attention to real barriers, not a one-time label attached to the product.`],
  ['A responsible first-review conclusion', `A useful conclusion states which tasks, roles and conditions were reviewed, what barriers were observed and which follow-up actions remain. It also states what was not assessed. That makes the report credible and usable without implying a certification it cannot provide.

For a Schoolment demonstration, use fictional examples from your school's important journeys and confirm the review arrangements with the provider. Keep observations, technical findings and commercial claims separate. No claim of full accessibility should be inferred from the checklist in this article.

The practical objective is to discover where users cannot understand or complete necessary work, provide an appropriate interim route and obtain verified improvements. A careful first review is valuable because it produces specific evidence and clear ownership, while recognising that comprehensive accessibility evaluation requires a broader, qualified assessment.`],
];
