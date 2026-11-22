import { Pool } from 'pg';
import dotenv from 'dotenv';
import { Holiday, Message, Ticket, User, AuditLog } from '../types';
import { calculateInitialDeadlines } from '../services/slaEngine';

dotenv.config();

let pool: Pool | null = null;
let isPostgresConnected = false;

export const inMemoryStore = {
  users: [] as User[],
  holidays: [] as Holiday[],
  tickets: [] as Ticket[],
  messages: [] as Message[],
  audit_logs: [] as AuditLog[],
  nextId: {
    users: 200,
    holidays: 20,
    tickets: 100,
    messages: 100,
    audit_logs: 100,
  },
};

export async function initDatabase(): Promise<{ isPostgres: boolean }> {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    try {
      pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      const res = await pool.query('SELECT NOW()');
      isPostgresConnected = true;
      console.log(`[Database] Connected to PostgreSQL instance (${res.rows[0].now})`);
      return { isPostgres: true };
    } catch (err: any) {
      console.warn(`[Database] PostgreSQL connection failed (${err.message}). Using local in-memory store.`);
      isPostgresConnected = false;
      pool = null;
    }
  } else {
    console.log('[Database] DATABASE_URL not set. Initialized in-memory data store.');
  }

  seedInMemoryStore();
  return { isPostgres: false };
}

export function getPool(): Pool | null {
  return isPostgresConnected ? pool : null;
}

