export default [
  ['Introduction', `A software release note describes changes made by a product team, but it does not automatically tell a school which staff instructions need updating. A change to a fee form may matter to accounts immediately, while an improvement to an unused module may need no operational action. The school needs a small review process that translates release information into relevant work.

Release-note triage means identifying affected tasks, checking the actual availability of the change and assigning any verification or communication required. It is not a reason to test every screen after every announcement. It is a way to avoid both extremes: ignoring a consequential change and creating unnecessary disruption around an irrelevant one.

This guide proposes an administrative procedure using fictional examples. Follow the update and support arrangements that apply to your deployment. Do not assume that a published announcement means a feature is already enabled for your school, or that every deployment follows the same release schedule.`],
  ['Identify the source and applicable version', `Begin with release information received through the provider's recognised channel. Record the publication reference, date and version or deployment identifier if one is supplied. Keep an informal discussion distinguishable from an official statement about what changed.

Confirm whether the information applies to the school's environment. A notice may describe a staged rollout, an optional capability or a different edition. If applicability is unclear, ask the authorised provider contact before changing staff instructions. A feature mentioned in a general announcement should not become a promise to users without that confirmation.

Preserve the original reference in the school's review record. A copied summary can lose qualifications that matter later, such as a prerequisite or a limitation. The operational note should explain the school's interpretation while allowing the responsible reviewer to return to the source when a question arises.`],
  ['Translate features into affected tasks', `Read each relevant change in terms of the work staff perform. “Updated payment allocation interface” may affect how accounts selects an existing demand, verifies an amount or checks the saved result. Identify that task rather than forwarding a technical phrase and expecting everyone to interpret it independently.

Name the role that owns the task and the normal completion condition. This makes it easier to ask the right person to review the change. A system administrator may confirm availability, while an accounts user is better placed to judge whether the revised instruction is understandable during ordinary work.

Record when no current task is affected. That is a legitimate triage outcome, not evidence that the notice was ignored. A concise explanation such as “module not enabled in the current school configuration” prevents the same item from being repeatedly rediscovered without adding value.`],
  ['Classify the operational response', `Use a few practical categories: information only, instruction update, controlled verification, configuration decision and provider clarification. The category should describe what the school needs to do next, not simply whether the announcement sounds important.

A wording change may require an operating-guide screenshot to be replaced. A changed approval path may require a representative task to be checked. An optional setting may require an authorised decision before anyone enables it. Keep these responses distinct so routine notices do not all become urgent testing projects.

Allow more than one action where necessary, but assign an owner to each. If a change needs both configuration review and staff communication, identify their sequence. Sending instructions before the configuration decision is made can leave users looking for a control that is not available in their environment.`],
  ['Check whether a changed label alters the instruction', `A new label can be a minor presentation change or a signal that the underlying task now behaves differently. Compare the release description with the actual supported workflow. Do not assume that the old instructions remain correct merely because the button occupies the same position.

Review the wording used in the school's guide. An instruction such as “select the blue button at the bottom” is fragile even without a release. Replace it with the task and control name where practical, then verify that the updated wording matches the screen available to the intended role.

If the meaning of a label is unclear, record the question for the provider instead of inventing a definition. Staff need to know what outcome the action produces. A tidy screenshot cannot compensate for an instruction that describes the wrong result or omits a new confirmation step.`],
  ['Distinguish a defect fix from a new operating rule', `A release may correct behaviour that differed from the intended process. That does not necessarily mean the school should change its policy or adopt a new rule. Establish what was corrected and whether the school's existing instructions had been built around a workaround.

If staff used an approved temporary process during an incident, review whether that process is still necessary after the fix is verified. Do not remove it solely because a release note says the issue is resolved; confirm the relevant outcome in the school's supported environment.

Keep any follow-up on earlier records separate. Correcting future behaviour does not prove that previously affected records were repaired. Ask the responsible team whether the release requires an operational reconciliation and record that work explicitly. Technical correction, historical cleanup and staff instruction changes can be related without being the same task.`],
  ['Select a small, meaningful verification case', `For a change that warrants testing, define the expected result and choose an authorised representative case. A safe practice environment or fictional record is preferable when the action would otherwise change live information. Follow the provider's supported test arrangements rather than improvising a production experiment.

Include the role and relevant starting state. A changed approval action may behave differently for the person preparing a record and the person approving it. A test performed only with a broad administrator account may not answer whether ordinary staff can complete their work.

Avoid testing unrelated functions simply to increase the checklist size. The case should answer the operational question raised by the change. If the result suggests a wider problem, expand the investigation with an explicit reason. Focused verification produces clearer evidence than a long sequence of unrecorded clicks.`],
  ['Record expected and observed outcomes separately', `Before performing the check, write what the school expects to happen based on the supported description. Afterwards, record what actually happened. This prevents the test from being redefined after the result is seen so that any outcome can be described as a pass.

Include the version or deployment context, role, time and relevant practice reference. Capture only the evidence needed to explain the result, following the school's access and information-sharing procedures. A screenshot can support the record but should not replace a written explanation of what was verified.

If the outcome differs, preserve the distinction between observation and diagnosis. “The approval option was not available to the reviewer role” is an observation. “The permissions system is broken” is a conclusion that may require investigation. Clear evidence helps the provider respond to the actual issue.`],
  ['Worked example: a revised fee-entry instruction', `In a fictional release, the provider announces a clearer confirmation step for an existing fee-entry workflow. The school confirms that the change applies to its environment and asks the accounts owner to review the relevant task using an authorised practice case.

The old guide says that selecting Save completes the entry. The revised workflow presents a review step before final submission. The accounts reviewer checks the displayed details and verifies the resulting practice record through the supported process. The guide is updated to distinguish reviewing the entry from submitting it.

The team then communicates the specific change to accounts staff. It does not describe the release as introducing a new school fee policy or promise that every related issue is resolved. If earlier live records were affected by a separate incident, that reconciliation remains tracked independently. The release review changes the instruction that actually changed and leaves unrelated decisions with their proper owners.`],
  ['Evaluate optional settings before enabling them', `An optional feature can require a school decision even when the software makes it easy to switch on. Identify the intended benefit, affected users and responsibilities before requesting activation. The release note is a description of availability, not approval to change the school's process.

Ask whether prerequisites, training or communication are needed. An optional reminder setting, for example, may depend on approved wording, recipient selection and timing. The school should confirm those decisions rather than allowing a convenient default to become an accidental operating policy.

Record the authorised decision and the implementation owner. If the setting is not enabled, state why and whether it will be reviewed later. A clear deferred decision is better than leaving staff uncertain about whether a feature is unavailable, overlooked or intentionally not adopted.`],
  ['Prepare a staff update that explains the practical difference', `A staff update should answer three questions: what changed in the task, what the user should do now and where to find help. Avoid forwarding a long release note without identifying the part relevant to the recipient's role.

Use a before-and-after explanation where useful. For example, explain that a review step now appears before final submission and that the old instruction has been replaced. Keep the message grounded in the verified workflow rather than promising improvements that were not tested.

Give the effective context clearly. If the change is available only after a planned deployment or configuration step, do not imply it is already visible. Staff should not spend time searching for an option that has not reached their account. Coordinate the communication with the person who confirms availability.`],
  ['Update training material without leaving conflicting copies', `Find the operating guides, quick-reference sheets and training examples affected by the change. Update the authoritative version and handle earlier copies through the school's document process. A corrected central guide is less useful if a widely shared screenshot still gives the old instruction.

Focus the revision on the changed task. Keep the purpose, prerequisites and completion condition visible so the guide does not become a collection of screen images with no explanation. Where the interface changed but the decision rule did not, say so.

Ask someone in the intended role to follow the revised instruction with an appropriate practice case. This checks whether the guide relies on knowledge held only by its author. The review is particularly useful when a new confirmation or exception step could be missed by staff accustomed to the previous sequence.`],
  ['Collect early feedback with a clear reporting route', `After the relevant staff begin using the change, provide a route for reporting confusion or unexpected outcomes. Ask for the task, role, observed result and relevant reference rather than a general statement that the update is bad.

Separate training questions from reproducible failures and new requests. A user asking where a renamed option moved may need an instruction, while a record saving incorrectly needs investigation. A suggestion for an additional feature should not automatically be treated as a defect introduced by the release.

Keep related observations connected to the original review where appropriate. This helps the school understand whether an issue is widespread or limited to a particular condition. Do not repeatedly ask users to retry consequential actions in production just to gather more examples. Use the authorised support process when further investigation is needed.`],
  ['Close review actions with evidence rather than a calendar date', `A release-review item is complete when its assigned response has been carried out. For information-only items, that may be a documented applicability decision. For a changed workflow, it may require verification, guide revision and staff communication. The closure condition should match the action category.

Do not close everything because the release has been available for a week. An unanswered provider question or unfinished training update remains open regardless of the age of the announcement. Record the next owner and review point for unresolved work.

Preserve the evidence supporting closure without retaining unnecessary private material. A concise record of what was tested and which guide version changed is usually more useful than an unlabelled folder of screenshots. The school should be able to explain its response if the same question arises later.`],
  ['Build a manageable review rhythm', `Choose a review rhythm suited to the actual release and deployment arrangements. The school may receive several notices before a local update or use a service where changes become available more regularly. Confirm the situation instead of assuming a universal monthly schedule.

Assign a coordinator to gather relevant notices and route them to task owners. The coordinator does not need to be the expert in every department. Their role is to prevent announcements from being lost and to ensure that affected work has an appropriate reviewer.

Review whether the process itself is creating unnecessary effort. If staff are repeatedly checking changes to modules the school does not use, improve applicability triage. If consequential changes are discovered only after users struggle, improve ownership and communication. The objective is proportionate attention, not the largest possible release checklist.`],
  ['A final release-note review checklist', `For each relevant announcement, confirm its source, applicability and affected school task. Identify whether the response is information, an instruction change, verification, a configuration decision or provider clarification. Keep the expected outcome distinct from the observed result.

Before communicating a change, confirm availability and update the authoritative instructions. Afterward, collect specific feedback and keep unresolved questions owned. Separate technical fixes from historical record cleanup and from new policy decisions.

When using Schoolment or another school platform, agree on the release-information and support routes that apply to your deployment. A dependable school response does not require every employee to interpret technical announcements. It requires a clear path from the provider's description to the small number of verified actions that keep staff instructions accurate.`],
];
