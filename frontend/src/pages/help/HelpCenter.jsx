import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categories, articlesByCategory } from './manifest';
import { searchArticles } from './helpData';
import {
  Search, BookOpen, ArrowRight, HelpCircle, X, Hash, Clock
} from 'lucide-react';

// Category icons & colors
const catStyles = {
  'Getting Started': { color: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-200', icon: BookOpen },
  'Brands & Infrastructure': { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: BookOpen },
  'Campaigns & Leads': { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: BookOpen },
  'Leads, Sequences & Templates': { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: BookOpen },
  'AI, Analytics & Deliverability': { color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', icon: BookOpen },
  'Integrations, Warmup & Tracking': { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', icon: BookOpen },
};

export default function HelpCenter() {
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const navigate = useNavigate();

  // Update document title
  useEffect(() => {
    document.title = 'Help Center — ColdAF';
  }, []);

  const searchResults = useMemo(() => searchArticles(query), [query]);
  const showSearch = query.trim().length >= 2;

  const totalArticles = useMemo(() => {
    let total = 0;
    for (const cat of categories) {
      total += (articlesByCategory[cat] || []).length;
    }
    return total;
  }, []);

  return (
    <div className="animate-fade-in">
      {/* Hero / Search */}
      <div className="card card-accent-purple mb-6">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">ColdAF Help Center</h1>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          {totalArticles} articles covering everything from setup to advanced features. Search below or browse by category.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search help articles…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm bg-white/70 border border-white/50 focus:bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/50 transition-all placeholder:text-gray-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {showSearch && searchFocused && (
          <div className="mt-2 card !p-0 !shadow-glass-xl max-h-80 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No articles found for "{query}"
              </div>
            ) : (
              <div className="divide-y divide-gray-100/50">
                {searchResults.map(art => (
                  <Link
                    key={art.id}
                    to={`/help/${art.slug}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors"
                  >
                    <BookOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{art.title}</p>
                      <p className="text-xs text-gray-400">{art.category}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map(cat => {
          const articles = articlesByCategory[cat] || [];
          const style = catStyles[cat] || catStyles['Getting Started'];
          const Icon = style.icon;
          return (
            <div key={cat} className="card hover:shadow-card-hover transition-all duration-200">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.bg}`}>
                  <Icon className={`w-4 h-4 ${style.color}`} />
                </div>
                <h2 className="text-sm font-semibold text-gray-800">{cat}</h2>
                <span className="ml-auto text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                  {articles.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {articles.slice(0, 6).map(art => (
                  <Link
                    key={art.id}
                    to={`/help/${art.slug}`}
                    className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50/60 transition-colors"
                  >
                    <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                    <span className="text-sm text-gray-600 group-hover:text-brand-600 transition-colors truncate">
                      {art.title}
                    </span>
                  </Link>
                ))}
                {articles.length > 6 && (
                  <p className="text-xs text-gray-400 pl-5 pt-1">
                    + {articles.length - 6} more articles
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* All articles list (bottom) */}
      <div className="card mt-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-brand-500" />
          All Articles
        </h2>
        <div className="grid gap-2 md:grid-cols-2">
          {categories.flatMap(cat => {
            const articles = articlesByCategory[cat] || [];
            return articles.map(art => (
              <Link
                key={art.id}
                to={`/help/${art.slug}`}
                className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-gray-50/60 transition-colors"
              >
                <Hash className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 group-hover:text-brand-600 transition-colors truncate">
                    {art.title}
                  </p>
                  <p className="text-xs text-gray-400">{cat}</p>
                </div>
              </Link>
            ))
          })}
        </div>
      </div>
    </div>
  );
}