export function seedInMemoryStore() {
  inMemoryStore.users = [
    { id: 1, name: 'Meera', email: 'meera@arvo.com', role: 'AGENT', title: 'Support Lead', created_at: new Date().toISOString() },
    { id: 2, name: 'Rahul', email: 'rahul@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 3, name: 'Sneha', email: 'sneha@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 4, name: 'Arjun', email: 'arjun@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 5, name: 'Priya', email: 'priya@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 6, name: 'Anjali', email: 'anjali@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 7, name: 'Kiran', email: 'kiran@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 8, name: 'Neha', email: 'neha@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 9, name: 'Vikram', email: 'vikram@arvo.com', role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    
    { id: 101, name: 'Alex Rivera', email: 'alex@techcorp.io', role: 'CUSTOMER', title: 'CTO at TechCorp', created_at: new Date().toISOString() },
    { id: 102, name: 'Sara Chen', email: 'sara@cloudflow.com', role: 'CUSTOMER', title: 'Ops Lead at CloudFlow', created_at: new Date().toISOString() },
    { id: 103, name: 'David Kim', email: 'david@finpay.net', role: 'CUSTOMER', title: 'DevOps Manager at FinPay', created_at: new Date().toISOString() },
  ];

  inMemoryStore.holidays = [
    { id: 1, date: '2026-01-26', name: 'Republic Day', description: 'National holiday' },
    { id: 2, date: '2026-08-15', name: 'Independence Day', description: 'National holiday' },
    { id: 3, date: '2026-10-02', name: 'Gandhi Jayanti', description: 'National holiday' },
    { id: 4, date: '2026-11-08', name: 'Diwali', description: 'Festival holiday' },
    { id: 5, date: '2026-12-25', name: 'Christmas', description: 'Christmas holiday' },
  ];

  const now = new Date();
  const urgentDeadlines = calculateInitialDeadlines(now, 'URGENT', inMemoryStore.holidays);
  const mediumDeadlines = calculateInitialDeadlines(now, 'MEDIUM', inMemoryStore.holidays);

  inMemoryStore.tickets = [
    {
      id: 1,
      ticket_number: 'INC-0291',
      customer_id: 101,
      customer_name: 'Alex Rivera',
      customer_email: 'alex@techcorp.io',
      subject: 'Critical billing checkout error on checkout API',
      description: 'Payment was deducted from customer credit card, but webhook returned 500 and order was marked failed.',
      priority: 'URGENT',
      status: 'OPEN',
      assigned_to: null,
      response_deadline: urgentDeadlines.responseDeadline.toISOString(),
      resolution_deadline: urgentDeadlines.resolutionDeadline.toISOString(),
      first_response_at: null,
      resolved_at: null,
      closed_at: null,
      sla_paused_at: null,
      total_paused_working_minutes: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: 2,
      ticket_number: 'INC-0304',
      customer_id: 102,
      customer_name: 'Sara Chen',
      customer_email: 'sara@cloudflow.com',
      subject: 'Enterprise SSO federation failing with SAML response mismatch',
      description: 'Our identity provider certificate was renewed, but Arvo SSO gateway rejects SAML assertion.',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      assigned_to: 1,
      assigned_agent_name: 'Meera',
      response_deadline: mediumDeadlines.responseDeadline.toISOString(),
      resolution_deadline: mediumDeadlines.resolutionDeadline.toISOString(),
      first_response_at: now.toISOString(),
      resolved_at: null,
      closed_at: null,
      sla_paused_at: null,
      total_paused_working_minutes: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: 3,
      ticket_number: 'INC-0318',
      customer_id: 103,
      customer_name: 'David Kim',
      customer_email: 'david@finpay.net',
      subject: 'Clarification on bulk transaction export limits',
      description: 'Exporting 50,000 records times out after 60 seconds. What is the recommended batch size?',
      priority: 'LOW',
      status: 'WAITING_FOR_CUSTOMER',
      assigned_to: 2,
      assigned_agent_name: 'Rahul',
      response_deadline: mediumDeadlines.responseDeadline.toISOString(),
      resolution_deadline: mediumDeadlines.resolutionDeadline.toISOString(),
      first_response_at: now.toISOString(),
      resolved_at: null,
      closed_at: null,
      sla_paused_at: now.toISOString(),
      total_paused_working_minutes: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ];

  inMemoryStore.messages = [
    {
      id: 1,
      ticket_id: 2,
      sender_id: 1,
      sender_name: 'Meera',
      sender_role: 'AGENT',
      is_internal: false,
      content: 'Hello Sara, thank you for reaching out. We are reviewing the SAML assertion certificate configuration on our gateway.',
      created_at: now.toISOString(),
    },
    {
      id: 2,
      ticket_id: 2,
      sender_id: 1,
      sender_name: 'Meera',
      sender_role: 'AGENT',
      is_internal: true,
      content: 'Internal note: Customer renewed cert yesterday. Check gateway log cluster B before patching metadata XML.',
      created_at: now.toISOString(),
    },
    {
      id: 3,
      ticket_id: 3,
      sender_id: 2,
      sender_name: 'Rahul',
      sender_role: 'AGENT',
      is_internal: false,
      content: 'Hi David, could you let us know whether you are calling the CSV export endpoint or JSON streaming API?',
      created_at: now.toISOString(),
    },
  ];

  inMemoryStore.audit_logs = [
    {
      id: 1,
      ticket_id: 1,
      actor_name: 'Alex Rivera',
      actor_role: 'CUSTOMER',
      action: 'CREATED',
      new_state: { priority: 'URGENT', status: 'OPEN' },
      details: 'Ticket INC-0291 created by customer.',
      created_at: now.toISOString(),
    },
    {
      id: 2,
      ticket_id: 2,
      actor_name: 'Sara Chen',
      actor_role: 'CUSTOMER',
      action: 'CREATED',
      new_state: { priority: 'MEDIUM', status: 'OPEN' },
      details: 'Ticket INC-0304 created by customer.',
      created_at: now.toISOString(),
    },
    {
      id: 3,
      ticket_id: 2,
      actor_id: 1,
      actor_name: 'Meera',
      actor_role: 'AGENT',
      action: 'ASSIGNED',
      new_state: { assigned_to: 1, assigned_agent_name: 'Meera' },
      details: 'Meera assigned ticket to self.',
      created_at: now.toISOString(),
    },
    {
      id: 4,
      ticket_id: 2,
      actor_id: 1,
      actor_name: 'Meera',
      actor_role: 'AGENT',
      action: 'REPLIED',
      details: 'Public reply sent to customer.',
      created_at: now.toISOString(),
    },
    {
      id: 5,
      ticket_id: 2,
      actor_id: 1,
      actor_name: 'Meera',
      actor_role: 'AGENT',
      action: 'NOTE_ADDED',
      details: 'Internal note added to ticket.',
      created_at: now.toISOString(),
    },
  ];

  console.log('[Database] Seeded initial support queue and agents.');
}
