const statusColorMap = {
  // Gray
  new: 'badge-gray',
  draft: 'badge-gray',
  unknown: 'badge-gray',

  // Green
  active: 'badge-green',
  healthy: 'badge-green',
  sent: 'badge-green',
  completed: 'badge-green',
  delivered: 'badge-green',

  // Yellow
  paused: 'badge-yellow',
  degraded: 'badge-yellow',
  queued: 'badge-yellow',
  pending: 'badge-yellow',
  warming: 'badge-yellow',

  // Red
  failed: 'badge-red',
  bounced: 'badge-red',
  cancelled: 'badge-red',
  error: 'badge-red',
  unsubscribed: 'badge-red',

  // Blue
  replied: 'badge-blue',
  scheduled: 'badge-blue',

  // Purple
  opened: 'badge-purple',
  clicked: 'badge-purple',
};

export default function StatusBadge({ status }) {
  if (!status) return null;

  const normalized = status.toLowerCase().trim();
  const colorClass = statusColorMap[normalized] || 'badge-gray';

  return (
    <span className={`badge ${colorClass}`}>
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </span>
  );
}
