// frontend/src/components/chat/ExportButton.jsx
// Add this to the Chat.jsx header area - downloads current conversation as PDF
// Usage: <ExportButton conversationId={conversationId} title={conversation?.title} />

import { useState } from 'react';
import { Download, Loader2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExportButton({ conversationId, title }) {
  const [state, setState] = useState('idle'); // idle | loading | done | error

  const handleExport = async () => {
    if (!conversationId || state === 'loading') return;
    setState('loading');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/export/conversation/${conversationId}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const blob = await res.blob();
      const contentType = res.headers.get('content-type') || '';
      const isHTML = contentType.includes('html');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PRISM-${(title || 'export').slice(0, 40).replace(/[^a-z0-9]/gi, '-')}.${isHTML ? 'html' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      console.error('Export error:', err);
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={!conversationId || state === 'loading'}
      title="Download conversation as PDF"
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
        state === 'idle' && 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
        state === 'loading' && 'text-slate-400 bg-slate-50 cursor-wait',
        state === 'done' && 'text-emerald-600 bg-emerald-50',
        state === 'error' && 'text-rose-500 bg-rose-50',
        !conversationId && 'opacity-40 cursor-not-allowed',
      )}
    >
      {state === 'loading'
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : state === 'done'
        ? <FileText className="h-3.5 w-3.5" />
        : <Download className="h-3.5 w-3.5" />
      }
      {state === 'idle' && 'Export PDF'}
      {state === 'loading' && 'Generating…'}
      {state === 'done' && 'Downloaded'}
      {state === 'error' && 'Failed — retry'}
    </button>
  );
}