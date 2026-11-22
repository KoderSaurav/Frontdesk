import React from 'react';
import { User } from '../types';
import { ShieldCheck, UserCheck, Clock, PlusCircle, RefreshCw, LogOut } from 'lucide-react';

interface NavbarProps {
  agents: User[];
  currentAgent: User | null;
  onSelectAgent: (agent: User) => void;
  onOpenNewTicket: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  isLoading: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  agents,
  currentAgent,
  onSelectAgent,
  onOpenNewTicket,
  onRefresh,
  onLogout,
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
                    Staff Workspace
                  </span>
                </div>
                <p className="text-xs text-slate-400">Arvo Systems Engineering Support</p>
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
            {/* 1-Click Agent Switcher (Preserved across all 9 agents as it was) */}
            <div className="flex items-center gap-2 pl-2 bg-slate-850/80 border border-slate-700/80 px-2.5 py-1 rounded-xl">
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
                  className="bg-slate-800 hover:bg-slate-750 text-white text-xs font-semibold py-1.5 pl-2.5 pr-8 rounded-lg border border-slate-650 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.title || 'Support Agent'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Refresh Queue Button */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh Ticket Queue"
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
              <span className="hidden sm:inline">New Ticket</span>
            </button>

            {/* Sign Out / Exit Workspace Button */}
            <button
              onClick={onLogout}
              title="Sign out of Agent Workspace"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 rounded-lg text-xs font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
