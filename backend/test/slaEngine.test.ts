import {
  addWorkingMinutes,
  calculateInitialDeadlines,
  formatDuration,
  getElapsedWorkingMinutes,
  isAutoCloseEligible,
  isReopenEligible,
  recalculateDeadlinesOnPriorityChange,
} from '../src/services/slaEngine';
import { Holiday, Ticket } from '../src/types';

function runTests() {
  console.log('Running SLA Engine test suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
    }
  }

  const sampleHolidays: Holiday[] = [
    { id: 1, date: '2026-11-23', name: 'Company Holiday' },
  ];

  // Friday 6:00 PM ticket creation & weekend pause
  {
    const friday6pm = new Date(2026, 10, 20, 18, 0, 0);
    const deadlines = calculateInitialDeadlines(friday6pm, 'URGENT', []);
    const d = deadlines.responseDeadline;
    assert(
      d.getDay() === 1 && d.getHours() === 11 && d.getMinutes() === 0,
      `Friday 18:00 Urgent ticket rolls remaining 90m to Monday 11:00`
    );
  }

  // Holiday rollover
  {
    const friday6pm = new Date(2026, 10, 20, 18, 0, 0);
    const deadlinesWithHoliday = calculateInitialDeadlines(friday6pm, 'URGENT', sampleHolidays);
    const d = deadlinesWithHoliday.responseDeadline;
    assert(
      d.getDay() === 2 && d.getHours() === 11 && d.getMinutes() === 0,
      `Holiday on Monday pushes deadline to Tuesday 11:00`
    );
  }

  // Elapsed working minutes
  {
    const start = new Date(2026, 10, 16, 10, 0, 0);
    const end = new Date(2026, 10, 16, 12, 30, 0);
    const elapsed = getElapsedWorkingMinutes(start, end, []);
    assert(elapsed === 150, `10:00 to 12:30 equals 150 working minutes`);
  }

  // Paused minutes deduction
  {
    const start = new Date(2026, 10, 16, 10, 0, 0);
    const end = new Date(2026, 10, 16, 15, 0, 0);
    const pausedMinutes = 120;
    const netElapsed = getElapsedWorkingMinutes(start, end, [], pausedMinutes);
    assert(netElapsed === 180, `Customer paused minutes correctly subtracted`);
  }

  // Auto-close threshold check (>45 working hours)
  {
    const ticketWaiting: Ticket = {
      id: 1,
      ticket_number: 'INC-001',
      customer_name: 'Customer A',
      customer_email: 'a@c.com',
      subject: 'Test auto close',
      description: 'Desc',
      priority: 'MEDIUM',
      status: 'WAITING_FOR_CUSTOMER',
      response_deadline: new Date().toISOString(),
      resolution_deadline: new Date().toISOString(),
      sla_paused_at: new Date(2026, 10, 9, 9, 30, 0).toISOString(),
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 9, 9, 30, 0).toISOString(),
      updated_at: new Date(2026, 10, 9, 9, 30, 0).toISOString(),
    };

    const eligible = isAutoCloseEligible(ticketWaiting, [], new Date(2026, 10, 20, 18, 30, 0));
    assert(eligible === true, 'Ticket waiting > 1 working week flagged for auto-closure');
  }

  // Reopen window eligibility (<7 days vs >7 days)
  {
    const recentResolved: Ticket = {
      id: 2,
      ticket_number: 'INC-002',
      customer_name: 'Customer B',
      customer_email: 'b@c.com',
      subject: 'Test reopen',
      description: 'Desc',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      resolved_at: new Date(2026, 10, 18, 10, 0, 0).toISOString(),
      response_deadline: new Date().toISOString(),
      resolution_deadline: new Date().toISOString(),
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 17, 10, 0, 0).toISOString(),
      updated_at: new Date(2026, 10, 18, 10, 0, 0).toISOString(),
    };

    const eligible3DaysLater = isReopenEligible(recentResolved, new Date(2026, 10, 21, 10, 0, 0));
    assert(eligible3DaysLater.eligible === true, 'Resolved ticket within 3 days allowed to reopen');

    const expired10DaysLater = isReopenEligible(recentResolved, new Date(2026, 10, 29, 10, 0, 0));
    assert(expired10DaysLater.eligible === false, 'Resolved ticket after 11 days blocked from reopening');
  }

  // Priority upgrade SLA recalculation
  {
    const mediumTicket: Ticket = {
      id: 3,
      ticket_number: 'INC-003',
      customer_name: 'Customer C',
      customer_email: 'c@c.com',
      subject: 'Issue upgraded to urgent',
      description: 'Desc',
      priority: 'MEDIUM',
      status: 'OPEN',
      response_deadline: new Date(2026, 10, 16, 14, 0, 0).toISOString(),
      resolution_deadline: new Date(2026, 10, 19, 9, 30, 0).toISOString(),
      total_paused_working_minutes: 0,
      created_at: new Date(2026, 10, 16, 9, 30, 0).toISOString(),
      updated_at: new Date(2026, 10, 16, 9, 30, 0).toISOString(),
    };

    const now = new Date(2026, 10, 16, 13, 0, 0);
    const recalc = recalculateDeadlinesOnPriorityChange(mediumTicket, 'URGENT', [], now);
    assert(recalc.isResponseOverdue === true, 'Upgrading to Urgent with elapsed time > quota marks overdue immediately');
  }

  console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
