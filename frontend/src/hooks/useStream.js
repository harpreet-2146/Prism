import { useState, useCallback, useRef } from 'react';

/**
 * Hook for handling streaming message responses
 */
export function useStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const abortControllerRef = useRef(null);

  const startStream = useCallback(() => {
    setIsStreaming(true);
    setStreamedContent('');
    abortControllerRef.current = new AbortController();
  }, []);

  const appendContent = useCallback(content => {
    setStreamedContent(prev => prev + content);
  }, []);

  const stopStream = useCallback(() => {
    setIsStreaming(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const resetStream = useCallback(() => {
    setIsStreaming(false);
    setStreamedContent('');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    isStreaming,
    streamedContent,
    startStream,
    appendContent,
    stopStream,
    resetStream,
    abortController: abortControllerRef.current
  };
}