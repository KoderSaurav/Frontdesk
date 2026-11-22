import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { Ticket, User } from './types';
import { Navbar } from './components/Navbar';
import { DashboardMetrics } from './components/DashboardMetrics';
import { TicketTable } from './components/TicketTable';
import { TicketDetailModal } from './components/TicketDetailModal';
import { CustomerPortal } from './components/CustomerPortal';
import { NewTicketModal } from './components/NewTicketModal';
import { AlertCircle, CheckCircle2, PlayCircle, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [agents, setAgents] = useState<User[]>([]);
  const [currentAgent, setCurrentAgent] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeView, setActiveView] = useState<'agent' | 'customer'>('agent');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load Agents & Initial Tickets
  const fetchAgentsAndTickets = async () => {
    setIsLoading(true);
    try {
      const agentList = await api.getAgents();
      setAgents(agentList);

      const agentToUse = currentAgent || agentList[0] || null;
      if (!currentAgent && agentList.length > 0) {
        setCurrentAgent(agentList[0]);
      }

      if (agentToUse) {
        await loadTickets(agentToUse.id);
      }
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTickets = async (agentId?: number) => {
    const aid = agentId || currentAgent?.id || 1;
    try {
      const data = await api.getTickets(aid);
      setTickets(data);
    } catch (err: any) {
      console.error('Failed to load tickets:', err);
    }
  };

  useEffect(() => {
    fetchAgentsAndTickets();
    // Auto refresh every 30s to keep SLA countdowns fresh
    const interval = setInterval(() => {
      if (currentAgent) loadTickets(currentAgent.id);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectAgent = (agent: User) => {
    setCurrentAgent(agent);
    loadTickets(agent.id);
    setNotification({
      type: 'success',
      message: `Active identity switched to ${agent.name} (${agent.title || 'Agent'}).`,
    });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleQuickAssign = async (ticketId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentAgent) return;

    try {
      await api.assignTicket(ticketId, currentAgent.id);
      setNotification({
        type: 'success',
        message: `Ticket successfully claimed by ${currentAgent.name}.`,
      });
      loadTickets(currentAgent.id);
    } catch (err: any) {
      // INC-0291 Concurrency Conflict Caught
      setNotification({
        type: 'error',
        message: err.message || 'Ticket assignment conflict. Another agent has already taken this ticket.',
      });
    }
    setTimeout(() => setNotification(null), 4500);
  };

  const handleRunAutoCloseCheck = async () => {
    if (!currentAgent) return;
    try {
      const msg = await api.runAutoCloseCheck(currentAgent.id);
      setNotification({ type: 'success', message: msg });
      loadTickets(currentAgent.id);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
    setTimeout(() => setNotification(null), 4500);
  };

  // Filter & Search Tickets
  const filteredTickets = tickets.filter((t) => {
    // Active Metric Filter
    if (activeFilter === 'MINE' && currentAgent && t.assigned_to !== currentAgent.id) {
      return false;
    }
    if (activeFilter === 'OVERDUE') {
      const isOverdue = t.sla_status?.is_response_overdue || t.sla_status?.is_resolution_overdue;
      if (!isOverdue) return false;
    }
    if (activeFilter === 'WAITING' && t.status !== 'WAITING_FOR_CUSTOMER') {
      return false;
    }
    if (activeFilter === 'RESOLVED' && t.status !== 'RESOLVED' && t.status !== 'CLOSED') {
      return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        t.ticket_number.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.customer_name.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar with 1-Click Agent Switcher */}
      <Navbar
        agents={agents}
        currentAgent={currentAgent}
        onSelectAgent={handleSelectAgent}
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenNewTicket={() => setIsNewTicketOpen(true)}
        onRefresh={() => {
          if (currentAgent) loadTickets(currentAgent.id);
        }}
        isLoading={isLoading}
      />

      {/* Global Notification Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2.5 animate-slide-up ${
            notification.type === 'error'
              ? 'bg-rose-950 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950 border-emerald-500/50 text-emerald-200'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeView === 'customer' ? (
          /* Customer Portal Sandbox View (Demonstrating Note Isolation) */
          <CustomerPortal
            onBackToAgent={() => setActiveView('agent')}
            onOpenNewTicket={() => setIsNewTicketOpen(true)}
          />
        ) : (
          /* Agent Workspace (Single-Screen Command Center) */
          <>
            {/* Top Metric Cards Bar */}
            <DashboardMetrics
              tickets={tickets}
              currentAgent={currentAgent}
              activeFilter={activeFilter}
              onSelectFilter={setActiveFilter}
            />

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl px-4 py-2.5 mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>
                  Support queue active. Operating schedule: <strong>Mon–Fri, 9:30 AM – 6:30 PM</strong>.
                </span>
              </div>
              <button
                onClick={handleRunAutoCloseCheck}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-650 text-slate-200 font-medium transition-colors"
                title="Evaluate inactive tickets and run automated status transitions"
              >
                <PlayCircle className="w-3.5 h-3.5 text-slate-300" />
                <span>Run Inactivity Check</span>
              </button>
            </div>

            {/* Main Ticket Queue Table */}
            <TicketTable
              tickets={filteredTickets}
              currentAgent={currentAgent}
              onOpenTicket={(ticket) => setSelectedTicket(ticket)}
              onQuickAssign={handleQuickAssign}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
            />
          </>
        )}
      </main>

      {/* Ticket Details & Conversation Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          currentAgent={currentAgent}
          onClose={() => setSelectedTicket(null)}
          onTicketUpdated={() => {
            if (currentAgent) loadTickets(currentAgent.id);
          }}
        />
      )}

      {/* New Ticket Creation Modal */}
      {isNewTicketOpen && (
        <NewTicketModal
          onClose={() => setIsNewTicketOpen(false)}
          onTicketCreated={() => {
            if (currentAgent) loadTickets(currentAgent.id);
            setNotification({
              type: 'success',
              message: 'New support ticket created and SLA timers initialized!',
            });
            setTimeout(() => setNotification(null), 3500);
          }}
        />
      )}
    </div>
  );
};

export default App;
