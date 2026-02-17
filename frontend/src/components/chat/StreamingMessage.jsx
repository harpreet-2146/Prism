import { useEffect, useState } from 'react';

export default function StreamingMessage({ content }) {
  const [displayedContent, setDisplayedContent] = useState('');

  useEffect(() => {
    setDisplayedContent(content);
  }, [content]);

  return (
    <div className="markdown-content">
      <p className="whitespace-pre-wrap break-words">{displayedContent}</p>
      <span className="inline-block h-4 w-1 animate-pulse bg-current" />
    </div>
  );
}