-- Frontdesk Support Management System Database Schema
-- Compatible with PostgreSQL 13+

-- Drop existing tables if re-migrating
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users table (Support Agents & Customers)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('AGENT', 'CUSTOMER', 'ADMIN')),
    title VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Festival & Non-Working Holidays Calendar
CREATE TABLE holidays (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

-- 3. Tickets table
CREATE TABLE tickets (
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
    
    -- SLA Deadlines (Computed strictly using working hours)
    response_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    resolution_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- SLA Milestones
    first_response_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Paused SLA Tracking (When in WAITING_FOR_CUSTOMER status)
    sla_paused_at TIMESTAMP WITH TIME ZONE,
    total_paused_working_minutes INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Messages (Public customer replies vs Private internal team notes)
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id),
    sender_name VARCHAR(100) NOT NULL,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('AGENT', 'CUSTOMER', 'SYSTEM')),
    is_internal BOOLEAN NOT NULL DEFAULT FALSE, -- FALSE = Public Reply, TRUE = Private Internal Note
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Audit Trail
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id),
    actor_name VARCHAR(100) NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_state JSONB,
    new_state JSONB,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for rapid querying
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_messages_ticket_id ON messages(ticket_id);
CREATE INDEX idx_audit_logs_ticket_id ON audit_logs(ticket_id);
