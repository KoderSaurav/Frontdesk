import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  ShieldCheck,
  Search,
  MessageSquare,
  Send,
  RotateCcw,
  PlusCircle,
  Clock,
  AlertCircle,
  CheckCircle,
  Lock,
} from 'lucide-react';

interface CustomerPortalProps {
  onBackToAgent: () => void;
  onOpenNewTicket: () => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  onBackToAgent,
  onOpenNewTicket,
}) => {
  const [ticketNumber, setTicketNumber] = useState('INC-0304');
  const [ticketData, setTicketData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions
  const [replyContent, setReplyContent] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenBox, setShowReopenBox] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const fetchCustomerTicket = async (numToFetch: string) => {
    setIsLoading(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const data = await api.customerGetTicket(numToFetch.trim());
      setTicketData(data);
    } catch (err: any) {
      setError(err.message || 'Ticket not found.');
      setTicketData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerTicket(ticketNumber);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticketNumber.trim()) {
      fetchCustomerTicket(ticketNumber);
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
        ticketData.ticket.customerName
      );
      setSuccessBanner('Reply submitted. SLA timer has resumed on the support queue.');
      setReplyContent('');
      await fetchCustomerTicket(ticketData.ticket.ticketNumber);
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
      await fetchCustomerTicket(ticketData.ticket.ticketNumber);
    } catch (err: any) {
      setReopenError(err.message || 'Failed to reopen ticket.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Banner Explaining Customer Perspective & Privacy Verification */}
      <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/40 rounded-2xl p-5 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5 border border-emerald-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Customer Support Portal</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                Self-Service
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Track the status of your reported issues, communicate directly with the support team, or submit follow-up details.
            </p>

            {/* Quick Ticket Selector Links */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-500/20 text-xs">
              <span className="text-slate-400">Quick view:</span>
              <button
                onClick={() => {
                  setTicketNumber('INC-0304');
                  fetchCustomerTicket('INC-0304');
                }}
                className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 font-mono font-semibold"
              >
                INC-0304
              </button>
              <button
                onClick={() => {
                  setTicketNumber('INC-0318');
                  fetchCustomerTicket('INC-0318');
                }}
                className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 font-mono font-semibold"
              >
                INC-0318
              </button>
              <button
                onClick={() => {
                  setTicketNumber('INC-0291');
                  fetchCustomerTicket('INC-0291');
                }}
                className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 font-mono font-semibold"
              >
                INC-0291
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket Lookup Bar */}
      <div className="bg-slate-850 p-4 rounded-2xl border border-slate-700/80 shadow-md">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Enter your ticket number (e.g., INC-0304)..."
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              className="w-full bg-slate-900 text-sm text-white placeholder-slate-400 rounded-xl pl-10 pr-4 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
          >
            Find Ticket
          </button>
          <button
            type="button"
            onClick={onOpenNewTicket}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>Create New Ticket</span>
          </button>
        </form>
      </div>

      {/* Feedback Messages */}
      {successBanner && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 p-3 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}
      {error && (
        <div className="bg-rose-500/20 border border-rose-500/40 p-4 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Ticket Details Display */}
      {ticketData && (
        <div className="bg-slate-850 rounded-2xl border border-slate-700/80 shadow-xl overflow-hidden">
          {/* Card Header */}
          <div className="p-5 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 bg-slate-800/40">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  {ticketData.ticket.ticketNumber}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-700 text-slate-200">
                  {ticketData.ticket.status}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">{ticketData.ticket.subject}</h2>
            </div>

            {/* Reopen Button if Ticket is Resolved */}
            {ticketData.ticket.status === 'RESOLVED' && (
              <button
                onClick={() => setShowReopenBox(!showReopenBox)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-md transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen this Ticket</span>
              </button>
            )}
          </div>

          {/* Reopen Explanation Box */}
          {showReopenBox && (
            <div className="p-4 bg-amber-950/20 border-b border-amber-500/30">
              <h4 className="text-xs font-bold text-amber-300 mb-1">Reopen Window (7 Calendar Days):</h4>
              <p className="text-xs text-slate-300 mb-3">
                If your issue was not properly solved, you can reopen it within 1 week of resolution.
              </p>
              {reopenError && (
                <div className="p-2 mb-3 bg-rose-500/20 border border-rose-500/40 rounded text-xs text-rose-300">
                  {reopenError}
                </div>
              )}
              <form onSubmit={handleReopen} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Explain what is still not resolved..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="flex-1 bg-slate-900 text-xs text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg"
                >
                  Confirm Reopen
                </button>
              </form>
            </div>
          )}

          {/* Ticket Description */}
          <div className="p-5 border-b border-slate-700/60 bg-slate-800/20">
            <h4 className="text-xs font-semibold text-slate-400 mb-1">Your Problem Description:</h4>
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
              {ticketData.ticket.description}
            </p>
          </div>

          {/* Conversation Feed (Public Messages Only) */}
          <div className="p-5 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Public Conversation Thread</span>
              <span className="text-[11px] text-emerald-400 font-normal">
                {ticketData.conversation.length} public {ticketData.conversation.length === 1 ? 'message' : 'messages'}
              </span>
            </h4>

            {ticketData.conversation.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No responses yet. An agent is reviewing your request.</p>
            ) : (
              ticketData.conversation.map((msg: any) => {
                const isCustomer = msg.senderRole === 'CUSTOMER';
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-4 border text-sm leading-relaxed ${
                      isCustomer
                        ? 'bg-slate-800/90 border-slate-700/80 mr-8'
                        : 'bg-emerald-950/20 border-emerald-500/30 ml-8'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className={`font-semibold ${isCustomer ? 'text-slate-200' : 'text-emerald-300'}`}>
                        {msg.senderName} {isCustomer ? '(You)' : '(Support Agent)'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-200 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                );
              })
            )}

            {/* Customer Reply Composer */}
            <form onSubmit={handleSendReply} className="pt-4 border-t border-slate-700/60 space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Reply to the support team:
              </label>
              <textarea
                rows={2}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Type your response here..."
                className="w-full bg-slate-900 text-sm text-white rounded-xl p-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Replying resumes the SLA timer if your ticket is currently waiting on you.
                </span>
                <button
                  type="submit"
                  disabled={isSendingReply || !replyContent.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {isSendingReply ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
