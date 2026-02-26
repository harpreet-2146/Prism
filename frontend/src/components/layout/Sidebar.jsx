// frontend/src/components/layout/Sidebar.jsx
// Self-contained: manages its own collapsed state, no props needed from MainLayout
// Keeps all existing conversation fetching + delete logic
// Adds: Documents, Table of Contents nav items; logo from /assets/logo.webp

import { useEffect, useState } from 'react';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  MessageSquare, Plus, Trash2, BookOpen, List,
  PanelLeftClose, PanelLeftOpen, FileText, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useChat } from '@hooks/useChat';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { formatChatDate, truncate, groupBy } from '@lib/utils';
import { cn } from '@lib/utils';

// ── Single nav link ───────────────────────────────────────────────────────────
function NavItem({ to, icon: Icon, label, active, collapsed }) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        collapsed && 'justify-center px-2.5',
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  const { conversationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { conversations, fetchConversations, deleteConversation, createConversation } = useChat();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchConversations();
      setLoading(false);
    };
    load();
  }, [fetchConversations]);

  const handleNewChat = async () => {
    try {
      await createConversation();
      navigate('/chat', { replace: true });
    } catch (err) {
      console.error('Failed to create new chat:', err);
    }
  };

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await deleteConversation(id);
      if (id === conversationId) navigate('/chat', { replace: true });
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const groupedConversations = groupBy(conversations, conv => formatChatDate(conv.updatedAt));

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r bg-card transition-all duration-200 ease-in-out flex-shrink-0',
        collapsed ? 'w-[52px]' : 'w-[232px]',
      )}
    >
      {/* ── Top: logo + collapse ── */}
      <div className={cn(
        'flex items-center h-[52px] px-3 border-b flex-shrink-0',
        collapsed ? 'justify-center' : 'justify-between',
      )}>
        {!collapsed ? (
          <>
            <Link to="/chat" className="flex items-center gap-2 min-w-0">
              <img
                src="/assets/logo.webp"
                alt="PRISM"
                className="h-7 w-7 rounded-lg object-contain flex-shrink-0"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-white">P</span>
              </div>
              <span className="text-sm font-semibold truncate">PRISM</span>
            </Link>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all flex-shrink-0"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setCollapsed(false)}
            className="flex flex-col items-center gap-1"
            title="Expand sidebar"
          >
            <img
              src="/assets/logo.webp"
              alt="PRISM"
              className="h-7 w-7 rounded-lg object-contain"
              onError={e => {
                e.currentTarget.outerHTML =
                  '<div class="h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center"><span class="text-[10px] font-bold text-white">P</span></div>';
              }}
            />
            <PanelLeftOpen className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── New chat ── */}
      <div className={cn('px-2 pt-3 pb-1 flex-shrink-0', collapsed && 'flex justify-center')}>
        <button
          onClick={handleNewChat}
          title={collapsed ? 'New chat' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90',
            collapsed ? 'h-9 w-9 justify-center' : 'w-full px-3 py-2',
          )}
        >
          <Plus className="h-4 w-4 flex-shrink-0" />
          {!collapsed && 'New chat'}
        </button>
      </div>

      {/* ── Nav links ── */}
      <nav className="px-2 py-1.5 space-y-0.5 flex-shrink-0">
        <NavItem
          to="/documents"
          icon={FileText}
          label="Documents"
          collapsed={collapsed}
          active={isActive('/documents')}
        />
        <NavItem
          to="/document-index"
          icon={List}
          label="Table of Contents"
          collapsed={collapsed}
          active={isActive('/document-index')}
        />
        <NavItem
          to="/chat"
          icon={MessageSquare}
          label="Chat"
          collapsed={collapsed}
          active={location.pathname === '/chat' || isActive('/chat/')}
        />
      </nav>

      {/* Divider */}
      {!collapsed && <div className="mx-3 h-px bg-border mt-1 flex-shrink-0" />}

      {/* ── Chat history ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {collapsed ? null : loading ? (
          <div className="space-y-2 p-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : conversations.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">No conversations yet</p>
        ) : (
          <div className="space-y-4 p-2 pt-3">
            {Object.entries(groupedConversations).map(([date, convs]) => (
              <div key={date}>
                <h3 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {date}
                </h3>
                <div className="space-y-0.5">
                  {convs.map(conv => (
                    <Link
                      key={conv.id}
                      to={`/chat/${conv.id}`}
                      className={cn(
                        'group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent',
                        conversationId === conv.id && 'bg-accent',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-[13px]">{truncate(conv.title, 28) || 'Untitled'}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                        onClick={e => handleDelete(conv.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}