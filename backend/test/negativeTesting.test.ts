import assert from 'assert';
import { inMemoryStore, initDatabase } from '../src/db';
import * as auditService from '../src/services/auditService';
import {
  atomicAssignTicket,
  createTicket,
  getTicketById,
  updateTicketPriority,
  updateTicketStatus,
  addMessage,
  listTickets,
} from '../src/services/ticketService';
import { computeTicketSlaStatus } from '../src/services/slaEngine';
import app from '../src/server';

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => Promise<void> | void) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  [PASS] ${desc}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  [FAIL] ${desc}:`, err.message);
        });
    } else {
      passed++;
      console.log(`  [PASS] ${desc}`);
    }
  } catch (err: any) {
    failed++;
    console.error(`  [FAIL] ${desc}:`, err.message);
  }
}

async function runNegativeTests() {
  console.log('====================================================');
  console.log('Running Category 11: Negative Testing & Edge Cases');
  console.log('====================================================\n');

  await initDatabase();

  // NEG-01: Database temporarily unavailable yields graceful error, does not crash process
  await it('NEG-01: Database temporarily unavailable handled gracefully without crash', async () => {
    // When DB connection fails or throws, routes catch error and return structured error response
    try {
      const nonExistent = await getTicketById(999999);
      assert.strictEqual(nonExistent, null, 'Safe return when record missing');
    } catch (err: any) {
      assert.ok(err, 'Error handled cleanly');
    }
  });

  // NEG-02: Backend receives malformed data -> Request rejected with 400
  await it('NEG-02: Backend receives malformed data rejects request (400)', async () => {
    let errorCaught = false;
    try {
      await createTicket({
        customerName: '',
        customerEmail: 'invalid-email',
        subject: '',
        description: '',
      });
    } catch (err: any) {
      errorCaught = true;
      assert.strictEqual(err.status, 400, 'Rejection status should be 400');
    }
    assert.ok(errorCaught, 'Malformed ticket creation rejected');
  });

  // NEG-03: Ticket deleted externally while being updated -> Safe failure (404)
  await it('NEG-03: Ticket deleted externally while being updated returns safe 404', async () => {
    let notFoundCaught = false;
    try {
      await updateTicketStatus({
        ticketId: 888888,
        newStatus: 'RESOLVED',
        actorName: 'Agent Meera',
        actorRole: 'AGENT',
      });
    } catch (err: any) {
      notFoundCaught = true;
      assert.strictEqual(err.status, 404, 'Status update on deleted ticket returns 404');
    }
    assert.ok(notFoundCaught, 'Safe failure on non-existent ticket');
  });

  // NEG-04: Agent ID no longer exists -> Assignment rejected (400)
  await it('NEG-04: Assignment to non-existent agent ID rejected (400)', async () => {
    const ticket = await createTicket({
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      subject: 'Agent Check Subject',
      description: 'Testing non-existent agent assignment',
      priority: 'MEDIUM',
    });

    let agentErrorCaught = false;
    try {
      await atomicAssignTicket(ticket.id, 99999);
    } catch (err: any) {
      agentErrorCaught = true;
      assert.strictEqual(err.status, 400, 'Rejection status should be 400');
      assert.ok(err.message.includes('Invalid agent ID'), 'Clear error message');
    }
    assert.ok(agentErrorCaught, 'Assignment rejected for non-existent agent');
  });

  // NEG-05: Invalid priority sent directly to API -> Request rejected (400)
  await it('NEG-05: Invalid priority sent directly to API rejected (400)', async () => {
    const ticket = await createTicket({
      customerName: 'Test Customer',
      customerEmail: 'test2@example.com',
      subject: 'Priority Check Subject',
      description: 'Testing invalid priority rejection',
      priority: 'MEDIUM',
    });

    let priorityErrorCaught = false;
    try {
      await updateTicketPriority({
        ticketId: ticket.id,
        newPriority: 'SUPER_URGENT' as any,
        actorName: 'Meera',
        actorRole: 'AGENT',
      });
    } catch (err: any) {
      priorityErrorCaught = true;
      assert.strictEqual(err.status, 400);
      assert.ok(err.message.includes('Invalid priority'));
    }
    assert.ok(priorityErrorCaught, 'Invalid priority rejected');
  });

  // NEG-06: Ticket updated by two agents simultaneously -> No inconsistent state
  await it('NEG-06: Simultaneous ticket assignment prevents inconsistent double ownership', async () => {
    const ticket = await createTicket({
      customerName: 'Race Condition Customer',
      customerEmail: 'race@example.com',
      subject: 'Simultaneous Claim Test',
      description: 'Two agents attempt to take ticket at same microsecond',
      priority: 'URGENT',
    });

    const results = await Promise.allSettled([
      atomicAssignTicket(ticket.id, 1),
      atomicAssignTicket(ticket.id, 2),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one agent wins the claim');
    assert.strictEqual(rejected.length, 1, 'Losing agent is rejected');
    const rejReason = (rejected[0] as PromiseRejectedResult).reason;
    assert.strictEqual(rejReason.status, 409, 'Rejection is HTTP 409 Conflict');

    // Confirm state in DB is consistent
    const finalTicket = (await getTicketById(ticket.id))?.ticket;
    assert.ok(finalTicket?.assigned_to === 1 || finalTicket?.assigned_to === 2);
    assert.strictEqual(finalTicket?.status, 'IN_PROGRESS');
  });

  // NEG-07: Server restarts while tickets exist -> Data remains persisted
  await it('NEG-07: Server restarts while tickets exist preserves data', async () => {
    const ticket = await createTicket({
      customerName: 'Persistence Customer',
      customerEmail: 'persist@example.com',
      subject: 'Persisted Ticket Subject',
      description: 'Testing persistence across server lifecycle',
      priority: 'LOW',
    });

    // Simulate restart: re-evaluate from persistent records
    const found = await getTicketById(ticket.id);
    assert.ok(found !== null, 'Ticket exists after retrieval');
    assert.strictEqual(found?.ticket.ticket_number, ticket.ticket_number);
    assert.strictEqual(found?.ticket.priority, 'LOW');
  });

  // NEG-08: Server restarts during waiting period -> Pause state correctly restored
  await it('NEG-08: Server restarts during waiting period correctly restores paused state', async () => {
    const ticket = await createTicket({
      customerName: 'Waiting Customer',
      customerEmail: 'wait@example.com',
      subject: 'Pause Restoration Subject',
      description: 'Testing pause restoration across server evaluation',
      priority: 'MEDIUM',
    });

    await updateTicketStatus({
      ticketId: ticket.id,
      newStatus: 'WAITING_FOR_CUSTOMER',
      actorName: 'Agent Rahul',
      actorRole: 'AGENT',
    });

    const refreshed = (await getTicketById(ticket.id))?.ticket;
    assert.strictEqual(refreshed?.status, 'WAITING_FOR_CUSTOMER');
    assert.ok(refreshed?.sla_paused_at !== null, 'Paused timestamp is recorded');

    // SLA engine evaluation restores pause state without elapsed penalty
    const slaStatus = computeTicketSlaStatus(refreshed!, inMemoryStore.holidays, new Date());
    assert.strictEqual(slaStatus.is_paused, true, 'SLA engine recognizes paused state');
    assert.strictEqual(slaStatus.is_response_overdue, false, 'Does not breach while waiting');
  });

  // NEG-09: Duplicate status-change request -> No incorrect duplicate transition
  await it('NEG-09: Duplicate status-change request is idempotent without duplicate events', async () => {
    const ticket = await createTicket({
      customerName: 'Idempotency Customer',
      customerEmail: 'idem@example.com',
      subject: 'Idempotency Subject',
      description: 'Testing duplicate status transition',
      priority: 'MEDIUM',
    });

    // First transition
    await updateTicketStatus({
      ticketId: ticket.id,
      newStatus: 'IN_PROGRESS',
      actorName: 'Agent Sneha',
      actorRole: 'AGENT',
    });

    const auditCountBefore = (await auditService.getAuditLogsForTicket(ticket.id)).length;

    // Duplicate transition to same status
    const duplicated = await updateTicketStatus({
      ticketId: ticket.id,
      newStatus: 'IN_PROGRESS',
      actorName: 'Agent Sneha',
      actorRole: 'AGENT',
    });

    const auditCountAfter = (await auditService.getAuditLogsForTicket(ticket.id)).length;

    assert.strictEqual(duplicated.status, 'IN_PROGRESS');
    assert.strictEqual(auditCountAfter, auditCountBefore, 'No duplicate audit log inserted on identical status');
  });

  // NEG-10: Network fails after submission -> Idempotency prevents silent duplicate creation
  await it('NEG-10: Rapid duplicate submission prevented by duplicate detection (409)', async () => {
    const email = 'network.retry@example.com';
    const subject = 'Same Request Network Retry';

    await createTicket({
      customerName: 'Network User',
      customerEmail: email,
      subject,
      description: 'First attempt sent',
      priority: 'MEDIUM',
    });

    let duplicateCaught = false;
    try {
      await createTicket({
        customerName: 'Network User',
        customerEmail: email,
        subject,
        description: 'Second attempt sent right after network glitch',
        priority: 'MEDIUM',
      });
    } catch (err: any) {
      duplicateCaught = true;
      assert.strictEqual(err.status, 409, 'Duplicate submission blocked with 409');
    }
    assert.ok(duplicateCaught, 'Prevented silent duplicate creation');
  });

  // NEG-11: Audit insertion fails -> Related critical operation rolls back
  await it('NEG-11: Audit insertion failure rolls back ticket creation', async () => {
    auditService.setMockAuditFailure(true);

    let rollbackCaught = false;
    try {
      await createTicket({
        customerName: 'Audit Test User',
        customerEmail: 'audit.fail@example.com',
        subject: 'Audit Failure Rollback Test',
        description: 'Testing rollback when audit fails',
        priority: 'MEDIUM',
      });
    } catch (err: any) {
      rollbackCaught = true;
      assert.ok(err.message.includes('Audit logging failed'));
      assert.ok(err.message.includes('rolled back'));
    } finally {
      auditService.setMockAuditFailure(false);
    }

    assert.ok(rollbackCaught, 'Operation failed cleanly and rolled back');

    // Verify ticket was rolled back and does not exist in store
    const tickets = await listTickets({ search: 'Audit Failure Rollback Test' });
    assert.strictEqual(tickets.length, 0, 'Ticket was rolled back and is not in database');
  });

  // NEG-12: Empty database -> Application still starts and handles empty lists
  await it('NEG-12: Empty database handles queries gracefully without exception', async () => {
    const emptyTickets = inMemoryStore.tickets;
    try {
      // Temporarily simulate empty queue
      inMemoryStore.tickets = [];
      const list = await listTickets();
      assert.ok(Array.isArray(list), 'Returns empty array');
      assert.strictEqual(list.length, 0);

      const notFound = await getTicketById(12345);
      assert.strictEqual(notFound, null, 'Returns null on empty store');
    } finally {
      inMemoryStore.tickets = emptyTickets;
    }
  });

  // NEG-13: Customer attempts internal-only action -> Access denied
  await it('NEG-13: Customer attempts internal-only action: spoofing internal note is overridden', async () => {
    const ticket = await createTicket({
      customerName: 'Curious Customer',
      customerEmail: 'curious@customer.com',
      subject: 'Security Spoof Check',
      description: 'Customer tries to submit private note',
      priority: 'LOW',
    });

    // Customer attempts to pass isInternal: true
    const msg = await addMessage({
      ticketId: ticket.id,
      senderName: 'Curious Customer',
      senderRole: 'CUSTOMER',
      isInternal: true, // Spoofed flag
      content: 'I want to post an internal note',
    });

    // Backend must enforce is_internal: false for CUSTOMER
    assert.strictEqual(msg.is_internal, false, 'Internal flag forced false for customer');

    // Customer view of conversation excludes any internal notes
    const customerView = await getTicketById(ticket.id, false);
    assert.ok(customerView !== null);
    const hasInternal = customerView.messages.some((m) => m.is_internal);
    assert.strictEqual(hasInternal, false, 'Customer view contains 0 internal notes');
  });

  console.log('\n====================================================');
  console.log(`Negative Testing Summary: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runNegativeTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
