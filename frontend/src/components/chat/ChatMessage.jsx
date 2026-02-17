import { Avatar, AvatarFallback } from '@components/ui/avatar';
import { Badge } from '@components/ui/badge';
import MessageActions from './MessageActions';
import StepByStepGuide from './StepByStepGuide';
import StreamingMessage from './StreamingMessage';
import { User, Bot } from 'lucide-react';
import { cn } from '@lib/utils';

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={cn(
        'flex gap-4',
        isUser && 'message-user flex-row-reverse',
        isAssistant && 'message-assistant'
      )}
    >
      {/* Avatar */}
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className={cn(isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
          {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </AvatarFallback>
      </Avatar>

      {/* Message content */}
      <div className={cn('flex-1 space-y-2', isUser && 'flex flex-col items-end')}>
        {/* Role badge */}
        <Badge variant={isUser ? 'default' : 'secondary'} className="text-xs">
          {isUser ? 'You' : 'PRISM'}
        </Badge>

        {/* Message bubble */}
        <div
          className={cn(
            'rounded-lg px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border bg-card text-card-foreground'
          )}
        >
          {message.streaming ? (
            <StreamingMessage content={message.content} />
          ) : isAssistant && message.content ? (
            <StepByStepGuide content={message.content} images={message.images} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>

        {/* Actions (only for assistant messages) */}
        {isAssistant && !message.streaming && <MessageActions message={message} />}
      </div>
    </div>
  );
}