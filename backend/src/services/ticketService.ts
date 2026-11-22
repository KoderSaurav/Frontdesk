import { inMemoryStore, getPool } from '../db';
import {
  calculateInitialDeadlines,
  computeTicketSlaStatus,
  getElapsedWorkingMinutes,
  isAutoCloseEligible,
  isReopenEligible,
  recalculateDeadlinesOnPriorityChange,
} from './slaEngine';
import { logAuditEvent } from './auditService';
import { Message, Ticket, TicketPriority, TicketStatus, User } from '../types';

export async function getHolidays() {
  const pool = getPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM holidays ORDER BY date ASC');
    return res.rows;
  }
  return inMemoryStore.holidays;
}

export async function getAllAgents(): Promise<User[]> {
  const pool = getPool();
  if (pool) {
    const res = await pool.query("SELECT * FROM users WHERE role = 'AGENT' ORDER BY id ASC");
    return res.rows;
  }
  return inMemoryStore.users.filter((u) => u.role === 'AGENT');
}

export async function listTickets({
  status,
  priority,
  assignedTo,
  customerEmail,
  search,
}: {
  status?: string;
  priority?: string;
  assignedTo?: number;
  customerEmail?: string;
  search?: string;
} = {}): Promise<Ticket[]> {
  const holidays = await getHolidays();
  const pool = getPool();
  let tickets: Ticket[] = [];

  if (pool) {
    let query = `
      SELECT t.*, u.name as assigned_agent_name 
      FROM tickets t 
      LEFT JOIN users u ON t.assigned_to = u.id 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }
    if (priority) {
      params.push(priority);
      query += ` AND t.priority = $${params.length}`;
    }
    if (assignedTo) {
      params.push(assignedTo);
      query += ` AND t.assigned_to = $${params.length}`;
    }
    if (customerEmail) {
      params.push(customerEmail.trim().toLowerCase());
      query += ` AND LOWER(t.customer_email) = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (t.ticket_number ILIKE $${params.length} OR t.subject ILIKE $${params.length} OR t.customer_name ILIKE $${params.length})`;
    }

    query += ' ORDER BY t.created_at DESC';
    const res = await pool.query(query, params);
    tickets = res.rows;
  } else {
    tickets = inMemoryStore.tickets.map((t) => {
      const assignedUser = inMemoryStore.users.find((u) => u.id === t.assigned_to);
      return {
        ...t,
        assigned_agent_name: assignedUser ? assignedUser.name : null,
      };
    });

    if (status) {
      tickets = tickets.filter((t) => t.status === status);
    }
    if (priority) {
      tickets = tickets.filter((t) => t.priority === priority);
    }
    if (assignedTo) {
      tickets = tickets.filter((t) => t.assigned_to === assignedTo);
    }
    if (customerEmail) {
      const emailLower = customerEmail.trim().toLowerCase();
      tickets = tickets.filter((t) => t.customer_email.toLowerCase() === emailLower);
    }
    if (search) {
      const q = search.toLowerCase();
      tickets = tickets.filter(
        (t) =>
          t.ticket_number.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.customer_name.toLowerCase().includes(q)
      );
    }
  }

  const now = new Date();
  return tickets.map((t) => ({
    ...t,
    sla_status: computeTicketSlaStatus(t, holidays, now),
  }));
}

export async function getTicketById(
  ticketId: number | string,
  isAgentView: boolean = true
): Promise<{ ticket: Ticket; messages: Message[] } | null> {
  const holidays = await getHolidays();
  const pool = getPool();
  let ticket: Ticket | null = null;
  let messages: Message[] = [];

  const isNumeric = !isNaN(Number(ticketId));

  if (pool) {
    const ticketRes = await pool.query(
      `SELECT t.*, u.name as assigned_agent_name 
       FROM tickets t 
       LEFT JOIN users u ON t.assigned_to = u.id 
       WHERE ${isNumeric ? 't.id = $1' : 't.ticket_number = $1'}`,
      [ticketId]
    );
    if (ticketRes.rows.length === 0) return null;
    ticket = ticketRes.rows[0];

    let msgQuery = 'SELECT * FROM messages WHERE ticket_id = $1';
    if (!isAgentView) {
      msgQuery += ' AND is_internal = FALSE';
    }
    msgQuery += ' ORDER BY created_at ASC';

    const msgRes = await pool.query(msgQuery, [ticket!.id]);
    messages = msgRes.rows;
  } else {
    const found = inMemoryStore.tickets.find((t) =>
      isNumeric ? t.id === Number(ticketId) : t.ticket_number === ticketId
    );
    if (!found) return null;

    const assignedUser = inMemoryStore.users.find((u) => u.id === found.assigned_to);
    ticket = {
      ...found,
      assigned_agent_name: assignedUser ? assignedUser.name : null,
    };

    messages = inMemoryStore.messages
      .filter((m) => m.ticket_id === ticket!.id && (isAgentView ? true : !m.is_internal))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  if (!ticket) return null;
  const now = new Date();
  ticket.sla_status = computeTicketSlaStatus(ticket, holidays, now);

  return { ticket, messages };
}

/**
 * Assigns ticket using atomic conditional update to prevent double-claim race conditions.
 */
export async function atomicAssignTicket(ticketId: number, agentId: number): Promise<Ticket> {
  const pool = getPool();
  const now = new Date().toISOString();

  // Validate agent existence (AS-07)
  let agent: User | undefined;
  if (pool) {
    const agentRes = await pool.query("SELECT * FROM users WHERE id = $1 AND role = 'AGENT'", [agentId]);
    if (agentRes.rows.length === 0) {
      const error: any = new Error('Invalid agent ID. Agent does not exist.');
      error.status = 400;
      throw error;
    }
    agent = agentRes.rows[0];
  } else {
    agent = inMemoryStore.users.find((u) => u.id === agentId && u.role === 'AGENT');
    if (!agent) {
      const error: any = new Error('Invalid agent ID. Agent does not exist.');
      error.status = 400;
      throw error;
    }
  }

  if (!agent) {
    const error: any = new Error('Invalid agent ID. Agent does not exist.');
    error.status = 400;
    throw error;
  }

  // Pre-check ticket status (CON-08)
  const ticketData = await getTicketById(ticketId, true);
  if (!ticketData) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }

  if (ticketData.ticket.status === 'RESOLVED' || ticketData.ticket.status === 'CLOSED') {
    const error: any = new Error('Cannot assign a resolved or closed ticket.');
    error.status = 400;
    throw error;
  }

  // Idempotent assignment if already assigned to the same agent (AS-02 / AS-08)
  if (ticketData.ticket.assigned_to === agentId) {
    return ticketData.ticket;
  }

  if (pool) {
    const res = await pool.query(
      `UPDATE tickets 
       SET assigned_to = $1, 
           status = CASE WHEN status = 'OPEN' THEN 'IN_PROGRESS' ELSE status END,
           updated_at = $2 
       WHERE id = $3 AND assigned_to IS NULL 
       RETURNING *`,
      [agentId, now, ticketId]
    );

    if (res.rows.length === 0) {
      const current = await pool.query(
        'SELECT t.assigned_to, u.name FROM tickets t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.id = $1',
        [ticketId]
      );
      const ownerName = current.rows[0]?.name || 'another agent';
      const error: any = new Error(`Ticket is already assigned to ${ownerName}. Concurrent assignment prevented.`);
      error.status = 409;
      throw error;
    }

    const updated = res.rows[0];
    try {
      await logAuditEvent({
        ticketId,
        actorId: agentId,
        actorName: agent.name,
        actorRole: 'AGENT',
        action: 'ASSIGNED',
        oldState: { assigned_to: null, status: 'OPEN' },
        newState: { assigned_to: agentId, status: updated.status },
        details: `${agent.name} took ownership of ticket.`,
      });
    } catch (auditErr: any) {
      await pool.query("UPDATE tickets SET assigned_to = NULL, status = 'OPEN' WHERE id = $1", [ticketId]);
      const error: any = new Error(`Audit logging failed: ${auditErr.message}. Assignment rolled back.`);
      error.status = 500;
      throw error;
    }

    return updated;
  }

  // In-Memory atomic update simulation
  const ticket = inMemoryStore.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }

  if (ticket.assigned_to !== null && ticket.assigned_to !== undefined) {
    const existingAgent = inMemoryStore.users.find((u) => u.id === ticket.assigned_to);
    const error: any = new Error(
      `Ticket is already assigned to ${existingAgent ? existingAgent.name : 'another agent'}. Concurrent assignment prevented.`
    );
    error.status = 409;
    throw error;
  }

  const oldState = { assigned_to: ticket.assigned_to, status: ticket.status };
  ticket.assigned_to = agentId;
  if (ticket.status === 'OPEN') {
    ticket.status = 'IN_PROGRESS';
  }
  ticket.updated_at = now;

  try {
    await logAuditEvent({
      ticketId,
      actorId: agentId,
      actorName: agent.name,
      actorRole: 'AGENT',
      action: 'ASSIGNED',
      oldState,
      newState: { assigned_to: agentId, status: ticket.status },
      details: `${agent.name} took ownership of ticket.`,
    });
  } catch (auditErr: any) {
    ticket.assigned_to = oldState.assigned_to;
    ticket.status = oldState.status;
    const error: any = new Error(`Audit logging failed: ${auditErr.message}. Assignment rolled back.`);
    error.status = 500;
    throw error;
  }

  return ticket;
}

/**
 * Reassigns a ticket to another agent (AS-06)
 */
export async function reassignTicket(
  ticketId: number,
  newAgentId: number,
  actorId: number
): Promise<Ticket> {
  const pool = getPool();
  const now = new Date().toISOString();

  const ticketData = await getTicketById(ticketId, true);
  if (!ticketData) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }

  const agents = await getAllAgents();
  const newAgent = agents.find((a) => a.id === newAgentId);
  if (!newAgent) {
    const error: any = new Error('Invalid new agent ID.');
    error.status = 400;
    throw error;
  }

  const actor = agents.find((a) => a.id === actorId);
  const oldAgentId = ticketData.ticket.assigned_to;
  const oldAgent = agents.find((a) => a.id === oldAgentId);

  if (pool) {
    const res = await pool.query(
      'UPDATE tickets SET assigned_to = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [newAgentId, now, ticketId]
    );
    ticketData.ticket = res.rows[0];
  } else {
    const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticketId);
    if (rawTicket) {
      rawTicket.assigned_to = newAgentId;
      rawTicket.updated_at = now;
    }
    ticketData.ticket.assigned_to = newAgentId;
    ticketData.ticket.updated_at = now;
  }

  await logAuditEvent({
    ticketId,
    actorId,
    actorName: actor?.name || 'Supervisor',
    actorRole: 'AGENT',
    action: 'REASSIGNED',
    oldState: { assigned_to: oldAgentId, agent_name: oldAgent?.name },
    newState: { assigned_to: newAgentId, agent_name: newAgent.name },
    details: `Ticket reassigned from ${oldAgent?.name || 'Unassigned'} to ${newAgent.name}.`,
  });

  return ticketData.ticket;
}

/**
 * Releases a ticket back to the unassigned queue (AS-04, AS-05)
 */
export async function releaseTicket(ticketId: number, actorId: number): Promise<Ticket> {
  const pool = getPool();
  const now = new Date().toISOString();

  const ticketData = await getTicketById(ticketId, true);
  if (!ticketData) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }

  const agents = await getAllAgents();
  const actor = agents.find((a) => a.id === actorId);
  const oldAgentId = ticketData.ticket.assigned_to;

  if (pool) {
    const res = await pool.query(
      "UPDATE tickets SET assigned_to = NULL, status = 'OPEN', updated_at = $1 WHERE id = $2 RETURNING *",
      [now, ticketId]
    );
    ticketData.ticket = res.rows[0];
  } else {
    const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticketId);
    if (rawTicket) {
      rawTicket.assigned_to = null;
      rawTicket.status = 'OPEN';
      rawTicket.updated_at = now;
    }
    ticketData.ticket.assigned_to = null;
    ticketData.ticket.status = 'OPEN';
    ticketData.ticket.updated_at = now;
  }

  await logAuditEvent({
    ticketId,
    actorId,
    actorName: actor?.name || 'Agent',
    actorRole: 'AGENT',
    action: 'RELEASED',
    oldState: { assigned_to: oldAgentId },
    newState: { assigned_to: null, status: 'OPEN' },
    details: `${actor?.name || 'Agent'} released ticket back to unassigned queue.`,
  });

  return ticketData.ticket;
}

/**
 * Adds a public customer reply or an internal team note.
 */
export async function addMessage({
  ticketId,
  senderId = null,
  senderName,
  senderRole,
  isInternal,
  content,
}: {
  ticketId: number;
  senderId?: number | null;
  senderName: string;
  senderRole: 'AGENT' | 'CUSTOMER' | 'SYSTEM';
  isInternal: boolean;
  content: string;
}): Promise<Message> {
  if (!content || !content.trim()) {
    const error: any = new Error('Message content cannot be empty.');
    error.status = 400;
    throw error;
  }

  const holidays = await getHolidays();
  const pool = getPool();
  const now = new Date();
  const nowIso = now.toISOString();

  // Pre-fetch ticket
  const ticketData = await getTicketById(ticketId, true);
  if (!ticketData) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }
  const ticket = ticketData.ticket;

  // Reject customer replies on closed tickets (WC-10, LC-09)
  if (senderRole === 'CUSTOMER' && ticket.status === 'CLOSED') {
    const error: any = new Error('Ticket is closed. Please submit a new support ticket.');
    error.status = 400;
    throw error;
  }

  // Enforce message privacy (customers can never post internal notes) (MSG-15)
  const effectiveIsInternal = senderRole === 'CUSTOMER' ? false : isInternal;

  let message: Message;

  if (pool) {
    const res = await pool.query(
      `INSERT INTO messages (ticket_id, sender_id, sender_name, sender_role, is_internal, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [ticketId, senderId, senderName, senderRole, effectiveIsInternal, content.trim(), nowIso]
    );
    message = res.rows[0];
  } else {
    message = {
      id: inMemoryStore.nextId.messages++,
      ticket_id: ticketId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      is_internal: effectiveIsInternal,
      content: content.trim(),
      created_at: nowIso,
    };
    inMemoryStore.messages.push(message);
  }

  // First public response by an agent satisfies response SLA (SLA-04)
  if (senderRole === 'AGENT' && !effectiveIsInternal && !ticket.first_response_at) {
    if (pool) {
      await pool.query('UPDATE tickets SET first_response_at = $1, updated_at = $1 WHERE id = $2', [
        nowIso,
        ticketId,
      ]);
    } else {
      const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticketId);
      if (rawTicket) {
        rawTicket.first_response_at = nowIso;
        rawTicket.updated_at = nowIso;
      }
      ticket.first_response_at = nowIso;
      ticket.updated_at = nowIso;
    }
  }

  // Customer replies while in WAITING_FOR_CUSTOMER -> resume timer (WC-04)
  if (senderRole === 'CUSTOMER' && ticket.status === 'WAITING_FOR_CUSTOMER') {
    let pausedMinutes = 0;
    if (ticket.sla_paused_at) {
      pausedMinutes = getElapsedWorkingMinutes(new Date(ticket.sla_paused_at), now, holidays);
    }

    const totalPaused = (ticket.total_paused_working_minutes || 0) + pausedMinutes;
    const newResponseDeadline = new Date(
      new Date(ticket.response_deadline).getTime() + pausedMinutes * 60 * 1000
    ).toISOString();
    const newResolutionDeadline = new Date(
      new Date(ticket.resolution_deadline).getTime() + pausedMinutes * 60 * 1000
    ).toISOString();

    if (pool) {
      await pool.query(
        `UPDATE tickets 
         SET status = 'IN_PROGRESS', 
             sla_paused_at = NULL, 
             total_paused_working_minutes = $1,
             response_deadline = $2,
             resolution_deadline = $3,
             updated_at = $4 
         WHERE id = $5`,
        [totalPaused, newResponseDeadline, newResolutionDeadline, nowIso, ticketId]
      );
    } else {
      const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticketId);
      if (rawTicket) {
        rawTicket.status = 'IN_PROGRESS';
        rawTicket.sla_paused_at = null;
        rawTicket.total_paused_working_minutes = totalPaused;
        rawTicket.response_deadline = newResponseDeadline;
        rawTicket.resolution_deadline = newResolutionDeadline;
        rawTicket.updated_at = nowIso;
      }
      ticket.status = 'IN_PROGRESS';
      ticket.sla_paused_at = null;
      ticket.total_paused_working_minutes = totalPaused;
      ticket.response_deadline = newResponseDeadline;
      ticket.resolution_deadline = newResolutionDeadline;
      ticket.updated_at = nowIso;
    }

    await logAuditEvent({
      ticketId,
      actorId: senderId,
      actorName: senderName,
      actorRole: 'CUSTOMER',
      action: 'TIMER_RESUMED',
      details: `Customer replied. SLA timer resumed after ${pausedMinutes} working minutes paused.`,
    });
  }

  await logAuditEvent({
    ticketId,
    actorId: senderId,
    actorName: senderName,
    actorRole: senderRole,
    action: effectiveIsInternal ? 'NOTE_ADDED' : 'REPLIED',
    details: effectiveIsInternal ? 'Internal team note added.' : 'Public reply sent.',
  });

  return message;
}

