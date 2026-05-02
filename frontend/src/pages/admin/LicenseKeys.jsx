import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Plus, Key, Ban, Copy, X } from 'lucide-react';

const STATUS_COLORS = {
  unused: 'badge-blue',
  active: 'badge-green',
  revoked: 'badge-red',
  expired: 'badge-gray',
};

export default function LicenseKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ plan: 'pro', seats: 1, count: 1, expiresAt: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/license-keys');
      setKeys(res.data?.keys || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/admin/license-keys/generate', {
        plan: form.plan,
        seats: parseInt(form.seats, 10),
        count: parseInt(form.count, 10),
        expiresAt: form.expiresAt || null,
        notes: form.notes || null,
      });
      setShowModal(false);
      setForm({ plan: 'pro', seats: 1, count: 1, expiresAt: '', notes: '' });
      load();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate license keys.');
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id) => {
    if (!window.confirm('Revoke this license key? This action cannot be undone and will deactivate the key immediately.')) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.post(`/admin/license-keys/${id}/revoke`);
      load();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to revoke license key.');
    } finally {
      setActionLoading(false);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">License Keys</h1>
          <p className="text-sm text-gray-500 mt-1">{keys.length} key{keys.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Generate Keys
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Key className="w-10 h-10 mb-3" />
            <p className="text-sm">No license keys yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-header">Key</th>
                  <th className="table-header">Plan</th>
                  <th className="table-header">Seats</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Assigned</th>
                  <th className="table-header">Expires</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-brand-50/30">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{k.key}</code>
                        <button
                          onClick={() => copy(k.key)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Copy"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="table-cell capitalize">{k.plan}</td>
                    <td className="table-cell">{k.seats}</td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_COLORS[k.status] || 'badge-gray'} capitalize`}>
                        {k.status}
                      </span>
                    </td>
                    <td className="table-cell">{k.org_name || '—'}</td>
                    <td className="table-cell text-gray-500">
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="table-cell text-right">
                      {k.status !== 'revoked' && (
                        <button
                          onClick={() => revoke(k.id)}
                          disabled={actionLoading}
                          className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Revoke"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Generate License Keys</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={generate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Plan</label>
                  <select
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                    className="select-field"
                  >
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="agency">Agency</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Seats</label>
                  <input
                    type="number"
                    min="1"
                    value={form.seats}
                    onChange={(e) => setForm({ ...form, seats: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  How many keys to generate? (max 100)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={form.count}
                  onChange={(e) => setForm({ ...form, count: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Expires at (optional)</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-field"
                  placeholder="e.g. Q2 promo batch"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
