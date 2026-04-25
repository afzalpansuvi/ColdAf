import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Activity,
  BarChart3,
  CreditCard,
  TrendingUp,
  Tag,
  Key,
  Users2,
  Users,
  Crown,
  ShieldCheck,
  FileText,
  Cpu,
  Shield,
  MessageCircleQuestion,
  HeartHandshake,
  ArrowLeft,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
      { to: '/admin/health', icon: Activity, label: 'Health Check' },
      { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { to: '/admin/billing', icon: CreditCard, label: 'Billing' },
      { to: '/admin/revenue', icon: TrendingUp, label: 'Revenue Analytics' },
      { to: '/admin/discount-codes', icon: Tag, label: 'Discount Codes' },
      { to: '/admin/license-keys', icon: Key, label: 'License Keys' },
      { to: '/admin/affiliates', icon: HeartHandshake, label: 'Affiliates' },
    ],
  },
  {
    label: 'Users & Content',
    items: [
      { to: '/admin/users', icon: Users, label: 'Users' },
      { to: '/admin/pro-users', icon: Crown, label: 'Pro Users' },
      { to: '/admin/admins', icon: ShieldCheck, label: 'Admin Management' },
      { to: '/admin/content', icon: FileText, label: 'Content Management' },
      { to: '/admin/ai-usage', icon: Cpu, label: 'AI Usage & Costs' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/security', icon: Shield, label: 'Security & Audit' },
      { to: '/admin/requests', icon: MessageCircleQuestion, label: 'Requests & Issues' },
    ],
  },
];

function AdminSidebarLink({ to, icon: Icon, label, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`
      }
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await logout(); } catch (_) {}
    navigate('/login');
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-purple-50 via-indigo-50 to-violet-100">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white/80 backdrop-blur-xl border-r border-white/40 shadow-xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-5 border-b border-white/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 leading-tight">Admin Panel</div>
                <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider">
                  Platform Owner
                </div>
              </div>
            </div>
            <button
              onClick={closeMobile}
              className="lg:hidden text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <AdminSidebarLink
                      key={item.to}
                      {...item}
                      onClick={closeMobile}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-3 py-3 border-t border-white/50 space-y-1">
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-[18px] h-[18px]" />
              Back to App
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-[18px] h-[18px]" />
              Sign out
            </button>
            <div className="px-3 pt-2 text-[11px] text-gray-400 truncate">
              {user?.email}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-white/70 backdrop-blur-xl border-b border-white/40">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-gray-900">Admin Panel</span>
          <div className="w-5" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
