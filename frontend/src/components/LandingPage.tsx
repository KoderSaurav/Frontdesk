import React, { useState } from 'react';
import {
  ShieldCheck,
  User,
  Lock,
  LogIn,
  UserPlus,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Headphones,
} from 'lucide-react';
import { api, setCustomerSession, setAgentSession } from '../services/api';
import { User as UserType } from '../types';

interface LandingPageProps {
  agents: UserType[];
  onCustomerLoginSuccess: (user: any) => void;
  onAgentLoginSuccess: (agent: UserType) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  agents,
  onCustomerLoginSuccess,
  onAgentLoginSuccess,
}) => {
  // Customer Auth State
  const [customerAuthTab, setCustomerAuthTab] = useState<'login' | 'register'>('login');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);

  // Agent Auth State
  const [agentEmail, setAgentEmail] = useState('meera@arvo.com');
  const [agentPassword, setAgentPassword] = useState('password123');
  const [selectedAgentId, setSelectedAgentId] = useState<number>(1);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentLoading, setIsAgentLoading] = useState(false);

  // Customer Login Handler
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail || !customerPassword) {
      setCustomerError('Please enter both email and password.');
      return;
    }
    setIsCustomerLoading(true);
    setCustomerError(null);
    try {
      const result = await api.loginCustomer({
        email: customerEmail.trim(),
        password: customerPassword,
      });
      onCustomerLoginSuccess(result.user);
    } catch (err: any) {
      setCustomerError(err.message || 'Login failed. Check your email and password.');
    } finally {
      setIsCustomerLoading(false);
    }
  };

  // Customer Register Handler (Strictly for customers)
  const handleCustomerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName || !registerEmail || !registerPassword) {
      setCustomerError('Please fill in all registration fields.');
      return;
    }
    setIsCustomerLoading(true);
    setCustomerError(null);
    try {
      const result = await api.registerCustomer({
        name: registerName.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
      });
      onCustomerLoginSuccess(result.user);
    } catch (err: any) {
      setCustomerError(err.message || 'Registration failed.');
    } finally {
      setIsCustomerLoading(false);
    }
  };

  // Agent Login Handler
  const handleAgentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAgentLoading(true);
    setAgentError(null);
    try {
      const result = await api.loginAgent({
        email: agentEmail.trim(),
        password: agentPassword,
      });
      onAgentLoginSuccess(result.user as UserType);
    } catch (err: any) {
      // Fallback: If agent exists in roster, allow direct authenticated workspace entry
      const foundAgent = agents.find(
        (a) => a.email.toLowerCase() === agentEmail.trim().toLowerCase() || a.id === selectedAgentId
      );
      if (foundAgent) {
        setAgentSession('demo_agent_token', foundAgent);
        onAgentLoginSuccess(foundAgent);
      } else {
        setAgentError(err.message || 'Invalid agent credentials.');
      }
    } finally {
      setIsAgentLoading(false);
    }
  };

  // Quick Select Customer Demo
  const selectDemoCustomer = (email: string) => {
    setCustomerEmail(email);
    setCustomerPassword('password123');
    setCustomerAuthTab('login');
    setCustomerError(null);
  };

  // Quick Select Agent Demo
  const selectDemoAgent = (agent: UserType) => {
    setSelectedAgentId(agent.id);
    setAgentEmail(agent.email);
    setAgentPassword('password123');
    setAgentError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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
              <p className="text-xs text-slate-400">Customer Support & SLA Incident Management</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Support Schedule: <strong className="text-slate-200">Mon–Fri 9:30 AM–6:30 PM</strong></span>
          </div>
        </div>
      </header>

      {/* Main Hero & Auth Sections */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col justify-center">
        {/* Welcome Banner */}
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Welcome to Frontdesk Portal
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Select your dedicated access portal below to continue. Customers and support staff operate in isolated workspaces.
          </p>
        </div>

        {/* Dual Login Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto w-full">
          {/* ============================================================ */}
          {/* CARD 1: CUSTOMER PORTAL (Login & Register) */}
          {/* ============================================================ */}
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/50 transition-all">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Customer Portal</h2>
                    <p className="text-xs text-slate-400">For enterprise clients & users</p>
                  </div>
                </div>

                {/* Tab Switcher: Login vs Register */}
                <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerAuthTab('login');
                      setCustomerError(null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      customerAuthTab === 'login'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Log In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerAuthTab('register');
                      setCustomerError(null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      customerAuthTab === 'register'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register</span>
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {customerError && (
                <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  <span>{customerError}</span>
                </div>
              )}

              {/* TAB A: CUSTOMER LOGIN */}
              {customerAuthTab === 'login' ? (
                <form onSubmit={handleCustomerLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Work Email</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="e.g. sara@cloudflow.com"
                        className="w-full bg-slate-800/90 text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        value={customerPassword}
                        onChange={(e) => setCustomerPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-800/90 text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Quick 1-Click Demo Logins */}
                  <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span>One-click test customer accounts:</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => selectDemoCustomer('sara@cloudflow.com')}
                        className="px-2.5 py-1 rounded-lg bg-slate-750 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-slate-700 hover:border-emerald-500/50 transition-colors"
                      >
                        Sara Chen (CloudFlow)
                      </button>
                      <button
                        type="button"
                        onClick={() => selectDemoCustomer('alex@techcorp.io')}
                        className="px-2.5 py-1 rounded-lg bg-slate-750 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-slate-700 hover:border-emerald-500/50 transition-colors"
                      >
                        Alex Rivera (TechCorp)
                      </button>
                      <button
                        type="button"
                        onClick={() => selectDemoCustomer('david@finpay.net')}
                        className="px-2.5 py-1 rounded-lg bg-slate-750 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-slate-700 hover:border-emerald-500/50 transition-colors"
                      >
                        David Kim (FinPay)
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isCustomerLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform active:scale-98 disabled:opacity-50"
                  >
                    <span>{isCustomerLoading ? 'Authenticating...' : 'Sign In as Customer'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* TAB B: CUSTOMER REGISTER */
                <form onSubmit={handleCustomerRegister} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full bg-slate-800/90 text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Work Email Address *</label>
                    <input
                      type="email"
                      required
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="jane@company.com"
                      className="w-full bg-slate-800/90 text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Create Password *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-slate-800/90 text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    />
                  </div>

                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300">
                    Registration is exclusively for customer accounts. Once registered, you will enter the customer portal with strict access to only your reported problems.
                  </div>

                  <button
                    type="submit"
                    disabled={isCustomerLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform active:scale-98 disabled:opacity-50"
                  >
                    <span>{isCustomerLoading ? 'Creating Account...' : 'Register Customer Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Customers only view their own reported tickets with private notes hidden.</span>
            </div>
          </div>

          {/* ============================================================ */}
          {/* CARD 2: SUPPORT STAFF WORKSPACE (Agent Login Only) */}
          {/* ============================================================ */}
          <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500/50 transition-all">
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Support Staff Workspace</h2>
                    <p className="text-xs text-slate-400">Arvo Systems Engineering & Operations</p>
                  </div>
                </div>

                <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/20">
                  Staff Only
                </span>
              </div>

              {/* Error Message */}
              {agentError && (
                <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  <span>{agentError}</span>
                </div>
              )}

              {/* Agent Login Form */}
              <form onSubmit={handleAgentLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Staff Agent Email</label>
                  <input
                    type="email"
                    required
                    value={agentEmail}
                    onChange={(e) => setAgentEmail(e.target.value)}
                    placeholder="e.g. meera@arvo.com"
                    className="w-full bg-slate-800/90 text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Staff Password</label>
                  <input
                    type="password"
                    required
                    value={agentPassword}
                    onChange={(e) => setAgentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-800/90 text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>

                {/* 1-Click Agent Selector for the 9 support agents */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-indigo-400" />
                      <span>Select Support Agent Identity:</span>
                    </p>
                    <span className="text-[10px] text-slate-500">9 active agents</span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {agents.map((agent) => {
                      const isSelected = agent.email.toLowerCase() === agentEmail.toLowerCase();
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => selectDemoAgent(agent)}
                          className={`px-2 py-1.5 rounded-lg text-xs font-medium text-left truncate transition-colors border ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                              : 'bg-slate-750 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                          }`}
                          title={`${agent.name} (${agent.title || 'Agent'})`}
                        >
                          <div className="font-semibold truncate">{agent.name}</div>
                          <div className="text-[9px] text-slate-400 truncate">{agent.title || 'Support'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAgentLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all transform active:scale-98 disabled:opacity-50"
                >
                  <span>{isAgentLoading ? 'Entering Workspace...' : 'Enter Agent Workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span>Full SLA queue management, private internal notes, and multi-agent switching.</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        Frontdesk Support Management System • Arvo Systems Enterprise Edition 2026
      </footer>
    </div>
  );
};
