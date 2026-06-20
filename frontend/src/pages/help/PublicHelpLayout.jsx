import { Link, Outlet } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';

// Lightweight public chrome for the Help Center when the visitor is NOT logged in.
// No sidebar, no authenticated API calls — just a header with CTAs and a footer,
// so the guides are crawlable and usable by anyone.
export default function PublicHelpLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200/70">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link to="/help" className="flex items-center gap-2 min-w-0">
            <img src="/ataflex-logo.svg" alt="ColdAF" className="w-7 h-7 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-900 truncate">ColdAF Help Center</span>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to="/login"
              className="text-sm font-medium text-gray-600 hover:text-brand-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3.5 py-1.5 rounded-lg transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/70 bg-white/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
            <span>ColdAF Email Tool — Help &amp; Guides</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/help" className="hover:text-brand-600 transition-colors">All guides</Link>
            <Link to="/login" className="hover:text-brand-600 transition-colors">Log in</Link>
            <Link to="/signup" className="hover:text-brand-600 transition-colors">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
