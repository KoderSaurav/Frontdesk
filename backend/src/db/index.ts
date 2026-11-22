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
  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL;

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

      // Automatically initialize schema and seed if running on new Vercel Postgres instance
      await ensurePostgresSchema(pool);

      return { isPostgres: true };
    } catch (err: any) {
      console.warn(`[Database] PostgreSQL connection failed (${err.message}). Using local in-memory store.`);
      isPostgresConnected = false;
      pool = null;
    }
  } else {
    console.log('[Database] No PostgreSQL connection string found. Initialized in-memory data store.');
  }

  seedInMemoryStore();
  return { isPostgres: false };
}

async function ensurePostgresSchema(pgPool: Pool) {
  try {
    const checkTable = await pgPool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')"
    );
    const tableExists = checkTable.rows[0]?.exists;
    if (!tableExists) {
      console.log('[Database] Initializing PostgreSQL schema on Vercel Postgres...');
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(150) UNIQUE NOT NULL,
            password_hash VARCHAR(255),
            role VARCHAR(20) NOT NULL CHECK (role IN ('AGENT', 'CUSTOMER', 'ADMIN')),
            title VARCHAR(100),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS holidays (
            id SERIAL PRIMARY KEY,
            date DATE UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            ticket_number VARCHAR(20) UNIQUE NOT NULL,
            customer_id INTEGER REFERENCES users(id),
            customer_name VARCHAR(100) NOT NULL,
            customer_email VARCHAR(150) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            priority VARCHAR(20) NOT NULL CHECK (priority IN ('URGENT', 'MEDIUM', 'LOW')),
            status VARCHAR(30) NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED')),
            assigned_to INTEGER REFERENCES users(id),
            response_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
            resolution_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
            first_response_at TIMESTAMP WITH TIME ZONE,
            resolved_at TIMESTAMP WITH TIME ZONE,
            closed_at TIMESTAMP WITH TIME ZONE,
            sla_paused_at TIMESTAMP WITH TIME ZONE,
            total_paused_working_minutes INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
            sender_id INTEGER REFERENCES users(id),
            sender_name VARCHAR(100) NOT NULL,
            sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('AGENT', 'CUSTOMER', 'SYSTEM')),
            is_internal BOOLEAN DEFAULT FALSE,
            content TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
            actor_id INTEGER REFERENCES users(id),
            actor_name VARCHAR(100) NOT NULL,
            actor_role VARCHAR(20) NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            details JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
        CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_email);
        CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit_logs(ticket_id);
      `);

      const defaultHash =
        'frontdesk2026salt:4e65a2dba3b44ce4241d941da4abef66f6d727043509f0261a8ed9d0c55bf3e4fb46eaa9ebbdb776509406abca3604ba63df4b8ef92495b0c537f385a0809b76';

      await pgPool.query(`
        INSERT INTO users (id, name, email, password_hash, role, title) VALUES
        (1, 'Meera', 'meera@arvo.com', '${defaultHash}', 'AGENT', 'Support Lead'),
        (2, 'Rahul', 'rahul@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (3, 'Sneha', 'sneha@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (4, 'Arjun', 'arjun@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (5, 'Priya', 'priya@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (6, 'Anjali', 'anjali@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (7, 'Kiran', 'kiran@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (8, 'Neha', 'neha@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (9, 'Vikram', 'vikram@arvo.com', '${defaultHash}', 'AGENT', 'Support Agent'),
        (101, 'Alex Rivera', 'alex@techcorp.io', '${defaultHash}', 'CUSTOMER', 'CTO at TechCorp'),
        (102, 'Sara Chen', 'sara@cloudflow.com', '${defaultHash}', 'CUSTOMER', 'Ops Lead at CloudFlow'),
        (103, 'David Kim', 'david@finpay.net', '${defaultHash}', 'CUSTOMER', 'DevOps Manager at FinPay')
        ON CONFLICT (email) DO NOTHING;

        SELECT setval('users_id_seq', 200, false);

        INSERT INTO holidays (date, name, description) VALUES
        ('2026-01-26', 'Republic Day', 'National holiday'),
        ('2026-03-25', 'Holi', 'Festival of colors'),
        ('2026-08-15', 'Independence Day', 'National holiday'),
        ('2026-10-02', 'Gandhi Jayanti', 'National holiday'),
        ('2026-11-08', 'Diwali', 'Festival of lights'),
        ('2026-12-25', 'Christmas', 'Christmas holiday')
        ON CONFLICT (date) DO NOTHING;
      `);
      console.log('[Database] PostgreSQL auto-schema and initial seed completed.');
    }
  } catch (err: any) {
    console.warn('[Database] Auto-migration check warning:', err.message);
  }
}

export function getPool(): Pool | null {
  return isPostgresConnected ? pool : null;
}

export function seedInMemoryStore() {
  const defaultHash =
    'frontdesk2026salt:4e65a2dba3b44ce4241d941da4abef66f6d727043509f0261a8ed9d0c55bf3e4fb46eaa9ebbdb776509406abca3604ba63df4b8ef92495b0c537f385a0809b76';

  inMemoryStore.users = [
    { id: 1, name: 'Meera', email: 'meera@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Lead', created_at: new Date().toISOString() },
    { id: 2, name: 'Rahul', email: 'rahul@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 3, name: 'Sneha', email: 'sneha@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 4, name: 'Arjun', email: 'arjun@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 5, name: 'Priya', email: 'priya@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 6, name: 'Anjali', email: 'anjali@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 7, name: 'Kiran', email: 'kiran@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 8, name: 'Neha', email: 'neha@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    { id: 9, name: 'Vikram', email: 'vikram@arvo.com', password_hash: defaultHash, role: 'AGENT', title: 'Support Agent', created_at: new Date().toISOString() },
    
    { id: 101, name: 'Alex Rivera', email: 'alex@techcorp.io', password_hash: defaultHash, role: 'CUSTOMER', title: 'CTO at TechCorp', created_at: new Date().toISOString() },
    { id: 102, name: 'Sara Chen', email: 'sara@cloudflow.com', password_hash: defaultHash, role: 'CUSTOMER', title: 'Ops Lead at CloudFlow', created_at: new Date().toISOString() },
    { id: 103, name: 'David Kim', email: 'david@finpay.net', password_hash: defaultHash, role: 'CUSTOMER', title: 'DevOps Manager at FinPay', created_at: new Date().toISOString() },
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