/**
 * Updates ticket status with support for pausing and resuming SLA timers.
 */
export async function updateTicketStatus({
  ticketId,
  newStatus,
  actorId = null,
  actorName,
  actorRole,
}: {
  ticketId: number;
  newStatus: TicketStatus;
  actorId?: number | null;
  actorName: string;
  actorRole: string;
}): Promise<Ticket> {
  const holidays = await getHolidays();
  const ticketData = await getTicketById(ticketId, true);
  if (!ticketData) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }
  const ticket = ticketData.ticket;
  const oldStatus = ticket.status;

  // Idempotent: No duplicate transition if status unchanged (LC-10)
  if (oldStatus === newStatus) {
    return ticket;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const pool = getPool();

  let slaPausedAt = ticket.sla_paused_at;
  let resolvedAt = ticket.resolved_at;
  let closedAt = ticket.closed_at;
  let totalPaused = ticket.total_paused_working_minutes || 0;
  let responseDeadline = ticket.response_deadline;
  let resolutionDeadline = ticket.resolution_deadline;

  // Transitioning TO WAITING_FOR_CUSTOMER: pause SLA
  if (newStatus === 'WAITING_FOR_CUSTOMER' && oldStatus !== 'WAITING_FOR_CUSTOMER') {
    slaPausedAt = nowIso;
  }

  // Transitioning FROM WAITING_FOR_CUSTOMER to another status (WC-05)
  if (oldStatus === 'WAITING_FOR_CUSTOMER' && newStatus !== 'WAITING_FOR_CUSTOMER') {
    let pausedMinutes = 0;
    if (ticket.sla_paused_at) {
      pausedMinutes = getElapsedWorkingMinutes(new Date(ticket.sla_paused_at), now, holidays);
    }
    totalPaused += pausedMinutes;
    responseDeadline = new Date(new Date(responseDeadline).getTime() + pausedMinutes * 60 * 1000).toISOString();
    resolutionDeadline = new Date(new Date(resolutionDeadline).getTime() + pausedMinutes * 60 * 1000).toISOString();
    slaPausedAt = null;
  }

  if (newStatus === 'RESOLVED' && !resolvedAt) {
    resolvedAt = nowIso;
  } else if (newStatus !== 'RESOLVED' && oldStatus === 'RESOLVED') {
    resolvedAt = null;
  }

  if (newStatus === 'CLOSED' && !closedAt) {
    closedAt = nowIso;
  }

  if (pool) {
    const res = await pool.query(
      `UPDATE tickets 
       SET status = $1, sla_paused_at = $2, total_paused_working_minutes = $3,
           response_deadline = $4, resolution_deadline = $5,
           resolved_at = $6, closed_at = $7, updated_at = $8 
       WHERE id = $9 
       RETURNING *`,
      [newStatus, slaPausedAt, totalPaused, responseDeadline, resolutionDeadline, resolvedAt, closedAt, nowIso, ticketId]
    );
    ticket.status = newStatus;
  } else {
    const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticketId);
    if (rawTicket) {
      rawTicket.status = newStatus;
      rawTicket.sla_paused_at = slaPausedAt;
      rawTicket.total_paused_working_minutes = totalPaused;
      rawTicket.response_deadline = responseDeadline;
      rawTicket.resolution_deadline = resolutionDeadline;
      rawTicket.resolved_at = resolvedAt;
      rawTicket.closed_at = closedAt;
      rawTicket.updated_at = nowIso;
    }
    ticket.status = newStatus;
    ticket.sla_paused_at = slaPausedAt;
    ticket.total_paused_working_minutes = totalPaused;
    ticket.response_deadline = responseDeadline;
    ticket.resolution_deadline = resolutionDeadline;
    ticket.resolved_at = resolvedAt;
    ticket.closed_at = closedAt;
    ticket.updated_at = nowIso;
  }

  try {
    await logAuditEvent({
      ticketId,
      actorId,
      actorName,
      actorRole,
      action: 'STATUS_CHANGE',
      oldState: { status: oldStatus },
      newState: { status: newStatus },
      details: `Status changed from ${oldStatus} to ${newStatus}.${
        newStatus === 'WAITING_FOR_CUSTOMER' ? ' SLA timer paused.' : ''
      }`,
    });
  } catch (auditErr: any) {
    if (pool) {
      await pool.query(
        'UPDATE tickets SET status = $1, sla_paused_at = $2, total_paused_working_minutes = $3, response_deadline = $4, resolution_deadline = $5, resolved_at = $6, closed_at = $7 WHERE id = $8',
        [oldStatus, ticket.sla_paused_at, ticket.total_paused_working_minutes, ticket.response_deadline, ticket.resolution_deadline, ticket.resolved_at, ticket.closed_at, ticketId]
      );
    } else {
      const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticketId);
      if (rawTicket) {
        rawTicket.status = oldStatus;
        rawTicket.sla_paused_at = ticket.sla_paused_at;
        rawTicket.total_paused_working_minutes = ticket.total_paused_working_minutes;
        rawTicket.response_deadline = ticket.response_deadline;
        rawTicket.resolution_deadline = ticket.resolution_deadline;
        rawTicket.resolved_at = ticket.resolved_at;
        rawTicket.closed_at = ticket.closed_at;
      }
    }
    const error: any = new Error(`Audit logging failed: ${auditErr.message}. Status change rolled back.`);
    error.status = 500;
    throw error;
  }

  return ticket;
}

