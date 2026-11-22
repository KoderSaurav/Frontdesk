import { initDatabase, inMemoryStore } from '../src/db';
import {
  addWorkingMinutes,
  calculateInitialDeadlines,
  computeTicketSlaStatus,
  getElapsedWorkingMinutes,
  getNextWorkingTime,
  isAutoCloseEligible,
  isReopenEligible,
  recalculateDeadlinesOnPriorityChange,
} from '../src/services/slaEngine';
import {
  atomicAssignTicket,
  createTicket,
  addMessage,
  getTicketById,
  updateTicketPriority,
  updateTicketStatus,
  reassignTicket,
  releaseTicket,
  exportTicket,
  customerReopenTicket,
  checkAndAutoCloseInactiveTickets,
} from '../src/services/ticketService';
import { getAuditLogsForTicket } from '../src/services/auditService';
import { Holiday, Ticket } from '../src/types';

async function runComprehensiveTests() {
  console.log('====================================================');
  console.log('Running Complete System Verification Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, code: string, description: string) {
    if (condition) {
      console.log(`  [PASS] ${code}: ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${code}: ${description}`);
      failed++;
    }
  }

  await initDatabase();

  const testHolidays: Holiday[] = [
    { id: 1, date: '2026-11-23', name: 'Festival Holiday 1' },
    { id: 2, date: '2026-11-24', name: 'Festival Holiday 2' },
  ];

  // ==========================================
  // SECTION 1: Ticket Creation & Validation
  // ==========================================
  console.log('\n--- Category 1: Ticket Creation & Validation ---');

  // TC-01: Valid fields
  try {
    const t = await createTicket({
      customerName: 'Alice Morgan',
      customerEmail: 'alice@corp.io',
      subject: 'Valid Ticket Subject',
      description: 'System database connection timeout during batch export.',
      priority: 'MEDIUM',
    });
    assert(Boolean(t.id && t.ticket_number), 'TC-01', 'Create ticket with all valid fields succeeds');
    assert(t.status === 'OPEN', 'TC-01b', 'Initial status defaults to OPEN');
    assert(Boolean(t.created_at), 'TC-01c', 'Creation timestamp generated automatically');
  } catch (err: any) {
    assert(false, 'TC-01', err.message);
  }

  // TC-02: Missing subject
  try {
    await createTicket({
      customerName: 'Alice',
      customerEmail: 'alice@corp.io',
      subject: '',
      description: 'Desc',
    });
    assert(false, 'TC-02', 'Should reject empty subject');
  } catch (err: any) {
    assert(err.status === 400, 'TC-02', 'Create ticket without subject returns validation error (400)');
  }

  // TC-03: Missing description
  try {
    await createTicket({
      customerName: 'Alice',
      customerEmail: 'alice@corp.io',
      subject: 'Subject',
      description: '',
    });
    assert(false, 'TC-03', 'Should reject empty description');
  } catch (err: any) {
    assert(err.status === 400, 'TC-03', 'Create ticket without description returns validation error (400)');
  }

  // TC-04: Empty customer name
  try {
    await createTicket({
      customerName: '   ',
      customerEmail: 'alice@corp.io',
      subject: 'Subject',
      description: 'Desc',
    });
    assert(false, 'TC-04', 'Should reject whitespace customer name');
  } catch (err: any) {
    assert(err.status === 400, 'TC-04', 'Create ticket with empty customer name returns validation error (400)');
  }

  // TC-05: Missing priority applies documented default (MEDIUM)
  try {
    const t = await createTicket({
      customerName: 'Bob',
      customerEmail: 'bob@corp.io',
      subject: 'Missing Priority Test',
      description: 'Checking default priority.',
    });
    assert(t.priority === 'MEDIUM', 'TC-05', 'Create ticket with missing priority defaults to MEDIUM');
  } catch (err: any) {
    assert(false, 'TC-05', err.message);
  }

  // TC-06: Invalid priority rejected
  try {
    await createTicket({
      customerName: 'Bob',
      customerEmail: 'bob@corp.io',
      subject: 'Invalid Priority Test',
      description: 'Checking priority validation.',
      priority: 'CRITICAL' as any,
    });
    assert(false, 'TC-06', 'Should reject invalid priority');
  } catch (err: any) {
    assert(err.status === 400, 'TC-06', 'Create ticket with invalid priority is rejected (400)');
  }

  // TC-07: Unknown/forged status rejected
  try {
    await createTicket({
      customerName: 'Bob',
      customerEmail: 'bob@corp.io',
      subject: 'Forged Status Test',
      description: 'Desc',
      status: 'RESOLVED',
    });
    assert(false, 'TC-07', 'Should reject forged status on creation');
  } catch (err: any) {
    assert(err.status === 400, 'TC-07', 'Create ticket with forged status is rejected (400)');
  }

  // TC-08: Whitespace-only subject rejected
  try {
    await createTicket({
      customerName: 'Bob',
      customerEmail: 'bob@corp.io',
      subject: '    ',
      description: 'Desc',
    });
    assert(false, 'TC-08', 'Should reject whitespace subject');
  } catch (err: any) {
    assert(err.status === 400, 'TC-08', 'Submit whitespace-only subject is rejected (400)');
  }

  // TC-09: Very long description length enforcement
  try {
    const hugeDesc = 'A'.repeat(6000);
    await createTicket({
      customerName: 'Bob',
      customerEmail: 'bob@corp.io',
      subject: 'Long Description Test',
      description: hugeDesc,
    });
    assert(false, 'TC-09', 'Should reject overly long description');
  } catch (err: any) {
    assert(err.status === 400, 'TC-09', 'Enforce configured length limit on description (400)');
  }

  // TC-10: Accidental duplicate submission prevention
  try {
    await createTicket({
      customerName: 'Dave',
      customerEmail: 'dave@corp.io',
      subject: 'Identical Duplicate Issue',
      description: 'Payment issue.',
    });
    // Immediately attempt identical submission
    await createTicket({
      customerName: 'Dave',
      customerEmail: 'dave@corp.io',
      subject: 'Identical Duplicate Issue',
      description: 'Payment issue.',
    });
    assert(false, 'TC-10', 'Should reject duplicate submission within 60s');
  } catch (err: any) {
    assert(err.status === 409, 'TC-10', 'Accidental duplicate submission rejected with 409 Conflict');
  }

  // ==========================================
  // SECTION 2: Priority and SLA Testing
  // ==========================================
  console.log('\n--- Category 2: Priority and SLA Testing ---');

  // SLA-01: Urgent ticket (2 working hours response)
  {
    const baseTime = new Date(2026, 10, 16, 10, 0, 0); // Monday 10:00 AM
    const deadlines = calculateInitialDeadlines(baseTime, 'URGENT', []);
    const diffMins = (deadlines.responseDeadline.getTime() - baseTime.getTime()) / (60 * 1000);
    assert(diffMins === 120, 'SLA-01', 'Urgent ticket assigns 2-hour (120m) response deadline');
  }

  // SLA-02: Medium ticket (4.5 working hours response)
  {
    const baseTime = new Date(2026, 10, 16, 10, 0, 0); // Monday 10:00 AM
    const deadlines = calculateInitialDeadlines(baseTime, 'MEDIUM', []);
    const diffMins = (deadlines.responseDeadline.getTime() - baseTime.getTime()) / (60 * 1000);
    assert(diffMins === 270, 'SLA-02', 'Medium ticket assigns half-day (270m) response deadline');
  }

  // SLA-03: Low ticket (9 working hours response)
  {
    const baseTime = new Date(2026, 10, 16, 9, 30, 0); // Monday 9:30 AM
    const deadlines = calculateInitialDeadlines(baseTime, 'LOW', []);
    const diffMins = (deadlines.responseDeadline.getTime() - baseTime.getTime()) / (60 * 1000);
    assert(diffMins === 540, 'SLA-03', 'Low ticket assigns 1-day (540m) response deadline');
  }

  // SLA-04: Agent responds before deadline
  {
    const ticket: Ticket = {
      id: 50,
      ticket_number: 'INC-T50',
      customer_name: 'Test',
      customer_email: 't@t.com',
      subject: 'Test',
      description: 'Desc',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      response_deadline: new Date(2026, 10, 16, 12, 0, 0).toISOString(),
      resolution_deadline: new Date(2026, 10, 16, 18, 30, 0).toISOString(),
      first_response_at: new Date(2026, 10, 16, 11, 30, 0).toISOString(), // 30m before
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
      updated_at: new Date(2026, 10, 16, 11, 30, 0).toISOString(),
    };
    const status = computeTicketSlaStatus(ticket, []);
    assert(status.was_response_sla_breached === false, 'SLA-04', 'Agent responding before deadline meets SLA');
  }

  // SLA-05: Agent responds exactly at deadline (inclusive boundary)
  {
    const deadline = new Date(2026, 10, 16, 12, 0, 0);
    const ticket: Ticket = {
      id: 51,
      ticket_number: 'INC-T51',
      customer_name: 'Test',
      customer_email: 't@t.com',
      subject: 'Test',
      description: 'Desc',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      response_deadline: deadline.toISOString(),
      resolution_deadline: new Date(2026, 10, 16, 18, 30, 0).toISOString(),
      first_response_at: deadline.toISOString(), // Exactly on the second
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
      updated_at: deadline.toISOString(),
    };
    const status = computeTicketSlaStatus(ticket, []);
    assert(status.was_response_sla_breached === false, 'SLA-05', 'Agent responding exactly at deadline is inclusive (Met)');
  }

  // SLA-06: Agent responds after deadline
  {
    const ticket: Ticket = {
      id: 52,
      ticket_number: 'INC-T52',
      customer_name: 'Test',
      customer_email: 't@t.com',
      subject: 'Test',
      description: 'Desc',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      response_deadline: new Date(2026, 10, 16, 12, 0, 0).toISOString(),
      resolution_deadline: new Date(2026, 10, 16, 18, 30, 0).toISOString(),
      first_response_at: new Date(2026, 10, 16, 12, 10, 0).toISOString(), // 10m late
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
      updated_at: new Date(2026, 10, 16, 12, 10, 0).toISOString(),
    };
    const status = computeTicketSlaStatus(ticket, []);
    assert(status.was_response_sla_breached === true, 'SLA-06', 'Agent responding after deadline marked breached');
  }

  // SLA-07: No response after deadline
  {
    const ticket: Ticket = {
      id: 53,
      ticket_number: 'INC-T53',
      customer_name: 'Test',
      customer_email: 't@t.com',
      subject: 'Test',
      description: 'Desc',
      priority: 'URGENT',
      status: 'OPEN',
      response_deadline: new Date(2026, 10, 16, 12, 0, 0).toISOString(),
      resolution_deadline: new Date(2026, 10, 16, 18, 30, 0).toISOString(),
      first_response_at: null,
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
      updated_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
    };
    const now = new Date(2026, 10, 16, 12, 30, 0); // 12:30 PM
    const status = computeTicketSlaStatus(ticket, [], now);
    assert(status.is_response_overdue === true, 'SLA-07', 'No response past deadline marked overdue');
  }

  // SLA-08 & SLA-09: Resolution target evaluation
  {
    const ticketResolvedOnTime: Ticket = {
      id: 54,
      ticket_number: 'INC-T54',
      customer_name: 'Test',
      customer_email: 't@t.com',
      subject: 'Test',
      description: 'Desc',
      priority: 'URGENT',
      status: 'RESOLVED',
      response_deadline: new Date(2026, 10, 16, 12, 0, 0).toISOString(),
      resolution_deadline: new Date(2026, 10, 16, 18, 30, 0).toISOString(),
      resolved_at: new Date(2026, 10, 16, 17, 0, 0).toISOString(),
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
      updated_at: new Date(2026, 10, 16, 17, 0, 0).toISOString(),
    };
    const s1 = computeTicketSlaStatus(ticketResolvedOnTime, []);
    assert(s1.was_resolution_sla_breached === false, 'SLA-08', 'Ticket resolved within target meets SLA');

    const ticketResolvedLate: Ticket = {
      ...ticketResolvedOnTime,
      resolved_at: new Date(2026, 10, 17, 10, 0, 0).toISOString(), // Next day
    };
    const s2 = computeTicketSlaStatus(ticketResolvedLate, []);
    assert(s2.was_resolution_sla_breached === true, 'SLA-09', 'Ticket resolved after target marked breached');
  }

  // SLA-10 to SLA-14: Priority changes midway & preserving history
  {
    const originalTicket: Ticket = {
      id: 55,
      ticket_number: 'INC-T55',
      customer_name: 'Test',
      customer_email: 't@t.com',
      subject: 'Test',
      description: 'Desc',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      response_deadline: new Date(2026, 10, 16, 11, 30, 0).toISOString(), // 2h from 9:30
      resolution_deadline: new Date(2026, 10, 16, 18, 30, 0).toISOString(),
      first_response_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(), // Responded at 10:00
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 16, 9, 30, 0).toISOString(),
      updated_at: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
    };

    // Downgrade to Medium
    const recalc = recalculateDeadlinesOnPriorityChange(
      originalTicket,
      'MEDIUM',
      [],
      new Date(2026, 10, 16, 11, 0, 0)
    );
    assert(Boolean(recalc.resolutionDeadline), 'SLA-10', 'Urgent changed to medium recalculates resolution SLA');
    assert(
      recalc.responseDeadline.toISOString() === originalTicket.response_deadline,
      'SLA-13',
      'Priority changed after first response preserves response history and deadline'
    );
  }

  // SLA-15: Priority changed after resolution is rejected
  try {
    const resTicket = inMemoryStore.tickets.find((t) => t.id === 2);
    if (resTicket) {
      resTicket.status = 'RESOLVED';
      await updateTicketPriority({
        ticketId: resTicket.id,
        newPriority: 'URGENT',
        actorName: 'Agent',
        actorRole: 'AGENT',
      });
      assert(false, 'SLA-15', 'Should reject priority change on resolved ticket');
    }
  } catch (err: any) {
    assert(err.status === 400, 'SLA-15', 'Priority change on resolved ticket rejected (400)');
  }

  // ==========================================
  // SECTION 3: Working Hours, Weekends & Holidays
  // ==========================================
  console.log('\n--- Category 3: Working Hours, Weekends and Holidays ---');

  // WH-01: Ticket created Monday 10 AM -> timer starts immediately
  {
    const mon10am = new Date(2026, 10, 16, 10, 0, 0);
    const start = getNextWorkingTime(mon10am, []);
    assert(start.getTime() === mon10am.getTime(), 'WH-01', 'Ticket created Monday at 10 AM starts immediately');
  }

  // WH-02: Ticket created Monday 9 AM -> starts at 9:30 AM
  {
    const mon9am = new Date(2026, 10, 16, 9, 0, 0);
    const start = getNextWorkingTime(mon9am, []);
    assert(
      start.getHours() === 9 && start.getMinutes() === 30,
      'WH-02',
      'Ticket created Monday at 9 AM rolls forward to 9:30 AM'
    );
  }

  // WH-03: Ticket created exactly at 9:30 AM -> starts immediately
  {
    const mon930am = new Date(2026, 10, 16, 9, 30, 0);
    const start = getNextWorkingTime(mon930am, []);
    assert(start.getTime() === mon930am.getTime(), 'WH-03', 'Ticket created at 9:30 AM starts immediately');
  }

  // WH-04 & WH-05: Ticket created at 6:30 PM (18:30) or 7 PM (19:00) -> rolls to next day 9:30 AM
  {
    const mon630pm = new Date(2026, 10, 16, 18, 30, 0);
    const start1 = getNextWorkingTime(mon630pm, []);
    assert(
      start1.getDay() === 2 && start1.getHours() === 9 && start1.getMinutes() === 30,
      'WH-04',
      'Ticket created at 6:30 PM rolls to next working day 9:30 AM'
    );

    const mon7pm = new Date(2026, 10, 16, 19, 0, 0);
    const start2 = getNextWorkingTime(mon7pm, []);
    assert(
      start2.getDay() === 2 && start2.getHours() === 9 && start2.getMinutes() === 30,
      'WH-05',
      'Ticket created at 7 PM rolls to next working day 9:30 AM'
    );
  }

  // WH-06: Ticket created Friday at 6 PM (18:00) -> 30 mins count Friday, rolls to Monday 11:00 AM
  {
    const fri6pm = new Date(2026, 10, 20, 18, 0, 0);
    const deadlines = calculateInitialDeadlines(fri6pm, 'URGENT', []);
    const d = deadlines.responseDeadline;
    assert(
      d.getDay() === 1 && d.getHours() === 11 && d.getMinutes() === 0,
      'WH-06',
      'Friday 6 PM Urgent ticket yields Monday 11:00 AM deadline'
    );
  }

  // WH-07 & WH-08: Saturday/Sunday ticket creation
  {
    const sat = new Date(2026, 10, 21, 14, 0, 0);
    const sun = new Date(2026, 10, 22, 11, 0, 0);
    const startSat = getNextWorkingTime(sat, []);
    const startSun = getNextWorkingTime(sun, []);
    assert(
      startSat.getDay() === 1 && startSat.getHours() === 9 && startSat.getMinutes() === 30,
      'WH-07',
      'Saturday ticket creation starts Monday at 9:30 AM'
    );
    assert(
      startSun.getDay() === 1 && startSun.getHours() === 9 && startSun.getMinutes() === 30,
      'WH-08',
      'Sunday ticket creation starts Monday at 9:30 AM'
    );
  }

  // WH-09: Weekend hours excluded from elapsed calculation
  {
    const friClose = new Date(2026, 10, 20, 18, 30, 0);
    const monOpen = new Date(2026, 10, 23, 9, 30, 0);
    const elapsed = getElapsedWorkingMinutes(friClose, monOpen, []);
    assert(elapsed === 0, 'WH-09', 'Elapsed working time over weekend is exactly 0 minutes');
  }

  // WH-10: Spans festival holiday
  {
    const fri6pm = new Date(2026, 10, 20, 18, 0, 0);
    const deadlines = calculateInitialDeadlines(fri6pm, 'URGENT', [testHolidays[0]]); // Monday is holiday
    const d = deadlines.responseDeadline;
    assert(d.getDay() === 2 && d.getHours() === 11 && d.getMinutes() === 0, 'WH-10', 'Monday holiday rolls deadline to Tuesday 11:00 AM');
  }

  // WH-11: Festival holiday on Sunday does not cause double counting or negative time
  {
    const sundayHoliday: Holiday[] = [{ id: 99, date: '2026-11-22', name: 'Sunday Fest' }];
    const fri6pm = new Date(2026, 10, 20, 18, 0, 0);
    const deadlines = calculateInitialDeadlines(fri6pm, 'URGENT', sundayHoliday);
    const d = deadlines.responseDeadline;
    assert(d.getDay() === 1 && d.getHours() === 11 && d.getMinutes() === 0, 'WH-11', 'Holiday on Sunday causes no double counting; resumes Monday 9:30 AM');
  }

  // WH-12: Consecutive holidays (Monday and Tuesday)
  {
    const fri6pm = new Date(2026, 10, 20, 18, 0, 0);
    const deadlines = calculateInitialDeadlines(fri6pm, 'URGENT', testHolidays); // Mon & Tue holidays
    const d = deadlines.responseDeadline;
    assert(d.getDay() === 3 && d.getHours() === 11 && d.getMinutes() === 0, 'WH-12', 'Consecutive holidays roll timer to Wednesday 11:00 AM');
  }

  // WH-13: Deadline occurs during non-working hours normalized to working hours
  {
    const mon10am = new Date(2026, 10, 16, 10, 0, 0);
    // Add 8.5 working hours -> 10:00 to 18:30 is exactly 8.5 working hours (510 mins)
    const deadline = addWorkingMinutes(mon10am, 510, []);
    assert(deadline.getHours() === 18 && deadline.getMinutes() === 30, 'WH-13', 'Deadline end of day lands cleanly at 18:30');
  }

  // ==========================================
  // SECTION 4: Waiting for Customer Testing
  // ==========================================
  console.log('\n--- Category 4: Waiting-for-Customer Testing ---');

  // WC-01 to WC-04: Pausing, duration exclusion, and customer reply resumption
  {
    const t = inMemoryStore.tickets.find((x) => x.id === 1);
    if (t) {
      t.status = 'OPEN';
      t.sla_paused_at = null;
      t.total_paused_working_minutes = 0;

      // Agent pauses ticket
      await updateTicketStatus({
        ticketId: t.id,
        newStatus: 'WAITING_FOR_CUSTOMER',
        actorName: 'Agent',
        actorRole: 'AGENT',
      });
      const tPaused = (await getTicketById(t.id, true))!.ticket;
      assert(tPaused.status === 'WAITING_FOR_CUSTOMER', 'WC-01', 'Changing status to Waiting for Customer sets status');
      assert(Boolean(tPaused.sla_paused_at), 'WC-01b', 'SLA timer is paused with timestamp');

      // Customer replies -> resumes timer
      await addMessage({
        ticketId: t.id,
        senderName: 'Alex Rivera',
        senderRole: 'CUSTOMER',
        isInternal: false,
        content: 'Here is the payment confirmation screenshot.',
      });
      const tResumed = (await getTicketById(t.id, true))!.ticket;
      assert(tResumed.status === 'IN_PROGRESS', 'WC-04', 'Customer reply resumes ticket to IN_PROGRESS');
      assert(tResumed.sla_paused_at === null, 'WC-04b', 'Paused timestamp is cleared on resume');
    }
  }

  // WC-05: Agent resumes ticket without customer reply
  {
    const t = inMemoryStore.tickets.find((x) => x.id === 1);
    if (t) {
      t.status = 'WAITING_FOR_CUSTOMER';
      t.sla_paused_at = new Date(Date.now() - 3600000).toISOString(); // 1 hr ago

      await updateTicketStatus({
        ticketId: t.id,
        newStatus: 'IN_PROGRESS',
        actorName: 'Agent',
        actorRole: 'AGENT',
      });
      const tResumedManual = (await getTicketById(t.id, true))!.ticket;
      assert(tResumedManual.status === 'IN_PROGRESS', 'WC-05', 'Agent can manually resume ticket without customer reply');
      assert(tResumedManual.sla_paused_at === null, 'WC-05b', 'Paused timestamp cleared on manual resume');
    }
  }

  // WC-08: Inactivity auto-closure (>45 working hours)
  {
    const tWait: Ticket = {
      id: 88,
      ticket_number: 'INC-T88',
      customer_name: 'Test',
      customer_email: 't@t.com',
      subject: 'Auto close test',
      description: 'Desc',
      priority: 'LOW',
      status: 'WAITING_FOR_CUSTOMER',
      response_deadline: new Date().toISOString(),
      resolution_deadline: new Date().toISOString(),
      sla_paused_at: new Date(2026, 10, 2, 9, 30, 0).toISOString(), // 3 weeks ago
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 2, 9, 30, 0).toISOString(),
      updated_at: new Date(2026, 10, 2, 9, 30, 0).toISOString(),
    };
    const eligible = isAutoCloseEligible(tWait, [], new Date(2026, 10, 20, 18, 30, 0));
    assert(eligible === true, 'WC-08', 'Ticket waiting >= 1 working week is eligible for auto-closure');
  }

  // WC-10: Customer replying after closure rejected
  try {
    const t = inMemoryStore.tickets.find((x) => x.id === 1);
    if (t) {
      t.status = 'CLOSED';
      await addMessage({
        ticketId: t.id,
        senderName: 'Alex',
        senderRole: 'CUSTOMER',
        isInternal: false,
        content: 'Replying to closed ticket.',
      });
      assert(false, 'WC-10', 'Should reject customer reply to closed ticket');
    }
  } catch (err: any) {
    assert(err.status === 400, 'WC-10', 'Customer reply to closed ticket is rejected (400)');
  }

  // ==========================================
  // SECTION 5: Ticket Assignment & Concurrency
  // ==========================================
  console.log('\n--- Category 5: Ticket Assignment and Concurrency ---');

  // AS-01: Agent takes unassigned ticket
  {
    const newT = await createTicket({
      customerName: 'Sam',
      customerEmail: 'sam@test.com',
      subject: 'Claim Test Ticket',
      description: 'Desc',
    });
    const claimed = await atomicAssignTicket(newT.id, 2); // Rahul (ID 2)
    assert(claimed.assigned_to === 2, 'AS-01', 'Agent A claims unassigned ticket successfully');
  }

  // AS-02: Agent takes already assigned ticket (same agent calling assign twice)
  {
    const newT = inMemoryStore.tickets[0];
    const reClaim = await atomicAssignTicket(newT.id, 2); // Same agent
    assert(reClaim.assigned_to === 2, 'AS-02', 'Same agent taking ticket twice is handled idempotently');
  }

  // AS-03: Agent B takes Agent A's ticket -> Rejected with 409
  try {
    const newT = inMemoryStore.tickets[0];
    await atomicAssignTicket(newT.id, 3); // Sneha (ID 3)
    assert(false, 'AS-03', 'Should reject Agent B claiming Agent A ticket');
  } catch (err: any) {
    assert(err.status === 409, 'AS-03', 'Agent B taking Agent A ticket rejected with 409 Conflict');
  }

  // AS-04 & AS-05: Release ticket and Agent B takes released ticket
  {
    const newT = inMemoryStore.tickets[0];
    const released = await releaseTicket(newT.id, 2);
    assert(released.assigned_to === null, 'AS-04', 'Agent A releases ticket back to queue');

    const agentBClaimed = await atomicAssignTicket(newT.id, 3); // Sneha claims
    assert(agentBClaimed.assigned_to === 3, 'AS-05', 'Agent B successfully claims released ticket');
  }

  // AS-06: Authorized reassignment recorded in audit log
  {
    const newT = inMemoryStore.tickets[0];
    const reassigned = await reassignTicket(newT.id, 4, 1); // Meera reassigns to Arjun
    assert(reassigned.assigned_to === 4, 'AS-06', 'Reassignment to Agent C succeeds');
    const logs = await getAuditLogsForTicket(newT.id);
    const hasReassignedLog = logs.some((l) => l.action === 'REASSIGNED');
    assert(hasReassignedLog, 'AS-06b', 'Reassignment event is recorded in audit log');
  }

  // AS-07: Invalid agent ID rejected
  try {
    const newT = inMemoryStore.tickets[0];
    newT.assigned_to = null;
    await atomicAssignTicket(newT.id, 9999);
    assert(false, 'AS-07', 'Should reject invalid agent ID');
  } catch (err: any) {
    assert(err.status === 400, 'AS-07', 'Invalid agent ID rejected with 400 error');
  }

  // CON-01: Two agents click simultaneously
  {
    const testT = await createTicket({
      customerName: 'Race 1',
      customerEmail: 'race1@test.com',
      subject: 'Race Condition 2 agents',
      description: 'Desc',
    });

    const results = await Promise.allSettled([
      atomicAssignTicket(testT.id, 2),
      atomicAssignTicket(testT.id, 3),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert(fulfilled.length === 1 && rejected.length === 1, 'CON-01', 'Two agents claiming simultaneously: exactly 1 succeeds, 1 gets conflict');
  }

  // CON-02: Five agents click simultaneously
  {
    const testT = await createTicket({
      customerName: 'Race 5',
      customerEmail: 'race5@test.com',
      subject: 'Race Condition 5 agents',
      description: 'Desc',
    });

    const results = await Promise.allSettled([
      atomicAssignTicket(testT.id, 1),
      atomicAssignTicket(testT.id, 2),
      atomicAssignTicket(testT.id, 3),
      atomicAssignTicket(testT.id, 4),
      atomicAssignTicket(testT.id, 5),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert(fulfilled.length === 1 && rejected.length === 4, 'CON-02', 'Five agents claiming simultaneously: exactly 1 succeeds, 4 get conflict');
  }

  // CON-03: All nine agents click simultaneously
  {
    const testT = await createTicket({
      customerName: 'Race 9',
      customerEmail: 'race9@test.com',
      subject: 'Race Condition 9 agents',
      description: 'Desc',
    });

    const agentIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const results = await Promise.allSettled(
      agentIds.map((id) => atomicAssignTicket(testT.id, id))
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert(fulfilled.length === 1 && rejected.length === 8, 'CON-03', 'All 9 agents claiming simultaneously: exactly 1 succeeds, 8 get conflict');
  }

  // CON-08: Assignment API called on resolved/closed ticket rejected
  try {
    const testT = await createTicket({
      customerName: 'Closed Ticket',
      customerEmail: 'c@test.com',
      subject: 'Closed Claim',
      description: 'Desc',
    });
    testT.status = 'RESOLVED';
    await atomicAssignTicket(testT.id, 2);
    assert(false, 'CON-08', 'Should reject assigning resolved ticket');
  } catch (err: any) {
    assert(err.status === 400, 'CON-08', 'Assignment on resolved ticket rejected (400)');
  }

  // ==========================================
  // SECTION 6: Public Replies and Private Notes
  // ==========================================
  console.log('\n--- Category 6: Public Replies and Private Notes ---');

  // MSG-01 to MSG-04: Public reply
  {
    const msg = await addMessage({
      ticketId: 2,
      senderId: 1,
      senderName: 'Meera',
      senderRole: 'AGENT',
      isInternal: false,
      content: 'We have resolved the gateway timeout.',
    });
    assert(msg.is_internal === false, 'MSG-01', 'Public reply saved with correct flag');
    assert(msg.sender_name === 'Meera', 'MSG-03', 'Public reply records correct author');
    assert(Boolean(msg.created_at), 'MSG-04', 'Public reply records timestamp');
  }

  // MSG-05: Empty reply rejected
  try {
    await addMessage({
      ticketId: 2,
      senderName: 'Meera',
      senderRole: 'AGENT',
      isInternal: false,
      content: '   ',
    });
    assert(false, 'MSG-05', 'Should reject empty message');
  } catch (err: any) {
    assert(err.status === 400, 'MSG-05', 'Empty public reply rejected with validation error (400)');
  }

  // MSG-07 & MSG-08: Private note saved and visible to agent
  {
    const note = await addMessage({
      ticketId: 2,
      senderId: 1,
      senderName: 'Meera',
      senderRole: 'AGENT',
      isInternal: true,
      content: 'Confidential staff note: investigate server logs on node 4.',
    });
    assert(note.is_internal === true, 'MSG-07', 'Private note saved with is_internal: true');

    const agentData = await getTicketById(2, true);
    const hasNote = agentData?.messages.some((m) => m.content.includes('node 4'));
    assert(Boolean(hasNote), 'MSG-08', 'Internal agent can view private notes');
  }

  // MSG-09 to MSG-12: Customer-facing endpoints strictly exclude internal notes
  {
    const customerData = await getTicketById(2, false);
    const leakedNotes = customerData?.messages.filter((m) => m.is_internal) || [];
    assert(leakedNotes.length === 0, 'MSG-09', 'Customer-facing ticket view excludes all private notes');

    const exported = await exportTicket(2, false);
    const exportHasInternal = exported?.messages.some((m: any) => m.isInternal || m.content.includes('node 4'));
    assert(!exportHasInternal, 'MSG-11', 'Customer export strictly excludes private notes');
  }

  // MSG-15: Message type manipulated by customer is sanitized
  {
    const customerMsg = await addMessage({
      ticketId: 2,
      senderName: 'Sara Chen',
      senderRole: 'CUSTOMER',
      isInternal: true as any, // Customer attempts to inject internal note
      content: 'Hello team.',
    });
    assert(customerMsg.is_internal === false, 'MSG-15', 'Backend overrides manipulated message type; customer note is forced public');
  }

  // ==========================================
  // SECTION 7: Ticket Lifecycle and Reopening
  // ==========================================
  console.log('\n--- Category 7: Ticket Lifecycle and Reopening ---');

  // LC-01: Open ticket marked resolved
  {
    const t = inMemoryStore.tickets.find((x) => x.id === 2);
    if (t) {
      t.status = 'IN_PROGRESS';
      const updated = await updateTicketStatus({
        ticketId: t.id,
        newStatus: 'RESOLVED',
        actorName: 'Meera',
        actorRole: 'AGENT',
      });
      assert(updated.status === 'RESOLVED', 'LC-01', 'Ticket marked as resolved');
      assert(Boolean(t.resolved_at), 'LC-01b', 'Resolved timestamp recorded automatically');
    }
  }

  // LC-02: Reopened within 7 days allowed
  {
    const t = inMemoryStore.tickets.find((x) => x.id === 2);
    if (t) {
      t.status = 'RESOLVED';
      t.resolved_at = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(); // 2 days ago
      const reopened = await customerReopenTicket({
        ticketNumber: t.ticket_number,
        reason: 'Issue recurred this morning.',
      });
      assert(reopened.status === 'OPEN', 'LC-02', 'Resolved ticket reopened within 1 week allowed');
    }
  }

  // LC-03: Reopening after 7 days rejected
  try {
    const t = inMemoryStore.tickets.find((x) => x.id === 2);
    if (t) {
      t.status = 'RESOLVED';
      t.resolved_at = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(); // 10 days ago
      await customerReopenTicket({
        ticketNumber: t.ticket_number,
        reason: 'Issue back.',
      });
      assert(false, 'LC-03', 'Should reject reopening after 7 days');
    }
  } catch (err: any) {
    assert(err.status === 400, 'LC-03', 'Reopening after 7 days rejected with explanation (400)');
  }

  // LC-10: Idempotent status transition
  {
    const t = inMemoryStore.tickets.find((x) => x.id === 2);
    if (t) {
      t.status = 'CLOSED';
      const same = await updateTicketStatus({
        ticketId: t.id,
        newStatus: 'CLOSED',
        actorName: 'Agent',
        actorRole: 'AGENT',
      });
      assert(same.status === 'CLOSED', 'LC-10', 'Already closed ticket closed again is idempotent without error');
    }
  }

  // ==========================================
  // SECTION 8: Audit Logs and Data Integrity
  // ==========================================
  console.log('\n--- Category 8: Audit Logs and Data Integrity ---');

  {
    const logs = await getAuditLogsForTicket(2);
    assert(logs.length >= 5, 'AUD-01', 'Audit log maintains comprehensive event history');
    assert(logs.some((l) => l.action === 'CREATED'), 'AUD-01b', 'Audit trail contains ticket creation event');
    assert(logs.some((l) => l.action === 'ASSIGNED'), 'AUD-02', 'Audit trail contains assignment event');
    assert(logs.some((l) => l.action === 'STATUS_CHANGE'), 'AUD-05', 'Audit trail contains status change event');
    assert(logs.some((l) => l.action === 'REPLIED'), 'AUD-06', 'Audit trail contains public reply event');
    assert(logs.some((l) => l.action === 'NOTE_ADDED'), 'AUD-07', 'Audit trail contains private note event');

    const allHaveServerTimestamps = logs.every((l) => !isNaN(new Date(l.created_at).getTime()));
    assert(allHaveServerTimestamps, 'AUD-12', 'Audit trail enforces server-generated timestamps');

    // Chronological order
    let isChronological = true;
    for (let i = 1; i < logs.length; i++) {
      if (new Date(logs[i].created_at).getTime() < new Date(logs[i - 1].created_at).getTime()) {
        isChronological = false;
        break;
      }
    }
    assert(isChronological, 'AUD-13', 'Audit trail returns records in exact chronological order');
  }

  // ==========================================
  // SECTION 10: End-to-End Integration Tests
  // ==========================================
  console.log('\n--- Category 10: End-to-End Integration Testing ---');

  // E2E-01: Normal ticket resolution workflow
  {
    const t = await createTicket({
      customerName: 'E2E Customer',
      customerEmail: 'e2e@test.com',
      subject: 'E2E Normal Ticket Resolution',
      description: 'Customer inquiry regarding account credentials.',
      priority: 'MEDIUM',
    });
    // Claim
    await atomicAssignTicket(t.id, 1);
    // Public reply
    await addMessage({
      ticketId: t.id,
      senderId: 1,
      senderName: 'Meera',
      senderRole: 'AGENT',
      isInternal: false,
      content: 'We are resetting your credentials now.',
    });
    // Private note
    await addMessage({
      ticketId: t.id,
      senderId: 1,
      senderName: 'Meera',
      senderRole: 'AGENT',
      isInternal: true,
      content: 'Checked IAM directory; password hash regenerated.',
    });
    // Resolve
    await updateTicketStatus({
      ticketId: t.id,
      newStatus: 'RESOLVED',
      actorName: 'Meera',
      actorRole: 'AGENT',
    });

    const finalAgentView = await getTicketById(t.id, true);
    const finalCustomerView = await getTicketById(t.id, false);

    assert(finalAgentView?.ticket.status === 'RESOLVED', 'E2E-01a', 'Ticket resolved in E2E flow');
    assert(finalAgentView?.messages.length === 2, 'E2E-01b', 'Agent view has both public reply and private note');
    assert(finalCustomerView?.messages.length === 1, 'E2E-01c', 'Customer view has only public reply, private note hidden');
  }

  // E2E-02: Customer waiting workflow & consumed SLA retention
  {
    const baseCreated = new Date(2026, 10, 16, 9, 30, 0); // Monday 9:30 AM
    // 1 hour consumed -> 10:30 AM
    const nowPause = new Date(2026, 10, 16, 10, 30, 0);
    const elapsedBeforePause = getElapsedWorkingMinutes(baseCreated, nowPause, []);
    assert(elapsedBeforePause === 60, 'E2E-02a', '1 hour elapsed before waiting');

    // Customer waits 3 full working days (27 working hours)
    const replyTime = new Date(2026, 10, 19, 10, 30, 0);
    const pausedTime = getElapsedWorkingMinutes(nowPause, replyTime, []);
    assert(pausedTime === 27 * 60, 'E2E-02b', 'Exact 3 working days paused (1620 mins)');

    // Net elapsed working time after reply is still only 60 minutes
    const netElapsed = getElapsedWorkingMinutes(baseCreated, replyTime, [], pausedTime);
    assert(netElapsed === 60, 'E2E-02c', 'Net working time consumed remains 60 minutes, customer wait excluded');
  }

  // E2E-03: Concurrent assignment resolution
  {
    const t = await createTicket({
      customerName: 'Concurrency Customer',
      customerEmail: 'conc@test.com',
      subject: 'Concurrency E2E Ticket',
      description: 'Desc',
    });
    const results = await Promise.allSettled([
      atomicAssignTicket(t.id, 2),
      atomicAssignTicket(t.id, 3),
    ]);
    const winner = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Ticket>;
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert(Boolean(winner && loser), 'E2E-03a', 'One winner and one loser in concurrent assignment');
    assert(loser.reason.status === 409, 'E2E-03b', 'Losing request receives 409 Conflict');
    const logs = await getAuditLogsForTicket(t.id);
    const assignEvents = logs.filter((l) => l.action === 'ASSIGNED');
    assert(assignEvents.length === 1, 'E2E-03c', 'Database records exactly 1 assignment event');
  }

  // E2E-04: Weekend SLA workflow
  {
    const fri6pm = new Date(2026, 10, 20, 18, 0, 0); // Friday 6 PM
    const deadlines = calculateInitialDeadlines(fri6pm, 'URGENT', []);
    assert(
      deadlines.responseDeadline.getDay() === 1 && deadlines.responseDeadline.getHours() === 11,
      'E2E-04',
      'Friday 6 PM Urgent ticket response deadline is Monday 11:00 AM'
    );
  }

  // E2E-05: Reopening workflow
  {
    const t = await createTicket({
      customerName: 'Reopen Customer',
      customerEmail: 'reopen@test.com',
      subject: 'Reopen Workflow Ticket',
      description: 'Desc',
      priority: 'LOW',
    });
    await updateTicketStatus({
      ticketId: t.id,
      newStatus: 'RESOLVED',
      actorName: 'Agent',
      actorRole: 'AGENT',
    });
    // Reopen day 2
    const reopened = await customerReopenTicket({
      ticketNumber: t.ticket_number,
      reason: 'Still broken.',
    });
    assert(reopened.status === 'OPEN', 'E2E-05a', 'Ticket reopened successfully within window');

    // Resolve again
    await updateTicketStatus({
      ticketId: t.id,
      newStatus: 'RESOLVED',
      actorName: 'Agent',
      actorRole: 'AGENT',
    });
    // Fast forward 10 days
    t.resolved_at = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    try {
      await customerReopenTicket({
        ticketNumber: t.ticket_number,
        reason: 'Broken again after 10 days.',
      });
      assert(false, 'E2E-05b', 'Should reject reopening after window');
    } catch (err: any) {
      assert(err.status === 400, 'E2E-05b', 'Reopening after window is rejected with explanation');
    }
  }

  // E2E-06: Private note security workflow across views & exports
  {
    const t = await createTicket({
      customerName: 'Security Customer',
      customerEmail: 'sec@test.com',
      subject: 'Security Verification Ticket',
      description: 'Desc',
    });
    await addMessage({
      ticketId: t.id,
      senderName: 'Agent',
      senderRole: 'AGENT',
      isInternal: true,
      content: 'CONFIDENTIAL_NOTE_XYZ_123',
    });
    await addMessage({
      ticketId: t.id,
      senderName: 'Agent',
      senderRole: 'AGENT',
      isInternal: false,
      content: 'PUBLIC_REPLY_ABC_789',
    });

    const agentView = await getTicketById(t.id, true);
    const customerView = await getTicketById(t.id, false);
    const exported = await exportTicket(t.id, false);

    const agentSeesNote = agentView?.messages.some((m) => m.content.includes('CONFIDENTIAL_NOTE_XYZ_123'));
    const customerSeesNote = customerView?.messages.some((m) => m.content.includes('CONFIDENTIAL_NOTE_XYZ_123'));
    const exportHasNote = exported?.messages.some((m: any) => m.content.includes('CONFIDENTIAL_NOTE_XYZ_123'));

    assert(Boolean(agentSeesNote), 'E2E-06a', 'Agent API returns confidential note');
    assert(!customerSeesNote, 'E2E-06b', 'Customer API strictly excludes confidential note');
    assert(!exportHasNote, 'E2E-06c', 'Customer export strictly excludes confidential note');
  }

  console.log('\n====================================================');
  console.log(`Final Validation Summary: ${passed} passed, ${failed} failed.`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
