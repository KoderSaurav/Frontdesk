import React from 'react';
import { ShieldCheck, PlusCircle, LogOut, User } from 'lucide-react';

interface CustomerNavbarProps {
  currentUser: {
    id?: number;
    name: string;
    email: string;
    role?: string;
  };
  onOpenNewTicket: () => void;
  onLogout: () => void;
}

export const CustomerNavbar: React.FC<CustomerNavbarProps> = ({
  currentUser,
  onOpenNewTicket,
  onLogout,
}) => {
  return (
    <header className="bg-slate-900 border-b border-emerald-900/40 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Portal Identification */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">Frontdesk</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Customer Portal
                </span>
              </div>
              <p className="text-xs text-slate-400">Arvo Systems Support Service</p>
            </div>
          </div>

          {/* Customer Profile & Actions */}
          <div className="flex items-center gap-3">
            {/* Authenticated Customer Info */}
            <div className="flex items-center gap-2.5 bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'C'}
              </div>
              <div className="hidden sm:block text-left">
                <div className="font-semibold text-white leading-tight">{currentUser.name}</div>
                <div className="text-[10px] text-slate-400 leading-tight">{currentUser.email}</div>
              </div>
            </div>

            {/* New Ticket Button */}
            <button
              onClick={onOpenNewTicket}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-semibold rounded-lg shadow-md shadow-emerald-500/20 transition-all transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Submit Ticket</span>
            </button>

            {/* Log Out Button */}
            <button
              onClick={onLogout}
              title="Log out of Customer Portal"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 rounded-lg text-xs font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
