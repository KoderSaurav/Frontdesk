import { initDatabase, inMemoryStore } from '../src/db';
import {
  atomicAssignTicket,
  addMessage,
  getTicketById,
  updateTicketPriority,
  updateTicketStatus,
} from '../src/services/ticketService';
import { getAuditLogsForTicket } from '../src/services/auditService';

async function runTests() {
  console.log('Running concurrency and data isolation test suite...\n');
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

  await initDatabase();

  // Test 1: Concurrency Conflict Test (Simultaneous assignment race condition)
  {
    console.log('Test: Simultaneous Ticket Assignment Race Condition');
    const ticketId = 1;

    const results = await Promise.allSettled([
      atomicAssignTicket(ticketId, 2),
      atomicAssignTicket(ticketId, 3),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(fulfilled.length === 1, `Exactly one agent successfully claims ticket`);
    assert(rejected.length === 1, `Second agent rejected with conflict`);

    const rejectedReason: any = (rejected[0] as PromiseRejectedResult).reason;
    assert(rejectedReason.status === 409, `Rejected request returns HTTP 409 Conflict`);
    assert(rejectedReason.message.includes('already assigned'), `Rejection error message states ticket already assigned`);
  }

  // Test 2: Data Isolation Test (Internal notes excluded from customer queries)
  {
    console.log('\nTest: Internal Notes Isolation');
    const ticketId = 2;

    const agentView = await getTicketById(ticketId, true);
    const agentInternalNotes = agentView?.messages.filter((m) => m.is_internal) || [];
    assert(agentInternalNotes.length > 0, `Agent view contains internal notes`);

    const customerView = await getTicketById(ticketId, false);
    const leakedNotes = customerView?.messages.filter((m) => m.is_internal) || [];
    assert(leakedNotes.length === 0, `Customer query returns zero internal notes`);

    const anyLeakedContent = customerView?.messages.some((m) =>
      m.content.toLowerCase().includes('internal note')
    );
    assert(!anyLeakedContent, 'Customer view contains no internal note content');
  }

  // Test 3: Audit Trail Completeness
  {
    console.log('\nTest: Audit Trail Completeness');
    const ticketId = 2;
    const logs = await getAuditLogsForTicket(ticketId);

    assert(logs.length >= 3, `Audit trail logs lifecycle actions`);
    assert(logs.some((l) => l.action === 'ASSIGNED'), 'Audit log contains assignment event');
    assert(logs.some((l) => l.action === 'REPLIED'), 'Audit log contains reply event');
    assert(logs.some((l) => l.action === 'NOTE_ADDED'), 'Audit log contains note addition event');

    const allHaveTimestamps = logs.every((l) => Boolean(l.created_at));
    assert(allHaveTimestamps, 'Every audit record has a valid timestamp');
  }

  console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
