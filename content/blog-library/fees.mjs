export default [
  {
    slug: 'school-fee-collection-calendar', title: 'Fee Collection Calendar: Separate Generation, Due and Review Dates',
    description: 'Build a fee calendar that distinguishes billing dates, payment deadlines, reminder dates and accounts reviews.',
    sections: [
      ['Introduction', `A recurring fee has more than one important date. Generation creates the demand, the due date sets the payment deadline, and the review date gives accounts time to investigate exceptions. Treating all three as the first day of the month leaves little room to correct a failed run or answer a parent's question.`],
      ['Work backwards from the deadline', `Start with the approved payment window. Identify when demands must be ready, when families receive the information and when accounts checks the generated records. Keep weekends, holidays and the school's communication schedule visible. A reminder date should follow the approved collection policy, not an arbitrary default.\n\nName an owner for each checkpoint. “Fees run on the fifth” is incomplete unless someone checks whether the expected students were billed. Add a review of outstanding exceptions before the deadline, including disputed amounts and payments awaiting allocation.`],
      ['An illustrative monthly calendar', `A school generates demands on the fifth, reviews the run on the sixth and uses the fifteenth as the deadline. A courtesy message is planned before that deadline. If generation is delayed, accounts checks the actual demands and communicates any approved adjustment. Staff should not silently shorten the parent's payment window to preserve a calendar label.`],
      ['Keep the calendar operational', `Record completed reviews and unresolved issues beside planned dates. Before repeating the cycle, check changes in class membership, fee structures and approved exceptions. Publish the family-facing dates separately from internal review tasks. Parents need clear deadlines; staff also need the checks that make those deadlines dependable.`],
    ],
  },
  {
    slug: 'fee-structure-overlap-review', title: 'Overlapping Fee Structures: Test Which Amount Applies to Each Student Group',
    description: 'Use a small match matrix to review class-specific and residential fee rules before creating demands.',
    sections: [
      ['Introduction', `A school can have an all-class fee and a more specific amount for a particular class or residential group. The difficulty is not entering these rules; it is understanding which rule will apply when several appear to match. Test representative students before generating a large batch.`],
      ['Create a match matrix', `List the academic year, fee head, class scope, residential scope, amount and effective period for each rule. Then select one representative case for every combination that should behave differently. Include at least one case that has no valid structure.\n\nWrite the expected selected rule before using a lookup screen. Compare the actual result with that expectation. If two rules have the same intended specificity, resolve the ambiguity rather than relying on whichever record was created first. Keep the approved matrix with the fee schedule so later edits can be checked against it.`],
      ['Example: a specific residential amount', `An illustrative transport charge applies to all classes, while a separate arrangement applies to a particular group. Test a student inside that group, another outside it and a record with missing group information. Confirm the school's intended treatment for the incomplete record. Guessing a default amount can create a demand that is difficult to explain later.`],
      ['Recheck when the scope changes', `Repeat the matrix after adding a class, changing residential categories or starting another academic year. Review the selected amount and due-date rule together. A correct amount with an outdated deadline is still an incorrect outcome. Keep manual overrides visible so they do not hide a configuration problem affecting other students.`],
    ],
  },
  {
    slug: 'fee-reminder-suppression-checklist', title: 'Fee Reminder Suppression: Check Payments and Disputes Before Sending',
    description: 'A pre-send review for settled balances, recent payments, disputed demands and unreachable parent contacts.',
    sections: [
      ['Introduction', `An overdue message can damage trust when a parent has already paid or is waiting for the school to resolve a query. A reminder list should reflect the latest eligible balance, not simply repeat last week's export. Give accounts a way to identify records that need investigation before another message is sent.`],
      ['Review the reason for inclusion', `For each selected fee, check the remaining balance, due date and payment status. Distinguish a genuinely outstanding amount from a recent payment awaiting allocation. If the school's policy allows a reminder hold for a disputed demand, record its reason, owner and review date.\n\nContact quality matters too. An undelivered message is not a completed follow-up. Correct outdated contacts through the authorised parent-record process and avoid forwarding detailed fee information to an unverified number supplied casually in a message.`],
      ['Example: payment received after the list was prepared', `Accounts prepares a reminder queue in the morning. A payment is recorded before the afternoon send. Recheck eligibility at send time or regenerate the queue so the settled demand is excluded. If the payment is partial, the message should reflect the remaining amount under the school's approved communication wording.`],
      ['Measure useful follow-up', `Record delivery and response outcomes separately. Review suppressed records so temporary holds do not become permanent omissions. Sample messages against the fee records that produced them. The aim is an accurate conversation about the balance, with an easy route for families to raise a discrepancy.`],
    ],
  },
  {
    slug: 'unallocated-school-fee-payments', title: 'Unallocated Fee Payments: Resolve Money That Has No Matching Demand',
    description: 'An exception workflow for school payments with missing references, unclear student identity or unmatched amounts.',
    sections: [
      ['Introduction', `A payment can reach the school's bank or payment provider before accounts knows which student or demand it belongs to. Leaving it in a general spreadsheet creates a second, unofficial ledger. Use an exception register that preserves the transaction reference and makes the unresolved allocation visible.`],
      ['Keep receipt evidence separate from allocation', `Record the payment reference, amount, received date, channel and available payer information. Assign an investigator and describe what is missing. Do not create a second payment merely to make a student balance look correct. The allocation should eventually point back to the original transaction.\n\nSearch possible matches using multiple fields. A familiar surname or matching amount is not enough when many families pay the same fee. Ask for information through the school's verified contact route and retain the basis on which the payment was assigned.`],
      ['Worked exception', `A bank credit of ₹5,000 has a reference but no student identifier. Two students owe that amount. Accounts contacts the relevant verified family after reviewing available evidence and confirms the intended demand. The allocation record shows the original reference, the selected fee and the reviewer. The other student's balance remains unchanged.`],
      ['Close the reconciliation loop', `At daily review, reconcile allocated payments and unresolved credits to the total received. Age the exception queue so older cases are investigated. If a payment was allocated incorrectly, use the approved correction process while preserving its history. Closing an exception should explain where the money went, not simply remove it from a list.`],
    ],
  },
  {
    slug: 'fee-concession-approval-record', title: 'Fee Concession Records: Separate an Approved Adjustment From a Payment',
    description: 'Document the amount, scope and approval of a school fee concession without confusing it with money collected.',
    sections: [
      ['Introduction', `A concession changes what a family is required to pay; it is not a payment the school has received. Mixing the two can make a collection report appear healthier than the bank reconciliation. Keep the approved adjustment, the original charge and actual payments distinguishable in the record.`],
      ['Define the scope of approval', `Record the student, academic year, fee head, amount or calculation basis, applicable period and authorised approver. A one-term decision should not silently carry into the following year. If the concession is conditional, identify who checks the condition and when.\n\nUse the school's approved policy to decide eligibility. Staff entering the adjustment should be able to find the approval without needing access to unnecessary personal background. Keep sensitive supporting material in its restricted location and reference the decision from the fee record.`],
      ['An illustrative balance', `A demand is ₹10,000, an approved concession reduces it by ₹1,000 and the family pays ₹6,000. The remaining obligation is ₹3,000, while money collected is ₹6,000. Reports should make both facts clear. Entering the concession as a ₹1,000 payment would obscure the difference between an adjustment and a receipt.`],
      ['Review continuation deliberately', `Before the next billing cycle, check whether the approval still applies and whether its scope matches the new demand. Sample concessions against approvals during the accounts review. Corrections should retain the original decision and the reason for change, so staff can explain the balance consistently to the family.`],
    ],
  },
  {
    slug: 'school-fee-receipt-correction-workflow', title: 'Fee Receipt Corrections: Preserve the Original Transaction History',
    description: 'A school accounts workflow for correcting receipt details while retaining references, approvals and parent communication.',
    sections: [
      ['Introduction', `A receipt may show a wrong student reference, an incorrect description or a payment entered against the wrong demand. These are different errors. Before correcting a document, establish whether the underlying payment is correct. Editing a printable label cannot resolve an incorrect allocation in the accounts record.`],
      ['Classify the correction first', `Record the original receipt number, transaction reference, reported issue and proposed correction. Determine whether the change affects presentation, allocation or the amount received. Use the school's authorised correction method and approval requirements for that category.\n\nPreserve the relationship between the old and corrected record. A family may have already downloaded or submitted the earlier receipt. Staff need to explain which document is current without pretending the earlier version never existed. Avoid independently editing a PDF while leaving the system record unchanged.`],
      ['Example: correct payment, wrong demand', `A payment was received from the correct family but assigned to an activity fee instead of tuition. Accounts verifies the intended allocation, records the approval and uses the supported correction process. Both affected balances are checked afterwards. A revised receipt alone would be insufficient if the activity fee still appeared paid and tuition still appeared outstanding.`],
      ['Verify the result in three places', `Check the student's balance, the receipt history and the reconciliation total. The correction should not create extra money collected. Notify the family through the normal channel and explain the replacement document where needed. Keep the reason concise enough that another accounts officer can reconstruct the event months later.`],
    ],
  },
  {
    slug: 'school-fee-follow-up-priority-queue', title: 'Fee Follow-Up Priorities: Separate Overdue Balances From Unresolved Queries',
    description: 'Organise outstanding fees by age, payment evidence and next action for a more useful school accounts queue.',
    sections: [
      ['Introduction', `A single list sorted by the largest balance can hide urgent queries and recently received payments. Accounts needs to know why a balance is open and what action is appropriate next. Build the follow-up queue around the state of the record, while applying the school's approved collection policy consistently.`],
      ['Create distinct working groups', `Separate overdue demands ready for contact, promised payments awaiting the agreed date, payments awaiting allocation and records under authorised review. Record a next action and owner in each group. Do not use a temporary note such as “parent spoken to” as a permanent reason to stop reviewing the balance.\n\nShow ageing from the relevant due date, but keep the latest contact and payment information alongside it. A demand can be old while its dispute is new. The person making the call should understand both facts before contacting the family.`],
      ['Example: three balances with different actions', `One family has no recorded response, another has supplied a payment reference, and a third has an approved review appointment. The first may need a reminder, the second needs reconciliation and the third needs the promised review. Sending an identical overdue message to all three creates avoidable work and an inconsistent parent experience.`],
      ["Review commitments at day's end", `Compare actions due with actions completed, and carry unresolved work forward with a clear reason. Keep staff notes factual and respectful. Leaders should be able to see outstanding amounts and unresolved administrative issues separately, so a collection problem is not confused with a record-correction backlog.`],
    ],
  },
  {
    slug: 'school-payment-channel-reconciliation-matrix', title: 'Payment Channels: Define What Evidence Confirms Each School Fee Receipt',
    description: 'Map online, bank and counter payments to their confirmation evidence and daily reconciliation owner.',
    sections: [
      ['Introduction', `Different payment channels produce different evidence. A parent screenshot, a successful provider transaction and a bank settlement entry are not interchangeable records. Accounts should agree what each item proves and how it connects to the fee demand before offering another payment option.`],
      ['Build a channel-by-channel matrix', `For each channel, identify the initial payment reference, the confirmation source, the expected reporting delay and the reconciliation owner. Record how reversals or failed attempts appear. Keep the payment attempt separate from the final confirmed outcome so an interrupted checkout does not automatically become a receipt.\n\nFor counter payments, document who records the amount and how the day's receipts are checked against the accepted funds. For bank transfers, identify the evidence required to allocate a credit to a student. The matrix should describe the school's actual process, not assume every channel behaves like the online gateway.`],
      ['Example: an online attempt with an unclear result', `A parent reaches an error page after authorising payment. Staff should look up the transaction using its reference and confirmed provider information before requesting another attempt. If a second payment already exists, follow the school's approved duplicate-payment handling process. Do not infer failure solely from what the browser displayed.`],
      ['Keep the parent instruction specific', `Explain what reference families should retain and where they can report an unresolved payment. Avoid requesting sensitive payment credentials. Review channel-specific exceptions after the first billing cycle; the unresolved cases will show which instructions or reconciliation steps need improvement.`],
    ],
  },
  {
    slug: 'school-refund-status-register', title: 'School Fee Refunds: Track Request, Approval and Completion Separately',
    description: 'Create a refund status register that distinguishes requests, approvals, payment execution and parent confirmation.',
    sections: [
      ['Introduction', `A refund request is not the same as an approved refund, and approval is not proof that funds have been sent. A clear register helps the school answer families accurately while applying its own approved refund policy. It also prevents an old request from being paid again because its completion was never recorded.`],
      ['Link the request to the original payment', `Record the student, original receipt or transaction reference, requested amount, reason, decision owner and current status. Identify any previous refund against that payment. Eligibility and calculation belong to the school's policy and authorised review, not to an improvised rule in the register.\n\nAfter approval, track the amount authorised, the person executing it and the completion reference. Restrict changes to payment destination details and verify them through the school's established process. A message requesting a new destination should not bypass that review.`],
      ['Example: approval without completed transfer', `Accounts approves an illustrative refund on Monday, but the transfer is processed Wednesday. The family-facing status on Tuesday should say approved or awaiting processing, rather than completed. After execution, retain the reference and check how the original fee and payment records should be reflected under the approved accounting procedure.`],
      ['Review ageing by stage', `Measure time awaiting a decision separately from time awaiting execution. Investigate stalled approvals and failed transfers without creating a second request. Before closing the case, confirm the record shows what was approved, what was actually sent and what the family was told. Those distinctions make later reconciliation possible.`],
    ],
  },
  {
    slug: 'monthly-fee-generation-exception-checklist', title: 'After the Monthly Fee Run: Check Counts, Skips and Unexpected Demands',
    description: 'Review a scheduled fee run using expected student counts, sampled amounts, skipped records and due-date checks.',
    sections: [
      ['Introduction', `A successful scheduled command does not by itself establish that every fee demand is correct. Accounts still needs to compare the result with the intended student group and billing period. A short post-run check catches missing students, unexpected amounts and outdated dates before parents receive confusing information.`],
      ['Establish the expected population', `Before the run, identify the active students in scope and document exclusions or special arrangements. After it, compare that expectation with billed, skipped and failed records. A skip can be correct when a demand already exists, but it needs a reason that can be verified.\n\nSample students from each structure variant, including different classes or residential groups where those affect the amount. Check the fee head, academic year, billing period, amount and due date together. Review a recent joiner and a student whose status changed near the run date.`],
      ['Worked count review', `An illustrative scope contains 60 eligible students. The run creates 58 demands and skips two. If both skipped students already have the correct demand for that period, the count may reconcile. If one has only a previous month's demand, the explanation is incomplete. Investigate the specific record before rerunning the entire batch.`],
      ['Document the review outcome', `Keep unresolved cases with an owner and the action taken. After a correction or rerun, compare the same population again and check for duplicate demands. Mark the cycle reviewed only when exceptions are explained. This makes the next month's review faster because staff can distinguish recurring policy exceptions from new errors.`],
    ],
  },
];