/**
 * Dynamically recalculates SLA deadlines upon ticket priority adjustment.
 */
export async function updateTicketPriority({
  ticketId,
  newPriority,
  actorId = null,
  actorName,
  actorRole,
}: {
  ticketId: number;
  newPriority: TicketPriority;
  actorId?: number | null;
  actorName: string;
  actorRole: string;
}): Promise<Ticket> {
  if (!['URGENT', 'MEDIUM', 'LOW'].includes(newPriority)) {
    const error: any = new Error('Invalid priority. Must be URGENT, MEDIUM, or LOW.');
    error.status = 400;
    throw error;
  }

  const holidays = await getHolidays();
  const ticketData = await getTicketById(ticketId, true);
  if (!ticketData) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }
  const ticket = ticketData.ticket;

  // Cannot change priority of resolved or closed ticket (SLA-15)
  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
    const error: any = new Error('Cannot change priority of a resolved or closed ticket.');
    error.status = 400;
    throw error;
  }

  const oldPriority = ticket.priority;
  if (oldPriority === newPriority) return ticket;

  const now = new Date();
  const { responseDeadline, resolutionDeadline, isResponseOverdue } =
    recalculateDeadlinesOnPriorityChange(ticket, newPriority, holidays, now);

  const pool = getPool();
  const nowIso = now.toISOString();

  if (pool) {
    await pool.query(
      `UPDATE tickets 
       SET priority = $1, response_deadline = $2, resolution_deadline = $3, updated_at = $4 
       WHERE id = $5`,
      [newPriority, responseDeadline.toISOString(), resolutionDeadline.toISOString(), nowIso, ticketId]
    );
  } else {
    const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticketId);
    if (rawTicket) {
      rawTicket.priority = newPriority;
      rawTicket.response_deadline = responseDeadline.toISOString();
      rawTicket.resolution_deadline = resolutionDeadline.toISOString();
      rawTicket.updated_at = nowIso;
    }
    ticket.priority = newPriority;
    ticket.response_deadline = responseDeadline.toISOString();
    ticket.resolution_deadline = resolutionDeadline.toISOString();
    ticket.updated_at = nowIso;
  }

  await logAuditEvent({
    ticketId,
    actorId,
    actorName,
    actorRole,
    action: 'PRIORITY_CHANGE',
    oldState: { priority: oldPriority },
    newState: {
      priority: newPriority,
      response_deadline: responseDeadline.toISOString(),
      resolution_deadline: resolutionDeadline.toISOString(),
    },
    details: `Priority changed from ${oldPriority} to ${newPriority}. SLA deadlines recalculated.${
      isResponseOverdue ? ' Response SLA is now overdue.' : ''
    }`,
  });

  return ticket;
}

