import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import {
  ClipboardList,
  ExternalLink,
  CheckSquare,
  Loader2,
  AlertTriangle,
  CheckCircle,
  User,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TASK_ICONS = {
  linkedin_visit: ExternalLink,
  linkedin_connect: User,
  linkedin_dm: ExternalLink,
  manual_task: ClipboardList,
};

const TASK_LABELS = {
  linkedin_visit: 'Visit Profile',
  linkedin_connect: 'Connection Request',
  linkedin_dm: 'Direct Message',
  manual_task: 'Manual Task',
};

function groupByDate(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const groups = { Today: [], 'This Week': [], Later: [] };
  for (const task of tasks) {
    const d = new Date(task.createdAt);
    d.setHours(0, 0, 0, 0);
    if (d <= today) {
      groups.Today.push(task);
    } else if (d <= weekEnd) {
      groups['This Week'].push(task);
    } else {
      groups.Later.push(task);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

function TaskCard({ task, onComplete }) {
  const [completing, setCompleting] = useState(false);
  const meta = task.metadata || {};
  const stepType = meta.stepType || 'manual_task';
  const Icon = TASK_ICONS[stepType] || ClipboardList;
  const typeLabel = TASK_LABELS[stepType] || 'Task';
  const linkedinUrl = meta.linkedinUrl || null;

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await onComplete(task.id);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="card flex items-start gap-4">
      {/* Icon */}
      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-blue-600" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">{typeLabel}</span>
          {meta.campaignName && (
            <span className="text-[11px] text-gray-400">— {meta.campaignName}</span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-800 truncate">{task.message}</p>
        {meta.taskInstruction && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{meta.taskInstruction}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open LinkedIn
            </a>
          )}
          <button
            onClick={handleComplete}
            disabled={completing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            {completing
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <CheckSquare className="w-3 h-3" />}
            Mark Complete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks page
// ---------------------------------------------------------------------------

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/notifications?type=task_due&unread=true&limit=200');
      const list = res.data?.notifications || res.notifications || [];
      setTasks(list);
    } catch (err) {
      setError(err.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setSuccessMsg('Task marked as complete.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to mark task as complete.');
    }
  };

  const pendingCount = tasks.length;
  const groups = groupByDate(tasks);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pendingCount > 0
              ? `${pendingCount} pending task${pendingCount === 1 ? '' : 's'}`
              : 'All caught up'}
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl text-sm text-green-700"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}
        >
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Empty state */}
      {pendingCount === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
            <CheckSquare className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-base font-semibold text-gray-700">No tasks due</p>
          <p className="text-sm text-gray-400">LinkedIn and manual tasks from your sequences will appear here.</p>
        </div>
      )}

      {/* Groups */}
      {Object.entries(groups).map(([label, items]) => {
        if (items.length === 0) return null;
        return (
          <div key={label} className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1">{label}</h2>
            {items.map((task) => (
              <TaskCard key={task.id} task={task} onComplete={handleComplete} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
