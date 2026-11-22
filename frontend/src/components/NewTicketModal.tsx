import React, { useState, useEffect } from 'react';
import { api, getStoredCustomerUser } from '../services/api';
import { TicketPriority } from '../types';
import { X, PlusCircle, AlertCircle, Lock } from 'lucide-react';

interface NewTicketModalProps {
  onClose: () => void;
  onTicketCreated: () => void;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({
  onClose,
  onTicketCreated,
}) => {
  const loggedInCustomer = getStoredCustomerUser();

  const [customerName, setCustomerName] = useState(loggedInCustomer?.name || '');
  const [customerEmail, setCustomerEmail] = useState(loggedInCustomer?.email || '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loggedInCustomer) {
      setCustomerName(loggedInCustomer.name || '');
      setCustomerEmail(loggedInCustomer.email || '');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerEmail || !subject || !description) {
      setError('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await api.customerCreateTicket({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        subject: subject.trim(),
        description: description.trim(),
        priority,
      });
      onTicketCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-850 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">Create New Support Ticket</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/20 border-b border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full bg-slate-900 text-xs text-slate-100 placeholder-slate-400 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Customer Email *
              </label>
              <input
                type="email"
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="john@company.com"
                className="w-full bg-slate-900 text-xs text-slate-100 placeholder-slate-400 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Priority Level *
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full bg-slate-900 text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-900"
            >
              <option value="URGENT">Urgent (Customer cannot work — 2h Response SLA, Same Day Resolution)</option>
              <option value="MEDIUM">Medium (Normal business impact — 4.5h Response SLA, 3 Days Resolution)</option>
              <option value="LOW">Low (Questions/small requests — 9h Response SLA, 1 Week Resolution)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Subject *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. API Gateway returning 504 on payments"
              className="w-full bg-slate-900 text-xs text-slate-100 placeholder-slate-400 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-900"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Problem Description *
            </label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide full details of what went wrong..."
              className="w-full bg-slate-900 text-xs text-slate-100 placeholder-slate-400 rounded-xl p-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-900 resize-none shadow-inner"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
