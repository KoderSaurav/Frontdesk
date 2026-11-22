import { Holiday, Message, Ticket, TicketPriority, TicketStatus, User, AuditLog } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '';
const CUSTOMER_TOKEN_KEY = 'frontdesk_customer_token';
const CUSTOMER_USER_KEY = 'frontdesk_customer_user';
const AGENT_TOKEN_KEY = 'frontdesk_agent_token';
const AGENT_USER_KEY = 'frontdesk_agent_user';

export function getCustomerToken(): string | null {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

export function setCustomerSession(token: string, user: any) {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  localStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user));
}

export function clearCustomerSession() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_USER_KEY);
}

export function getStoredCustomerUser(): any | null {
  const raw = localStorage.getItem(CUSTOMER_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAgentToken(): string | null {
  return localStorage.getItem(AGENT_TOKEN_KEY);
}

export function setAgentSession(token: string, user: any) {
  localStorage.setItem(AGENT_TOKEN_KEY, token);
  localStorage.setItem(AGENT_USER_KEY, JSON.stringify(user));
}

export function clearAgentSession() {
  localStorage.removeItem(AGENT_TOKEN_KEY);
  localStorage.removeItem(AGENT_USER_KEY);
}

export function getStoredAgentUser(): any | null {
  const raw = localStorage.getItem(AGENT_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getCustomerAuthHeaders(): Record<string, string> {
  const token = getCustomerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Support Agent API
  async getAgents(): Promise<User[]> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/agents`);
    const data = await res.json();
    return data.data || [];
  },

  async getTickets(
    currentAgentId: number,
    params?: { status?: string; priority?: string; assignedTo?: number; search?: string }
  ): Promise<Ticket[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.assignedTo) query.set('assignedTo', String(params.assignedTo));
    if (params?.search) query.set('search', params.search);

    const res = await fetch(`${BASE_URL}/api/v1/agent/tickets?${query.toString()}`, {
      headers: {
        'x-agent-id': String(currentAgentId),
      },
    });
    const data = await res.json();
    return data.data || [];
  },

  async getTicketDetail(
    ticketId: number | string,
    currentAgentId: number
  ): Promise<{ ticket: Ticket; messages: Message[] }> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/tickets/${ticketId}`, {
      headers: {
        'x-agent-id': String(currentAgentId),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch ticket');
    return data.data;
  },

  async assignTicket(ticketId: number, currentAgentId: number): Promise<Ticket> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': String(currentAgentId),
      },
      body: JSON.stringify({ agentId: currentAgentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      const error: any = new Error(data.error || 'Failed to assign ticket');
      error.status = res.status;
      error.code = data.code;
      throw error;
    }
    return data.data;
  },

  async sendMessage(
    ticketId: number,
    currentAgentId: number,
    isInternal: boolean,
    content: string
  ): Promise<Message> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': String(currentAgentId),
      },
      body: JSON.stringify({ isInternal, content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return data.data;
  },

  async updateStatus(ticketId: number, currentAgentId: number, status: TicketStatus): Promise<Ticket> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': String(currentAgentId),
      },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update status');
    return data.data;
  },

  async updatePriority(ticketId: number, currentAgentId: number, priority: TicketPriority): Promise<Ticket> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/tickets/${ticketId}/priority`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': String(currentAgentId),
      },
      body: JSON.stringify({ priority }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update priority');
    return data.data;
  },

  async getAuditTrail(ticketId: number, currentAgentId: number): Promise<AuditLog[]> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/tickets/${ticketId}/audit-trail`, {
      headers: {
        'x-agent-id': String(currentAgentId),
      },
    });
    const data = await res.json();
    return data.data;
  },

  async getHolidays(): Promise<Holiday[]> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/holidays`);
    const data = await res.json();
    return data.data;
  },

  async runAutoCloseCheck(currentAgentId: number): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/v1/agent/auto-close-check`, {
      method: 'POST',
      headers: {
        'x-agent-id': String(currentAgentId),
      },
    });
    const data = await res.json();
    return data.message;
  },

  // Customer Authentication API
  async registerCustomer(payload: { name: string; email: string; password: string }) {
    const res = await fetch(`${BASE_URL}/api/v1/auth/customer/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setCustomerSession(data.data.token, data.data.user);
    return data.data;
  },

  async loginCustomer(payload: { email: string; password: string }) {
    const res = await fetch(`${BASE_URL}/api/v1/auth/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setCustomerSession(data.data.token, data.data.user);
    return data.data;
  },

  async loginAgent(payload: { email: string; password: string }) {
    const res = await fetch(`${BASE_URL}/api/v1/auth/agent/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Agent login failed');
    setAgentSession(data.data.token, data.data.user);
    return data.data;
  },

  async getCustomerMe() {
    const token = getCustomerToken();
    if (!token) return null;
    const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: getCustomerAuthHeaders(),
    });
    if (!res.ok) {
      clearCustomerSession();
      return null;
    }
    const data = await res.json();
    return data.data.user;
  },

  // Customer Portal API
  async getMyTickets(): Promise<Ticket[]> {
    const res = await fetch(`${BASE_URL}/api/v1/customer/my-tickets`, {
      headers: getCustomerAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch tickets');
    return data.data;
  },

  async customerGetTicket(ticketNumber: string) {
    const res = await fetch(`${BASE_URL}/api/v1/customer/tickets/${ticketNumber}`, {
      headers: getCustomerAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ticket not found');
    return data.data;
  },

  async customerCreateTicket(payload: {
    customerName: string;
    customerEmail: string;
    subject: string;
    description: string;
    priority?: TicketPriority;
  }) {
    const res = await fetch(`${BASE_URL}/api/v1/customer/tickets`, {
      method: 'POST',
      headers: getCustomerAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create ticket');
    return data.data;
  },

  async customerReply(ticketNumber: string, content: string, customerName?: string) {
    const res = await fetch(`${BASE_URL}/api/v1/customer/tickets/${ticketNumber}/reply`, {
      method: 'POST',
      headers: getCustomerAuthHeaders(),
      body: JSON.stringify({ content, customerName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send reply');
    return data.data;
  },

  async customerReopen(ticketNumber: string, reason: string) {
    const res = await fetch(`${BASE_URL}/api/v1/customer/tickets/${ticketNumber}/reopen`, {
      method: 'POST',
      headers: getCustomerAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reopen ticket');
    return data.data;
  },
};
