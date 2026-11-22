import React from 'react';
import { User } from '../types';
import { ShieldCheck, UserCheck, Clock, Users, ExternalLink, PlusCircle, RefreshCw } from 'lucide-react';

interface NavbarProps {
  agents: User[];
  currentAgent: User | null;
  onSelectAgent: (agent: User) => void;
  activeView: 'agent' | 'customer';
  onChangeView: (view: 'agent' | 'customer') => void;
  onOpenNewTicket: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  agents,
  currentAgent,
  onSelectAgent,
  activeView,
  onChangeView,
  onOpenNewTicket,
  onRefresh,
  isLoading,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold tracking-tight text-white">Frontdesk</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                    Arvo Systems
                  </span>
                </div>
                <p className="text-xs text-slate-400">Customer Support Management</p>
              </div>
            </div>

            {/* Operating Schedule Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>SLA Schedule: <strong className="text-slate-200">Mon–Fri 9:30 AM–6:30 PM</strong></span>
            </div>
          </div>

          {/* Navigation & Controls */}
          <div className="flex items-center gap-3">
            {/* View Switcher: Agent Dashboard vs Customer Sandbox */}
            <div className="flex p-1 bg-slate-800/90 rounded-lg border border-slate-700">
              <button
                onClick={() => onChangeView('agent')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeView === 'agent'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Agent Workspace</span>
              </button>
              <button
                onClick={() => onChangeView('customer')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeView === 'customer'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Customer Portal</span>
              </button>
            </div>

            {/* Active Agent Switcher */}
            {activeView === 'agent' && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 hidden md:flex">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Agent:</span>
                </div>
                <div className="relative">
                  <select
                    value={currentAgent?.id || 1}
                    onChange={(e) => {
                      const selected = agents.find((a) => a.id === Number(e.target.value));
                      if (selected) onSelectAgent(selected);
                    }}
                    className="bg-slate-800 hover:bg-slate-750 text-white text-xs font-medium py-1.5 pl-3 pr-8 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer transition-colors"
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.title || 'Agent'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh Queue"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            {/* New Ticket Button */}
            <button
              onClick={onOpenNewTicket}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-500/20 transition-all transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Ticket</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
