-- Seed Data for Frontdesk Support System

-- 1. Support Agents
INSERT INTO users (id, name, email, role, title) VALUES
(1, 'Meera', 'meera@arvo.com', 'AGENT', 'Support Lead'),
(2, 'Rahul', 'rahul@arvo.com', 'AGENT', 'Support Agent'),
(3, 'Sneha', 'sneha@arvo.com', 'AGENT', 'Support Agent'),
(4, 'Arjun', 'arjun@arvo.com', 'AGENT', 'Support Agent'),
(5, 'Priya', 'priya@arvo.com', 'AGENT', 'Support Agent'),
(6, 'Anjali', 'anjali@arvo.com', 'AGENT', 'Support Agent'),
(7, 'Kiran', 'kiran@arvo.com', 'AGENT', 'Support Agent'),
(8, 'Neha', 'neha@arvo.com', 'AGENT', 'Support Agent'),
(9, 'Vikram', 'vikram@arvo.com', 'AGENT', 'Support Agent')
ON CONFLICT (email) DO NOTHING;

-- 2. Insert Sample Customers
INSERT INTO users (id, name, email, role, title) VALUES
(101, 'Alex Rivera', 'alex@techcorp.io', 'CUSTOMER', 'CTO at TechCorp'),
(102, 'Sara Chen', 'sara@cloudflow.com', 'CUSTOMER', 'Ops Lead at CloudFlow'),
(103, 'David Kim', 'david@finpay.net', 'CUSTOMER', 'DevOps Manager at FinPay'),
(104, 'Anita Rao', 'anita@quickretail.in', 'CUSTOMER', 'Store Manager at QuickRetail')
ON CONFLICT (email) DO NOTHING;

-- 3. Festival Holidays Calendar
INSERT INTO holidays (date, name, description) VALUES
('2026-01-26', 'Republic Day', 'National holiday'),
('2026-03-25', 'Holi', 'Festival of colors'),
('2026-08-15', 'Independence Day', 'National holiday'),
('2026-10-02', 'Gandhi Jayanti', 'National holiday'),
('2026-11-08', 'Diwali', 'Festival of lights'),
('2026-12-25', 'Christmas', 'Christmas holiday')
ON CONFLICT (date) DO NOTHING;
