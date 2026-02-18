import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useChat } from '@hooks/useChat';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { formatChatDate, truncate, groupBy } from '@lib/utils';
import { cn } from '@lib/utils';

export default function Sidebar({ isOpen }) {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { conversations, fetchConversations, deleteConversation, createConversation } = useChat();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConversations = async () => {
      setLoading(true);
      await fetchConversations();
      setLoading(false);
    };

    loadConversations();
  }, [fetchConversations]);

  const handleNewChat = async () => {
    console.log('🆕 New Chat clicked'); // DEBUG
    
    try {
      // Clear the current conversation state
      await createConversation();
      
      // Navigate to /chat (no ID)
      navigate('/chat', { replace: true });
      
      console.log('✅ Navigated to new chat'); // DEBUG
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  const handleDeleteConversation = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirm('Are you sure you want to delete this conversation?')) {
      try {
        await deleteConversation(id);
        
        // If deleted the current conversation, navigate to new chat
        if (id === conversationId) {
          navigate('/chat', { replace: true });
        }
      } catch (error) {
        console.error('Failed to delete conversation:', error);
      }
    }
  };

  // Group conversations by date
  const groupedConversations = groupBy(conversations, (conv) =>
    formatChatDate(conv.updatedAt)
  );

  return (
    <aside
      className={cn(
        'flex w-64 flex-col border-r bg-card transition-all duration-300',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
    >
      {/* New chat button */}
      <div className="p-4">
        <Button onClick={handleNewChat} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {Object.entries(groupedConversations).map(([date, convs]) => (
              <div key={date}>
                <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground">
                  {date}
                </h3>
                <div className="space-y-1">
                  {convs.map((conv) => (
                    <Link
                      key={conv.id}
                      to={`/chat/${conv.id}`}
                      className={cn(
                        'group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent',
                        conversationId === conv.id && 'bg-accent'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{truncate(conv.title, 30)}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
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