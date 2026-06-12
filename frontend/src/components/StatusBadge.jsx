const LABELS = {
  pending: { text: 'Pending', cls: 'stamp-pending' },
  approved: { text: 'Approved', cls: 'stamp-approved' },
  declined: { text: 'Declined', cls: 'stamp-declined' },
  needs_revision: { text: 'Needs revision', cls: 'stamp-revision' },
}

export default function StatusBadge({ status }) {
  const cfg = LABELS[status] ?? { text: status, cls: '' }
  return <span className={`stamp ${cfg.cls}`}>{cfg.text}</span>
}
