'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage, ChatResponse } from '@/lib/llm/openrouter';
import { StreamEvent, parseSSEEvent } from '@/lib/streaming';

export interface StreamingState {
  isStreaming: boolean;
  currentStatus: string | null;
  currentToolName: string | null;
  streamedText: string;
  error: string | null;
}

export interface UseStreamingChatOptions {
  dateRange: { start: string; end: string };
  onComplete?: (response: ChatResponse & { traceId?: string }) => void;
  onError?: (error: string) => void;
}

export function useStreamingChat({ dateRange, onComplete, onError }: UseStreamingChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    currentStatus: null,
    currentToolName: null,
    streamedText: '',
    error: null
  });
  const [lastResponse, setLastResponse] = useState<ChatResponse & { traceId?: string } | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streamingState.isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setStreamingState({
      isStreaming: true,
      currentStatus: null,
      currentToolName: null,
      streamedText: '',
      error: null
    });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          dateRange
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let finalResponse: (ChatResponse & { traceId?: string }) | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const eventData = line.slice(6);
          const event = parseSSEEvent(eventData);
          
          if (!event) continue;

          switch (event.type) {
            case 'thinking':
              setStreamingState(prev => ({
                ...prev,
                currentStatus: event.data.message || null,
                currentToolName: null
              }));
              break;

            case 'status':
              setStreamingState(prev => ({
                ...prev,
                currentStatus: event.data.message || null
              }));
              break;

            case 'tool_start':
              setStreamingState(prev => ({
                ...prev,
                currentStatus: event.data.message || null,
                currentToolName: event.data.toolDisplayName || event.data.toolName || null
              }));
              break;

            case 'tool_end':
              setStreamingState(prev => ({
                ...prev,
                currentToolName: null
              }));
              break;

            case 'text':
              if (event.data.chunk) {
                fullText += event.data.chunk;
                setStreamingState(prev => ({
                  ...prev,
                  currentStatus: null,
                  currentToolName: null,
                  streamedText: fullText
                }));
              }
              break;

            case 'complete':
              finalResponse = {
                message: event.data.fullMessage || fullText,
                tool_calls_executed: [],
                evidence_artifacts: [],
                model_used: '',
                citations: []
              };
              break;

            case 'error':
              setStreamingState(prev => ({
                ...prev,
                isStreaming: false,
                error: event.data.error || 'Unknown error'
              }));
              onError?.(event.data.error || 'Unknown error');
              return;
          }
        }
      }

      // Finalize
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: finalResponse?.message || fullText
      };

      setMessages(prev => [...prev, assistantMessage]);
      setLastResponse(finalResponse);
      setStreamingState({
        isStreaming: false,
        currentStatus: null,
        currentToolName: null,
        streamedText: '',
        error: null
      });

      if (finalResponse) {
        onComplete?.(finalResponse);
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: null
        }));
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage
      }));

      // Add error message to chat
      const errorAssistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      };
      setMessages(prev => [...prev, errorAssistantMessage]);
      
      onError?.(errorMessage);
    }
  }, [messages, dateRange, streamingState.isStreaming, onComplete, onError]);

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
    setStreamingState(prev => ({
      ...prev,
      isStreaming: false
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastResponse(null);
    setStreamingState({
      isStreaming: false,
      currentStatus: null,
      currentToolName: null,
      streamedText: '',
      error: null
    });
  }, []);

  return {
    messages,
    streamingState,
    lastResponse,
    sendMessage,
    cancelStream,
    clearMessages
  };
}
