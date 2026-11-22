import React from 'react';
import { Ticket, User } from '../types';
import { AlertCircle, Clock, CheckCircle2, UserCheck, Inbox } from 'lucide-react';

interface DashboardMetricsProps {
  tickets: Ticket[];
  currentAgent: User | null;
  activeFilter: string;
  onSelectFilter: (filter: string) => void;
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({
  tickets,
  currentAgent,
  activeFilter,
  onSelectFilter,
}) => {
  const totalOpen = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
  const overdueCount = tickets.filter(
    (t) => t.sla_status?.is_response_overdue || t.sla_status?.is_resolution_overdue
  ).length;
  const waitingCount = tickets.filter((t) => t.status === 'WAITING_FOR_CUSTOMER').length;
  const myAssignedCount = currentAgent
    ? tickets.filter((t) => t.assigned_to === currentAgent.id && t.status !== 'CLOSED').length
    : 0;
  const resolvedCount = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;

  const cards = [
    {
      id: 'ALL',
      label: 'All Active Tickets',
      count: totalOpen + waitingCount,
      icon: Inbox,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/30',
      activeBorder: 'border-indigo-500',
    },
    {
      id: 'OVERDUE',
      label: 'Overdue (SLA Breached)',
      count: overdueCount,
      icon: AlertCircle,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/30',
      activeBorder: 'border-rose-500',
      alert: overdueCount > 0,
    },
    {
      id: 'WAITING',
      label: 'Waiting for Customer',
      count: waitingCount,
      icon: Clock,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      activeBorder: 'border-amber-500',
      sublabel: 'SLA timer paused',
    },
    {
      id: 'MINE',
      label: `Assigned to ${currentAgent?.name || 'Me'}`,
      count: myAssignedCount,
      icon: UserCheck,
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/30',
      activeBorder: 'border-sky-500',
    },
    {
      id: 'RESOLVED',
      label: 'Resolved / Closed',
      count: resolvedCount,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      activeBorder: 'border-emerald-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeFilter === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectFilter(card.id)}
            className={`text-left p-4 rounded-xl border transition-all relative overflow-hidden group ${
              isSelected
                ? `${card.bgColor} ${card.activeBorder} shadow-lg shadow-indigo-950/40 ring-1 ring-white/10`
                : 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400 group-hover:text-slate-300">
                {card.label}
              </span>
              <div className={`p-1.5 rounded-lg ${card.bgColor} ${card.color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold tracking-tight ${card.count > 0 && card.alert ? 'text-rose-400 animate-pulse' : 'text-white'}`}>
                {card.count}
              </span>
              {card.sublabel && (
                <span className="text-[10px] text-amber-400/80 font-medium">{card.sublabel}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
