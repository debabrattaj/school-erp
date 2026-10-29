import admissionHandover from './expanded/admission-handover.mjs';
import admissionFollowUp from './expanded/admission-follow-up.mjs';
import admissionDocuments from './expanded/admission-documents.mjs';
import admissionsLongform from './expanded/admissions-longform.mjs';

export default [
  {
    slug: 'admission-counsellor-handover-checklist',
    title: 'Admission Counsellor Handover: Keep the Next Parent Callback Clear',
    description: 'A handover record for admission enquiries, promised callbacks, pending documents and counsellor leave cover.',
    sections: admissionHandover,
  },
  {
    slug: 'admission-enquiry-follow-up-process',
    title: 'Admission Enquiry Follow-Up: Build a Queue Around the Next Action',
    description: 'Turn unanswered enquiries, campus visits and application questions into a manageable admission follow-up queue.',
    sections: admissionFollowUp,
  },
  {
    slug: 'admission-document-exception-register',
    title: 'Admission Document Exceptions: Track What Is Missing and Who Can Clear It',
    description: 'A practical exception register for missing, unreadable or inconsistent admission documents, with review ownership.',
    sections: admissionDocuments,
  },
  {
    slug: 'accepted-applicant-to-student-handover',
    title: 'From Accepted Applicant to Student: The Enrolment Handover Checklist',
    description: 'Check student identity, class allocation, family access and opening fee records when an applicant becomes enrolled.',
    sections: [
      ['Introduction', `Admission approval and classroom readiness are different milestones. A child may have an accepted application but no confirmed section, parent account or joining instructions. Treat the move from applicant to student as a small handover with a defined completion condition. This reduces the chance of discovering missing setup at the school gate.`],
      ['Preserve identity while adding enrolment details', `Link the student record to the accepted application so corrected names and verified documents remain connected. Confirm the academic year, joining date, class and section independently; they answer different questions. Check whether a sibling already has an authorised family account before creating another parent identity.\n\nPass only the necessary information to each team. The class teacher needs classroom readiness details, while accounts needs the approved fee arrangement. Admissions should identify what was agreed rather than asking either team to reconstruct promises from conversations.`],
      ['Example: a mid-term joiner', `A student is accepted for Class 6 and joins after the monthly fee run. The handover should identify the actual joining date and ask accounts to apply the school's approved mid-term treatment. It should not silently copy another student's fees. The teacher also needs the joining date to distinguish pre-enrolment days from absence.`],
      ['Confirm readiness with the family', `Before marking the handover complete, check that the parent can receive the joining instructions and knows the reporting location. Verify class allocation and identify the contact for unresolved questions. Keep “approved”, “record created” and “ready to join” as separate outcomes if different teams own them; this makes unfinished work visible.`],
    ],
  },
  {
    slug: 'admission-source-tracking-without-double-counting',
    title: 'Admission Source Tracking Without Counting the Same Family Twice',
    description: 'Separate enquiry sources, returning visits and sibling applications when reviewing admission campaign results.',
    sections: [
      ['Introduction', `A parent might discover a school through a recommendation, fill in a website form and later call reception. Counting these as three new families inflates demand and makes campaign comparisons unreliable. Keep the enquiry identity separate from the contacts and channels through which the conversation develops.`],
      ['Define the unit before making the report', `Choose whether the report counts families, prospective students or applications. A sibling enquiry can represent one family and two potential admissions. Record an original discovery source and later contact channels in different fields. Do not overwrite the original source every time someone calls from another channel.\n\nPotential duplicates need human review. A shared phone number may belong to siblings, a guardian or an admission coordinator; it is a signal to investigate, not proof that two student enquiries are identical. Preserve the contact history when records are linked or consolidated.`],
      ['Worked example', `One parent submits enquiries for Classes 2 and 5, then books a campus visit by phone. A family-level report counts one family, an applicant-level report counts two prospective students, and a contact report includes the phone conversation. All three numbers can be correct when their units are stated. None should be labelled simply “leads” without a definition.`],
      ['Keep comparisons consistent', `Use the same reporting window and unit when comparing sources. Show incomplete source data rather than assigning it to the largest campaign. Review a sample of records before relying on conversion percentages. A small source with several qualified applications may deserve attention even if its raw contact volume is low.`],
    ],
  },
  {
    slug: 'admission-visit-slot-capacity-planning',
    title: 'Campus Visit Slots: Plan Capacity Before Admission Season Gets Busy',
    description: 'Set visit slot limits, arrival instructions and rescheduling rules that reception and counsellors can manage.',
    sections: [
      ['Introduction', `A campus visit uses several kinds of capacity: reception space, counsellor time and access to classrooms or facilities. A booking calendar that ignores these dependencies can look available while the school is already overloaded. Start with the experience the school can deliver well, then decide how many families fit each slot.`],
      ['Make the slot more than a date', `Define the visit duration, arrival window, meeting point, expected group size and staff owner. Keep additional time between visits where staff must write notes or move between buildings. Identify periods that cannot accept visitors because examinations or other activities take priority.\n\nSeparate requested bookings from confirmed slots. The confirmation should explain how to reschedule and whom to contact on arrival. If two staff members can change the calendar, use one shared capacity record so they cannot independently fill the same remaining place.`],
      ['Example: a Saturday morning queue', `Suppose two counsellors can each handle one family at a time. Four bookings at 10:00 do not become workable simply because each visit is short. Offer staggered arrivals or a clearly described group orientation followed by individual meetings. Record that arrangement in the confirmation so parents do not expect a private appointment immediately.`],
      ['Review the actual experience', `Track late arrivals, no-shows, reschedules and visits that started late. Do not treat a rescheduled visit as an additional new family. Compare planned and actual duration before increasing capacity. A smaller number of well-run appointments is easier to learn from than a crowded day with incomplete notes and forgotten follow-ups.`],
    ],
  },
  {
    slug: 'school-admission-statuses-explained',
    title: 'Admission Statuses: Define What Must Happen Before a Record Moves',
    description: 'Use observable admission milestones so counsellors, reviewers and school leaders interpret each status consistently.',
    sections: [
      ['Introduction', `An admission status should describe an event that has happened, not a staff member's level of optimism. Labels such as “hot” or “almost confirmed” are difficult to hand over. Observable milestones make the admission pipeline useful to the person managing the next step and the leader reviewing the season.`],
      ['Write an entry and exit rule for each stage', `An enquiry can enter “visit scheduled” only when a date is confirmed. “Application complete” should mean the school's required fields and documents are available for review, not that a form was opened. Keep review decisions separate from acceptance of an offer by the family.\n\nDocument who can move each stage and what evidence is expected. Allow a record to return to a previous stage when a correction is needed, but preserve why it moved back. Otherwise the report can show progress while the actual application remains unresolved.`],
      ['Example: an offer awaiting a response', `A school sends an offer and expects a response by an agreed date. The record is “offer sent”, not “enrolled”. If the family requests more time, record the revised response date without counting a new offer. Once the family confirms and the school's enrolment conditions are met, the record can move to the appropriate confirmed stage.`],
      ['Look for stalled transitions', `Review how long applications spend between milestones and sample unusual reversals. A long stay may indicate unclear instructions, missing capacity or a legitimate family decision. Avoid pressuring staff to change labels just to improve the chart. The value of the pipeline comes from its agreement with the underlying records.`],
    ],
  },
  {
    slug: 'admission-joining-instructions-template',
    title: 'Admission Joining Instructions: A Parent Message With Fewer Follow-Up Calls',
    description: 'Prepare clear first-day instructions covering reporting time, location, required items and unresolved questions.',
    sections: [
      ['Introduction', `An admission confirmation answers whether a place is available. Joining instructions answer what the family must actually do next. Combining every school policy into one long message can hide the details parents need on the first morning. Keep the immediate actions visible and link to longer guidance separately.`],
      ['Build the message around the journey', `Include the student's confirmed class, joining date, reporting time, entry point and contact person. State which items are needed on the first day and distinguish them from items that may be supplied later. Explain any arrival arrangement already agreed for transport or a campus visit.\n\nUse the same record to prepare instructions and to brief reception. If the parent receives one gate location while security has another list, the message has failed even though it was delivered. Assign one owner to approve revisions when the joining date changes.`],
      ['A sample structure to adapt', `“Your child's first day is [date]. Please arrive at [time] through [entry point] and meet [role/name]. Bring [specific items]. For a change to your arrival plan, contact [official channel]. We will send [later information] separately.” Replace every placeholder before sending. Check the information from a family's point of view, including whether the location is recognisable.`],
      ['Check receipt without over-messaging', `Ask for a simple acknowledgement where it helps arrival planning. Follow up on undelivered instructions and questions that remain open, rather than resending the same message to every family. After the first day, note which questions reception answered repeatedly; those questions reveal what the next version of the instructions should explain more clearly.`],
    ],
  },
  {
    slug: 'school-waitlist-management-guide',
    title: 'Admission Waitlists: Record Offers, Responses and Expiry Clearly',
    description: 'Maintain a traceable waitlist with available places, offer decisions, response dates and respectful family updates.',
    sections: [
      ['Introduction', `A waitlist becomes difficult to manage when availability changes faster than the records. Two staff members may contact different families about the same place, or an unanswered offer may hold capacity indefinitely. Use the school's approved selection policy to govern decisions, supported by an explicit offer and response record.`],
      ['Keep capacity and communication connected', `Record the relevant class or cohort, the decision owner, whether a place is available, and which offer is currently active. A family's position should not be inferred from the order of messages in a chat. Any priority rule belongs in the approved policy, not in an informal note that only one staff member understands.\n\nWhen a place is offered, record when the offer was sent, the response deadline agreed under policy and the outcome. Before contacting another family, confirm that the previous offer has been declined, expired appropriately or otherwise resolved.`],
      ['Example: an offer with a requested extension', `A family asks for two extra days to respond. The staff member should obtain the required approval and update the active offer's deadline. Leaving the old deadline in the register while verbally promising an extension risks offering the same place twice. The family and the admissions team should receive the same revised information.`],
      ['Close the season deliberately', `At the end of the admission cycle, communicate the status of unresolved applications under the school's policy. Separate withdrawn applications from unsuccessful offers and uncontactable families. Review duplicate active offers and unclear deadlines as process issues. A waitlist should provide an accurate history of decisions, not create a promise of admission that the school has not made.`],
    ],
  },
  {
    slug: 'admission-reporting-for-school-leaders',
    title: 'Admission Funnel Reporting: Calculate Conversion With a Clear Denominator',
    description: 'Define enquiry cohorts, conversion stages and reporting dates before comparing school admission performance.',
    sections: [
      ['Introduction', `Admission conversion can change simply because the report mixes different groups of families. Dividing this month's enrolments by this month's enquiries may combine older applications with brand-new contacts. A useful report tells the reader who is included, which event counts as conversion and how much decision time that group has had.`],
      ['Separate activity reports from cohort reports', `An activity report answers how many enquiries, visits or enrolments happened during a period. A cohort report follows a defined group, such as families who first enquired in April, and shows how many later reached each stage. Both views are useful, but their percentages answer different questions.\n\nKeep the reporting date visible and define exclusions, including duplicates and withdrawn records. When comparing classes, show the count alongside the rate. A percentage based on two applications should not carry the same weight as one based on a much larger group.`],
      ['Worked calculation', `An illustrative cohort contains 80 distinct student enquiries. Of those, 32 attend a visit and 20 eventually enrol. Enquiry-to-enrolment conversion is 20 divided by 80, or 25%. Visit-to-enrolment conversion for the same cohort is 20 divided by 32, or 62.5%, only if all 20 enrolments belong to the visiting group. Check that relationship before reporting it.`],
      ['Use the report to find a question', `A drop between application completion and review might indicate a processing delay. A drop after visits may call for a different investigation. Review representative records before deciding the cause. The dashboard should help leaders choose what to inspect, rather than turn a single percentage into a judgment about an entire team's work.`],
    ],
  },
].map((article) => admissionsLongform[article.slug] ? { ...article, sections: [...article.sections, ...admissionsLongform[article.slug]] } : article);
