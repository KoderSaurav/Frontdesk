import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  ShieldCheck,
  MessageSquare,
  Send,
  RotateCcw,
  PlusCircle,
  Clock,
  AlertCircle,
  CheckCircle,
  Ticket as TicketIcon,
  ChevronRight,
  ArrowLeft,
  LifeBuoy,
} from 'lucide-react';
import { Ticket } from '../types';

interface CustomerPortalProps {
  currentUser: {
    id?: number;
    name: string;
    email: string;
    role?: string;
  };
  onOpenNewTicket: () => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  currentUser,
  onOpenNewTicket,
}) => {
  // Tickets & Loading State
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [isFetchingTickets, setIsFetchingTickets] = useState(false);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);

  // Ticket Detail & Conversation View State
  const [ticketData, setTicketData] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Reply & Reopen State
  const [replyContent, setReplyContent] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenBox, setShowReopenBox] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Load only tickets submitted by this customer
  const loadMyTickets = async () => {
    setIsFetchingTickets(true);
    try {
      const tickets = await api.getMyTickets();
      setMyTickets(tickets);
    } catch (err: any) {
      console.error('Failed to load customer tickets:', err);
    } finally {
      setIsFetchingTickets(false);
    }
  };

  useEffect(() => {
    loadMyTickets();
  }, [currentUser.email]);

  // Load single ticket details for conversation thread
  const openTicketDetail = async (num: string) => {
    setSelectedTicketNumber(num);
    setIsLoadingDetail(true);
    setDetailError(null);
    setSuccessBanner(null);
    setShowReopenBox(false);
    try {
      const data = await api.customerGetTicket(num);
      setTicketData(data);
    } catch (err: any) {
      setDetailError(err.message || 'Unable to load ticket details.');
      setTicketData(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !ticketData) return;

    setIsSendingReply(true);
    try {
      await api.customerReply(
        ticketData.ticket.ticketNumber,
        replyContent.trim(),
        currentUser.name
      );
      setSuccessBanner('Reply submitted successfully. Support team has been notified.');
      setReplyContent('');
      // Reload ticket detail and refresh queue
      await openTicketDetail(ticketData.ticket.ticketNumber);
      loadMyTickets();
    } catch (err: any) {
      alert(`Error sending reply: ${err.message}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim() || !ticketData) return;

    setReopenError(null);
    try {
      await api.customerReopen(ticketData.ticket.ticketNumber, reopenReason.trim());
      setSuccessBanner('Ticket successfully reopened!');
      setShowReopenBox(false);
      setReopenReason('');
      await openTicketDetail(ticketData.ticket.ticketNumber);
      loadMyTickets();
    } catch (err: any) {
      setReopenError(err.message || 'Failed to reopen ticket.');
    }
  };

  // Metrics calculations for the logged-in user
  const totalCount = myTickets.length;
  const activeCount = myTickets.filter(
    (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS'
  ).length;
  const waitingOnCustomerCount = myTickets.filter(
    (t) => t.status === 'WAITING_FOR_CUSTOMER'
  ).length;
  const resolvedCount = myTickets.filter(
    (t) => t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
              <span>Customer Helpdesk</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                Verified Account
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Showing tickets reported by <strong className="text-emerald-300">{currentUser.email}</strong>. Private internal staff notes are hidden.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenNewTicket}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Report New Problem</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/80 shadow-md">
          <p className="text-xs text-slate-400 font-medium">My Total Tickets</p>
          <p className="text-2xl font-extrabold text-white mt-1">{totalCount}</p>
        </div>
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/80 shadow-md">
          <p className="text-xs text-indigo-400 font-medium">In Progress</p>
          <p className="text-2xl font-extrabold text-indigo-200 mt-1">{activeCount}</p>
        </div>
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/80 shadow-md">
          <p className="text-xs text-amber-400 font-medium">Action Required (You)</p>
          <p className="text-2xl font-extrabold text-amber-200 mt-1">{waitingOnCustomerCount}</p>
        </div>
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-700/80 shadow-md">
          <p className="text-xs text-emerald-400 font-medium">Resolved / Closed</p>
          <p className="text-2xl font-extrabold text-emerald-200 mt-1">{resolvedCount}</p>
        </div>
      </div>

      {/* Notification Banner */}
      {successBanner && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 p-3.5 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* VIEW 1: MY TICKETS LIST */}
      {!selectedTicketNumber ? (
        <div className="bg-slate-850 rounded-2xl border border-slate-700/80 shadow-xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TicketIcon className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-white text-sm sm:text-base">
                Reported Problems ({myTickets.length})
              </h3>
            </div>
            <span className="text-xs text-slate-400">Strictly isolated to your account</span>
          </div>

          {isFetchingTickets ? (
            <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>Loading your reported problems...</span>
            </div>
          ) : myTickets.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <TicketIcon className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-300">No reported problems yet</h4>
              <p className="text-xs max-w-sm mx-auto">
                You have not submitted any technical support tickets. Whenever you report an issue, it will appear here.
              </p>
              <button
                onClick={onOpenNewTicket}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Submit Your First Ticket</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {myTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => openTicketDetail(t.ticket_number)}
                  className="p-4 sm:p-5 hover:bg-slate-800/60 cursor-pointer transition-all flex items-center justify-between gap-4 group"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        {t.ticket_number}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          t.status === 'RESOLVED' || t.status === 'CLOSED'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : t.status === 'WAITING_FOR_CUSTOMER'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-indigo-500/15 text-indigo-300'
                        }`}
                      >
                        {t.status.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          t.priority === 'URGENT'
                            ? 'bg-rose-500/20 text-rose-300'
                            : t.priority === 'MEDIUM'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-blue-500/20 text-blue-300'
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors truncate">
                      {t.subject}
                    </h4>
                    <p className="text-xs text-slate-400 line-clamp-1">{t.description}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-slate-400">Created</p>
                      <p className="text-xs text-slate-300 font-mono">
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* VIEW 2: TICKET DETAIL & CONVERSATION THREAD */
        <div className="bg-slate-850 rounded-2xl border border-slate-700/80 shadow-xl overflow-hidden animate-fade-in">
          {/* Header Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-700/80 bg-slate-800/50 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => {
                setSelectedTicketNumber(null);
                setTicketData(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to My Tickets</span>
            </button>

            {ticketData && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  {ticketData.ticket.ticketNumber}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-700 text-slate-200">
                  {ticketData.ticket.status}
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                  {ticketData.ticket.priority}
                </span>
              </div>
            )}
          </div>

          {isLoadingDetail ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading conversation...</div>
          ) : detailError ? (
            <div className="p-6 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{detailError}</span>
            </div>
          ) : ticketData ? (
            <div>
              {/* Ticket Subject & Reopen Action */}
              <div className="p-5 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{ticketData.ticket.subject}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Reported on {new Date(ticketData.ticket.createdAt).toLocaleString()}
                  </p>
                </div>

                {ticketData.ticket.status === 'RESOLVED' && (
                  <button
                    onClick={() => setShowReopenBox(!showReopenBox)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reopen this Ticket</span>
                  </button>
                )}
              </div>

              {/* Reopen Box */}
              {showReopenBox && (
                <div className="p-4 bg-amber-950/20 border-b border-amber-500/30 animate-fade-in">
                  <h4 className="text-xs font-bold text-amber-300 mb-1">Reopen Policy (7 Days):</h4>
                  <p className="text-xs text-slate-300 mb-3">
                    If this problem is not fully solved, enter a brief reason below to reopen the ticket and notify our engineers.
                  </p>
                  {reopenError && (
                    <div className="p-2 mb-3 bg-rose-500/20 border border-rose-500/40 rounded text-xs text-rose-300">
                      {reopenError}
                    </div>
                  )}
                  <form onSubmit={handleReopen} className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="State why this issue persists..."
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      className="flex-1 bg-slate-900 text-xs text-slate-100 placeholder-slate-400 rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-slate-900"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                      Confirm Reopen
                    </button>
                  </form>
                </div>
              )}

              {/* Conversation Timeline */}
              <div className="p-6 space-y-4 max-h-[480px] overflow-y-auto">
                {/* Initial Problem Report */}
                <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-4 mr-6 sm:mr-12">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-400">
                      {currentUser.name} (Original Report)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(ticketData.ticket.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {ticketData.ticket.description}
                  </p>
                </div>

                {/* Conversation Messages */}
                {ticketData.conversation.map((msg: any) => {
                  const isCustomer = msg.senderRole === 'CUSTOMER';
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-xl p-4 border shadow-sm ${
                        isCustomer
                          ? 'bg-slate-900/90 border-slate-700 mr-6 sm:mr-12'
                          : 'bg-indigo-950/30 border-indigo-500/40 ml-6 sm:ml-12'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-xs font-semibold ${
                            isCustomer ? 'text-emerald-400' : 'text-indigo-300'
                          }`}
                        >
                          {msg.senderName} {isCustomer ? '(You)' : '(Support Team)'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Reply Box */}
              {ticketData.ticket.status !== 'CLOSED' ? (
                <div className="p-4 bg-slate-900 border-t border-slate-700">
                  <form onSubmit={handleSendReply} className="space-y-3">
                    <textarea
                      rows={3}
                      required
                      placeholder="Type your response to support engineers..."
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      className="w-full bg-slate-900 text-sm text-slate-100 placeholder-slate-400 rounded-xl p-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-slate-900 resize-none shadow-inner"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Replying as: <strong className="text-slate-200">{currentUser.name}</strong>
                      </span>
                      <button
                        type="submit"
                        disabled={isSendingReply || !replyContent.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isSendingReply ? 'Sending...' : 'Send Reply'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-4 bg-slate-900 border-t border-slate-700 text-center text-xs text-slate-400">
                  This support ticket is closed. If you need assistance with a new problem, please submit a new ticket.
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
