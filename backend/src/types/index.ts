export type UserRole = 'AGENT' | 'CUSTOMER' | 'ADMIN';
export type TicketPriority = 'URGENT' | 'MEDIUM' | 'LOW';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type MessageSenderRole = 'AGENT' | 'CUSTOMER' | 'SYSTEM';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash?: string;
  role: UserRole;
  title?: string;
  created_at: string;
}

export interface AuthTokenPayload {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  title?: string;
}

export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
  description?: string;
}

export interface Ticket {
  id: number;
  ticket_number: string;
  customer_id?: number;
  customer_name: string;
  customer_email: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to?: number | null;
  assigned_agent_name?: string | null;
  
  // SLA Deadlines & Milestones
  response_deadline: string; // ISO string
  resolution_deadline: string; // ISO string
  first_response_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  
  // Paused SLA tracking
  sla_paused_at?: string | null;
  total_paused_working_minutes: number;
  
  created_at: string;
  updated_at: string;

  // Dynamically computed SLA metrics for client display
  sla_status?: {
    is_response_overdue: boolean;
    is_resolution_overdue: boolean;
    was_response_sla_breached?: boolean;
    was_resolution_sla_breached?: boolean;
    response_remaining_minutes: number;
    resolution_remaining_minutes: number;
    response_remaining_formatted: string;
    resolution_remaining_formatted: string;
    is_paused: boolean;
  };
}

export interface Message {
  id: number;
  ticket_id: number;
  sender_id?: number | null;
  sender_name: string;
  sender_role: MessageSenderRole;
  is_internal: boolean; // CRITICAL: FALSE = Public, TRUE = Internal note
  content: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  ticket_id: number;
  actor_id?: number | null;
  actor_name: string;
  actor_role: string;
  action: string;
  old_state?: any;
  new_state?: any;
  details?: string;
  created_at: string;
}
