import React from 'react';
import { Ticket, User } from '../types';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  PauseCircle,
  UserPlus,
  Flame,
  Search,
  ArrowRight,
} from 'lucide-react';

interface TicketTableProps {
  tickets: Ticket[];
  currentAgent: User | null;
  onOpenTicket: (ticket: Ticket) => void;
  onQuickAssign: (ticketId: number, e: React.MouseEvent) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export const TicketTable: React.FC<TicketTableProps> = ({
  tickets,
  currentAgent,
  onOpenTicket,
  onQuickAssign,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
}) => {
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Flame className="w-3 h-3 text-rose-500 animate-pulse" />
            Urgent
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Medium
          </span>
        );
      case 'LOW':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
            Low
          </span>
        );
      default:
        return <span>{priority}</span>;
    }
  };

  const getStatusBadge = (status: string, isPaused: boolean = false) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            Open
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">
            In Progress
          </span>
        );
      case 'WAITING_FOR_CUSTOMER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <PauseCircle className="w-3 h-3 text-amber-400" />
            Waiting on Customer
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Resolved
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
            Closed
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const renderSlaBadge = (ticket: Ticket) => {
    const sla = ticket.sla_status;
    if (!sla) return null;

    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
          <CheckCircle className="w-3.5 h-3.5" />
          Completed
        </span>
      );
    }

    if (sla.is_paused) {
      return (
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
            <PauseCircle className="w-3.5 h-3.5" />
            Timer Paused
          </span>
          <span className="text-[10px] text-slate-400">Waiting on customer reply</span>
        </div>
      );
    }

    if (sla.is_response_overdue || sla.is_resolution_overdue) {
      const overdueText = sla.is_response_overdue
        ? sla.response_remaining_formatted
        : sla.resolution_remaining_formatted;

      return (
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            {overdueText}
          </span>
          <span className="text-[10px] text-rose-400 font-medium">
            {sla.is_response_overdue ? 'First response late' : 'Resolution late'}
          </span>
        </div>
      );
    }

    // Normal running SLA
    const remainingText = !ticket.first_response_at
      ? sla.response_remaining_formatted
      : sla.resolution_remaining_formatted;

    return (
      <div className="flex flex-col">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
          <Clock className="w-3.5 h-3.5" />
          {remainingText}
        </span>
        <span className="text-[10px] text-slate-400">
          {!ticket.first_response_at ? 'Response SLA' : 'Resolution SLA'}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 shadow-xl overflow-hidden backdrop-blur-sm">
      {/* Header controls & filters */}
      <div className="p-4 sm:p-5 border-b border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ticket #, customer, or subject..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-900/90 text-sm text-white placeholder-slate-400 rounded-xl pl-10 pr-4 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {['ALL', 'MINE', 'OVERDUE', 'WAITING', 'RESOLVED'].map((filter) => (
            <button
              key={filter}
              onClick={() => onFilterChange(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter === filter
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900/60 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              {filter === 'ALL' && 'All Tickets'}
              {filter === 'MINE' && `Assigned to Me`}
              {filter === 'OVERDUE' && 'Overdue'}
              {filter === 'WAITING' && 'Waiting on Customer'}
              {filter === 'RESOLVED' && 'Resolved'}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket List Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-850/90 border-b border-slate-700/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4 sm:px-6">Ticket ID</th>
              <th className="py-3 px-4">Subject & Customer</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Assigned Agent</th>
              <th className="py-3 px-4">SLA Countdown</th>
              <th className="py-3 px-4 sm:px-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 text-sm">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <Clock className="w-8 h-8 text-slate-500 mb-2" />
                    <p className="font-medium text-slate-300">No tickets found</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try adjusting your search or active filter</p>
                  </div>
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => {
                const isAssignedToMe = currentAgent && ticket.assigned_to === currentAgent.id;

                return (
                  <tr
                    key={ticket.id}
                    onClick={() => onOpenTicket(ticket)}
                    className="hover:bg-slate-750/70 transition-colors cursor-pointer group"
                  >
                    {/* Ticket ID */}
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-indigo-400 group-hover:text-indigo-300">
                        {ticket.ticket_number}
                      </span>
                    </td>

                    {/* Subject & Customer */}
                    <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                      <div className="font-medium text-white truncate group-hover:text-indigo-200">
                        {ticket.subject}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span className="text-slate-300 font-medium">{ticket.customer_name}</span>
                        <span>•</span>
                        <span>{ticket.customer_email}</span>
                      </div>
                    </td>

                    {/* Priority */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getPriorityBadge(ticket.priority)}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getStatusBadge(ticket.status, ticket.sla_status?.is_paused)}
                    </td>

                    {/* Assigned To */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {ticket.assigned_agent_name ? (
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isAssignedToMe
                                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                                : 'bg-slate-700 text-slate-200'
                            }`}
                          >
                            {ticket.assigned_agent_name.charAt(0)}
                          </div>
                          <span
                            className={`text-xs ${
                              isAssignedToMe ? 'font-semibold text-indigo-300' : 'text-slate-300'
                            }`}
                          >
                            {ticket.assigned_agent_name}
                            {isAssignedToMe && ' (You)'}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => onQuickAssign(ticket.id, e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-600 hover:text-white border border-indigo-500/40 transition-all shadow-sm"
                          title="Claim this ticket as current agent"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Take Ticket</span>
                        </button>
                      )}
                    </td>

                    {/* SLA Status Countdown */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderSlaBadge(ticket)}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTicket(ticket);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