/**
 * Reopening resolved tickets within 7 calendar days.
 */
export async function customerReopenTicket({
  ticketNumber,
  reason,
}: {
  ticketNumber: string;
  reason: string;
}): Promise<Ticket> {
  const ticketData = await getTicketById(ticketNumber, false);
  if (!ticketData) {
    const error: any = new Error('Ticket not found.');
    error.status = 404;
    throw error;
  }

  const ticket = ticketData.ticket;
  const eligibility = isReopenEligible(ticket);
  if (!eligibility.eligible) {
    const error: any = new Error(eligibility.reason || 'Ticket cannot be reopened.');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const pool = getPool();

  if (pool) {
    await pool.query(
      "UPDATE tickets SET status = 'OPEN', resolved_at = NULL, updated_at = $1 WHERE id = $2",
      [now, ticket.id]
    );
  } else {
    const rawTicket = inMemoryStore.tickets.find((t) => t.id === ticket.id);
    if (rawTicket) {
      rawTicket.status = 'OPEN';
      rawTicket.resolved_at = null;
      rawTicket.updated_at = now;
    }
    ticket.status = 'OPEN';
    ticket.resolved_at = null;
    ticket.updated_at = now;
  }

  await addMessage({
    ticketId: ticket.id,
    senderId: ticket.customer_id,
    senderName: ticket.customer_name,
    senderRole: 'CUSTOMER',
    isInternal: false,
    content: `Ticket reopened: ${reason}`,
  });

  await logAuditEvent({
    ticketId: ticket.id,
    actorId: ticket.customer_id,
    actorName: ticket.customer_name,
    actorRole: 'CUSTOMER',
    action: 'REOPENED',
    oldState: { status: 'RESOLVED' },
    newState: { status: 'OPEN' },
    details: `Customer reopened ticket: ${reason}`,
  });

  return ticket;
}

/**
 * Auto-close background check for tickets inactive for >= 45 working hours (1 working week).
 */
export async function checkAndAutoCloseInactiveTickets(): Promise<number> {
  const holidays = await getHolidays();
  const allTickets = await listTickets({ status: 'WAITING_FOR_CUSTOMER' });
  let closedCount = 0;
  const now = new Date();

  for (const t of allTickets) {
    if (isAutoCloseEligible(t, holidays, now)) {
      await updateTicketStatus({
        ticketId: t.id,
        newStatus: 'CLOSED',
        actorName: 'System Scheduler',
        actorRole: 'SYSTEM',
      });

      await logAuditEvent({
        ticketId: t.id,
        actorName: 'System Scheduler',
        actorRole: 'SYSTEM',
        action: 'AUTO_CLOSED',
        details: 'Ticket automatically closed after 1 working week of customer inactivity.',
      });

      closedCount++;
    }
  }

  return closedCount;
}

/**
 * Create a new support ticket with input validation and duplicate prevention.
 */
export async function createTicket({
  customerId = null,
  customerName,
  customerEmail,
  subject,
  description,
  priority = 'MEDIUM',
  status,
}: {
  customerId?: number | null;
  customerName: string;
  customerEmail: string;
  subject: string;
  description: string;
  priority?: TicketPriority;
  status?: string;
}): Promise<Ticket> {
  // Validation TC-02, TC-03, TC-04, TC-08
  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    const error: any = new Error('Customer name is required.');
    error.status = 400;
    throw error;
  }
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    const error: any = new Error('Subject is required and cannot be whitespace only.');
    error.status = 400;
    throw error;
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    const error: any = new Error('Description is required and cannot be whitespace only.');
    error.status = 400;
    throw error;
  }

  // Length limits (TC-09)
  if (description.length > 5000) {
    const error: any = new Error('Description exceeds maximum length limit of 5000 characters.');
    error.status = 400;
    throw error;
  }

  // Priority validation (TC-06)
  const effectivePriority: TicketPriority = priority || 'MEDIUM';
  if (!['URGENT', 'MEDIUM', 'LOW'].includes(effectivePriority)) {
    const error: any = new Error('Invalid priority. Must be URGENT, MEDIUM, or LOW.');
    error.status = 400;
    throw error;
  }

  // Initial status restriction (TC-07)
  if (status && status !== 'OPEN') {
    const error: any = new Error('New tickets must have an initial status of OPEN.');
    error.status = 400;
    throw error;
  }

  // Idempotency / Duplicate submission check (TC-10)
  const now = new Date();
  const pool = getPool();

  if (pool) {
    const duplicateRes = await pool.query(
      `SELECT id, ticket_number FROM tickets 
       WHERE customer_email = $1 AND subject = $2 AND created_at > NOW() - INTERVAL '60 seconds'`,
      [customerEmail.trim(), subject.trim()]
    );
    if (duplicateRes.rows.length > 0) {
      const error: any = new Error(
        `Duplicate submission detected. Ticket ${duplicateRes.rows[0].ticket_number} with the same subject was recently submitted.`
      );
      error.status = 409;
      throw error;
    }
  } else {
    const recentDuplicate = inMemoryStore.tickets.find((t) => {
      const isSameEmail = t.customer_email.toLowerCase() === customerEmail.trim().toLowerCase();
      const isSameSubject = t.subject.trim().toLowerCase() === subject.trim().toLowerCase();
      const isRecent = (now.getTime() - new Date(t.created_at).getTime()) < 60000;
      return isSameEmail && isSameSubject && isRecent;
    });

    if (recentDuplicate) {
      const error: any = new Error(
        `Duplicate submission detected. Ticket ${recentDuplicate.ticket_number} with the same subject was recently submitted.`
      );
      error.status = 409;
      throw error;
    }
  }

  const holidays = await getHolidays();
  const { responseDeadline, resolutionDeadline } = calculateInitialDeadlines(now, effectivePriority, holidays);

  let nextNum = 320;
  if (!pool) {
    nextNum = 320 + inMemoryStore.tickets.length;
  }
  const ticketNumber = `INC-${String(nextNum).padStart(4, '0')}`;
  const nowIso = now.toISOString();

  let createdTicket: Ticket;

  if (pool) {
    const res = await pool.query(
      `INSERT INTO tickets (ticket_number, customer_id, customer_name, customer_email, subject, description, priority, status, response_deadline, resolution_deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $9, $10, $10)
       RETURNING *`,
      [ticketNumber, customerId, customerName.trim(), customerEmail.trim(), subject.trim(), description.trim(), effectivePriority, responseDeadline.toISOString(), resolutionDeadline.toISOString(), nowIso]
    );
    createdTicket = res.rows[0];
  } else {
    createdTicket = {
      id: inMemoryStore.nextId.tickets++,
      ticket_number: ticketNumber,
      customer_id: customerId || undefined,
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      subject: subject.trim(),
      description: description.trim(),
      priority: effectivePriority,
      status: 'OPEN',
      assigned_to: null,
      response_deadline: responseDeadline.toISOString(),
      resolution_deadline: resolutionDeadline.toISOString(),
      first_response_at: null,
      resolved_at: null,
      closed_at: null,
      sla_paused_at: null,
      total_paused_working_minutes: 0,
      created_at: nowIso,
      updated_at: nowIso,
    };
    inMemoryStore.tickets.unshift(createdTicket);
  }

  try {
    await logAuditEvent({
      ticketId: createdTicket.id,
      actorName: customerName.trim(),
      actorRole: 'CUSTOMER',
      action: 'CREATED',
      newState: { priority: effectivePriority, status: 'OPEN' },
      details: `Ticket ${ticketNumber} created by customer.`,
    });
  } catch (auditErr: any) {
    if (pool) {
      await pool.query('DELETE FROM tickets WHERE id = $1', [createdTicket.id]);
    } else {
      const idx = inMemoryStore.tickets.findIndex((t) => t.id === createdTicket.id);
      if (idx !== -1) inMemoryStore.tickets.splice(idx, 1);
    }
    const error: any = new Error(`Audit logging failed: ${auditErr.message}. Ticket creation rolled back.`);
    error.status = 500;
    throw error;
  }

  return createdTicket;
}

/**
 * Exports ticket details with strict data isolation (MSG-11)
 */
export async function exportTicket(ticketIdOrNumber: string | number, isAgentView: boolean = false) {
  const data = await getTicketById(ticketIdOrNumber, isAgentView);
  if (!data) return null;

  return {
    ticketNumber: data.ticket.ticket_number,
    subject: data.ticket.subject,
    status: data.ticket.status,
    priority: data.ticket.priority,
    customerName: data.ticket.customer_name,
    customerEmail: data.ticket.customer_email,
    createdAt: data.ticket.created_at,
    messages: data.messages.map((m) => ({
      senderName: m.sender_name,
      senderRole: m.sender_role,
      content: m.content,
      createdAt: m.created_at,
      ...(isAgentView ? { isInternal: m.is_internal } : {}),
    })),
  };
}
