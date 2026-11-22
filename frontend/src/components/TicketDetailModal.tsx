import React, { useState, useEffect } from 'react';
import { Message, Ticket, TicketPriority, TicketStatus, User, AuditLog } from '../types';
import { api } from '../services/api';
import {
  X,
  Send,
  Lock,
  MessageSquare,
  Clock,
  Shield,
  UserCheck,
  PauseCircle,
  AlertTriangle,
  History,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface TicketDetailModalProps {
  ticket: Ticket;
  currentAgent: User | null;
  onClose: () => void;
  onTicketUpdated: () => void;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  currentAgent,
  onClose,
  onTicketUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'conversation' | 'audit'>('conversation');
  const [messages, setMessages] = useState<Message[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [currentTicket, setCurrentTicket] = useState<Ticket>(ticket);
  const [isLoading, setIsLoading] = useState(false);

  // Composer state
  const [composerMode, setComposerMode] = useState<'public' | 'internal'>('public');
  const [messageContent, setMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [concurrencyError, setConcurrencyError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchDetail = async () => {
    if (!currentAgent) return;
    setIsLoading(true);
    try {
      const data = await api.getTicketDetail(ticket.id, currentAgent.id);
      setCurrentTicket(data.ticket);
      setMessages(data.messages);

      const logs = await api.getAuditTrail(ticket.id, currentAgent.id);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error('Failed to load ticket details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [ticket.id, currentAgent?.id]);

  const handleAssignToMe = async () => {
    if (!currentAgent) return;
    setConcurrencyError(null);
    setSuccessMessage(null);
    try {
      const updated = await api.assignTicket(currentTicket.id, currentAgent.id);
      setCurrentTicket(updated);
      setSuccessMessage(`Successfully claimed ticket as ${currentAgent.name}!`);
      await fetchDetail();
      onTicketUpdated();
    } catch (err: any) {
      // Concurrency conflict check
      setConcurrencyError(err.message || 'Failed to assign ticket.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || !currentAgent) return;

    setIsSending(true);
    setConcurrencyError(null);
    try {
      const isInternal = composerMode === 'internal';
      await api.sendMessage(currentTicket.id, currentAgent.id, isInternal, messageContent.trim());
      setMessageContent('');
      await fetchDetail();
      onTicketUpdated();
    } catch (err: any) {
      alert(`Error sending message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!currentAgent) return;
    try {
      await api.updateStatus(currentTicket.id, currentAgent.id, newStatus);
      await fetchDetail();
      onTicketUpdated();
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handlePriorityChange = async (newPriority: TicketPriority) => {
    if (!currentAgent) return;
    try {
      await api.updatePriority(currentTicket.id, currentAgent.id, newPriority);
      await fetchDetail();
      onTicketUpdated();
    } catch (err: any) {
      alert(`Failed to update priority: ${err.message}`);
    }
  };

  const isAssignedToCurrent = currentAgent && currentTicket.assigned_to === currentAgent.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {currentTicket.ticket_number}
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white line-clamp-1">
                {currentTicket.subject}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>Customer: <strong className="text-slate-200">{currentTicket.customer_name}</strong></span>
                <span>•</span>
                <span>{currentTicket.customer_email}</span>
                <span>•</span>
                <span>Created: {new Date(currentTicket.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Claim Ticket Button */}
            {!currentTicket.assigned_to && (
              <button
                onClick={handleAssignToMe}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all active:scale-95"
              >
                <UserCheck className="w-4 h-4" />
                <span>Take this ticket</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Concurrency & Feedback Banners */}
        {concurrencyError && (
          <div className="bg-rose-500/15 border-b border-rose-500/30 px-6 py-3 flex items-center gap-2 text-rose-300 text-xs font-semibold animate-pulse">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{concurrencyError}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-6 py-2.5 flex items-center gap-2 text-emerald-300 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Status & Priority Control Ribbon */}
        <div className="px-6 py-3 bg-slate-800/40 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Status Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Status:</span>
              <select
                value={currentTicket.status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                className="bg-slate-800 text-white rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="WAITING_FOR_CUSTOMER">Waiting on Customer (Pauses SLA)</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            {/* Priority Selector with SLA recalculation notice */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Priority:</span>
              <select
                value={currentTicket.priority}
                onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                className="bg-slate-800 text-white rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                <option value="URGENT">Urgent (2h Response, Same Day Fix)</option>
                <option value="MEDIUM">Medium (4.5h Response, 3 Days Fix)</option>
                <option value="LOW">Low (1 Day Response, 1 Week Fix)</option>
              </select>
            </div>

            {/* Assigned Agent display */}
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-400">Assigned:</span>
              <span className="font-semibold text-indigo-300">
                {currentTicket.assigned_agent_name || 'Unassigned'}
              </span>
            </div>
          </div>

          {/* SLA Status Widget */}
          <div className="flex items-center gap-3">
            {currentTicket.sla_status?.is_paused ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300">
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium">Timer Paused (Waiting on customer)</span>
              </div>
            ) : currentTicket.sla_status?.is_response_overdue || currentTicket.sla_status?.is_resolution_overdue ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>
                  {currentTicket.sla_status.is_response_overdue
                    ? currentTicket.sla_status.response_remaining_formatted
                    : currentTicket.sla_status.resolution_remaining_formatted}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {!currentTicket.first_response_at
                    ? `Response: ${currentTicket.sla_status?.response_remaining_formatted}`
                    : `Resolution: ${currentTicket.sla_status?.resolution_remaining_formatted}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* View Switcher: Conversation vs Immutable Audit Trail */}
        <div className="flex border-b border-slate-800 bg-slate-900 px-6">
          <button
            onClick={() => setActiveTab('conversation')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'conversation'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Conversation & Notes ({messages.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'audit'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>Immutable Audit Trail ({auditLogs.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'audit' ? (
            /* Audit Trail View */
            <div className="space-y-3">
              <div className="bg-slate-800/40 border border-slate-700/60 p-3 rounded-xl mb-4 text-xs text-slate-300 flex items-start gap-2">
                <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Audit Trail:</strong> Chronological log of ticket actions, assignments, and status transitions.
                </div>
              </div>

              <div className="relative border-l border-slate-700/80 ml-4 space-y-4">
                {auditLogs.map((log) => (
                  <div key={log.id} className="relative pl-6">
                    {/* Timeline bullet */}
                    <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-slate-900 border-2 border-indigo-400" />
                    <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-indigo-300">
                          {log.actor_name} ({log.actor_role})
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-slate-200 font-medium">{log.details}</div>
                      {log.new_state && (
                        <div className="mt-1.5 p-1.5 rounded bg-slate-900/60 font-mono text-[10px] text-slate-400">
                          State: {JSON.stringify(log.new_state)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Conversation Thread */
            <>
              {/* Original Customer Problem Description */}
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">
                      {currentTicket.customer_name.charAt(0)}
                    </div>
                    <div>
                      <span className="font-semibold text-white text-xs">{currentTicket.customer_name}</span>
                      <span className="text-[10px] text-slate-400 ml-2">Ticket Description</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(currentTicket.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {currentTicket.description}
                </p>
              </div>

              {/* Message List */}
              {messages.map((msg) => {
                const isInternal = msg.is_internal;
                const isCustomer = msg.sender_role === 'CUSTOMER';

                if (isInternal) {
                  /* Internal Team Note */
                  return (
                    <div
                      key={msg.id}
                      className="bg-amber-950/30 border-2 border-amber-500/50 rounded-xl p-4 shadow-sm ml-6 sm:ml-12"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase tracking-wider">
                            <Lock className="w-3 h-3 text-amber-400" />
                            Internal Team Note
                          </span>
                          <span className="text-xs font-semibold text-amber-200">{msg.sender_name}</span>
                        </div>
                        <span className="text-[10px] text-amber-400/80 font-mono">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-amber-100 whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  );
                }

                /* Public Messages */
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-4 border shadow-sm ${
                      isCustomer
                        ? 'bg-slate-800/80 border-slate-700/80 mr-6 sm:mr-12'
                        : 'bg-indigo-950/30 border-indigo-500/40 ml-6 sm:ml-12'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            isCustomer ? 'text-emerald-300' : 'text-indigo-300'
                          }`}
                        >
                          {msg.sender_name} {isCustomer ? '(Customer)' : '(Support Agent)'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Message Composer (Only on conversation tab) */}
        {activeTab === 'conversation' && (
          <div className="p-4 bg-slate-850 border-t border-slate-700/80">
            {/* Composer Mode Tabs */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setComposerMode('public')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    composerMode === 'public'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Public Reply (To Customer)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setComposerMode('internal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    composerMode === 'internal'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-800 text-amber-400/80 hover:text-amber-300'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Private Internal Note</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-400">
                Acting as: <strong className="text-slate-200">{currentAgent?.name}</strong>
              </div>
            </div>

            {/* Note banner when in internal mode */}
            {composerMode === 'internal' && (
              <div className="mb-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span>
                  Internal note: visible only to support staff. Customers cannot view this note.
                </span>
              </div>
            )}

            {/* Composer Input Form */}
            <form onSubmit={handleSendMessage} className="space-y-2">
              <textarea
                rows={3}
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder={
                  composerMode === 'public'
                    ? 'Write a public reply to the customer (stops first response SLA timer)...'
                    : 'Write a private note for the support team...'
                }
                className={`w-full text-sm text-slate-100 rounded-xl p-3 border focus:outline-none focus:ring-2 resize-none placeholder-slate-400 ${
                  composerMode === 'internal'
                    ? 'bg-amber-950/30 border-amber-500/40 focus:ring-amber-500 focus:border-amber-500 focus:bg-amber-950/40'
                    : 'bg-slate-900 border-slate-700 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-slate-900'
                }`}
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Press Send to submit {composerMode === 'internal' ? 'internal note' : 'reply'}.
                </span>
                <button
                  type="submit"
                  disabled={isSending || !messageContent.trim()}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    composerMode === 'internal'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSending ? 'Sending...' : composerMode === 'internal' ? 'Save Internal Note' : 'Send Public Reply'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
