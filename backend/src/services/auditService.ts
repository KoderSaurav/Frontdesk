import { inMemoryStore, getPool } from '../db';
import { AuditLog } from '../types';

let mockAuditFailure = false;

export function setMockAuditFailure(shouldFail: boolean) {
  mockAuditFailure = shouldFail;
}

export async function logAuditEvent({
  ticketId,
  actorId = null,
  actorName,
  actorRole,
  action,
  oldState = null,
  newState = null,
  details = '',
}: {
  ticketId: number;
  actorId?: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  oldState?: any;
  newState?: any;
  details?: string;
}): Promise<AuditLog> {
  if (mockAuditFailure) {
    throw new Error('Database disk full / audit partition offline');
  }

  const timestamp = new Date().toISOString();
  const pool = getPool();

  if (pool) {
    const res = await pool.query(
      `INSERT INTO audit_logs (ticket_id, actor_id, actor_name, actor_role, action, old_state, new_state, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [ticketId, actorId, actorName, actorRole, action, oldState ? JSON.stringify(oldState) : null, newState ? JSON.stringify(newState) : null, details, timestamp]
    );
    return res.rows[0];
  }

  // In-memory fallback
  const log: AuditLog = {
    id: inMemoryStore.nextId.audit_logs++,
    ticket_id: ticketId,
    actor_id: actorId,
    actor_name: actorName,
    actor_role: actorRole,
    action,
    old_state: oldState,
    new_state: newState,
    details,
    created_at: timestamp,
  };

  inMemoryStore.audit_logs.push(log);
  return log;
}

export async function getAuditLogsForTicket(ticketId: number): Promise<AuditLog[]> {
  const pool = getPool();
  if (pool) {
    const res = await pool.query(
      'SELECT * FROM audit_logs WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticketId]
    );
    return res.rows;
  }

  return inMemoryStore.audit_logs
    .filter((log) => log.ticket_id === ticketId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
