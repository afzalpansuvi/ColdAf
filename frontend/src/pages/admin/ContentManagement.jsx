import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, FileText, Sparkles, Rocket } from 'lucide-react';

export default function ContentManagement() {
  const [tab, setTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [changelog, setChangelog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [t, c] = await Promise.all([
          api.get('/admin/content/templates'),
          api.get('/admin/content/changelog'),
        ]);
        setTemplates(t.data?.templates || []);
        setChangelog(c.data?.entries || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
        <p className="text-sm text-gray-500 mt-1">System templates and platform changelog</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'templates', label: 'System Templates', icon: FileText },
          { id: 'changelog', label: 'Changelog', icon: Rocket },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-2 ${
                tab === t.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : tab === 'templates' ? (
        <div className="card !p-0 overflow-hidden">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="w-10 h-10 mb-3" />
              <p className="text-sm">No system templates yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="table-header">Name</th>
                    <th className="table-header">Category</th>
                    <th className="table-header">Usage</th>
                    <th className="table-header">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} className="hover:bg-brand-50/30">
                      <td className="table-cell">
                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          {t.name}
                        </div>
                        <div className="text-xs text-gray-500">{t.subject}</div>
                      </td>
                      <td className="table-cell">
                        <span className="badge badge-purple capitalize">{t.category}</span>
                      </td>
                      <td className="table-cell">{(t.usage_count || 0).toLocaleString()} uses</td>
                      <td className="table-cell text-gray-500 text-xs">
                        {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {changelog.length === 0 ? (
            <div className="card">
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Rocket className="w-10 h-10 mb-3" />
                <p className="text-sm">No changelog entries yet</p>
              </div>
            </div>
          ) : (
            changelog.map((e) => (
              <div key={e.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="badge badge-purple font-mono">{e.version}</span>
                    <h3 className="text-base font-semibold text-gray-900">{e.title}</h3>
                  </div>
                  <span className="text-xs text-gray-500">
                    {e.published_at ? new Date(e.published_at).toLocaleDateString() : 'Draft'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{e.body}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
