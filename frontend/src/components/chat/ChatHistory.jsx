import { Link, useParams } from 'react-router-dom';
import { MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { formatChatDate, truncate, groupBy } from '@lib/utils';
import { cn } from '@lib/utils';

export default function ChatHistory({ conversations, onDelete }) {
  const { conversationId } = useParams();

  // Group by date
  const grouped = groupBy(conversations, conv => formatChatDate(conv.updatedAt));

  const handleDelete = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([date, convs]) => (
        <div key={date}>
          <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground">{date}</h3>
          <div className="space-y-1">
            {convs.map(conv => (
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
  );
}