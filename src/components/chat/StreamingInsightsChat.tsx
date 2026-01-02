'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Send, 
  Bot, 
  User, 
  Loader2,
  Search,
  TrendingUp,
  BarChart3,
  BookOpen,
  Sparkles,
  X
} from 'lucide-react';
import { ChatMessage } from '@/lib/llm/openrouter';
import { FeedbackButtons } from '@/components/FeedbackButtons';
import { useStreamingChat } from '@/hooks/useStreamingChat';

interface StreamingInsightsChatProps {
  dateRange: { start: string; end: string };
}

// Tool icon mapping for visual feedback
const TOOL_ICONS: Record<string, React.ReactNode> = {
  'Nightly Summary': <BarChart3 className="h-3 w-3" />,
  'Trend Analysis': <TrendingUp className="h-3 w-3" />,
  'Anomaly Detection': <Sparkles className="h-3 w-3" />,
  'Correlation Analysis': <TrendingUp className="h-3 w-3" />,
  'Period Comparison': <BarChart3 className="h-3 w-3" />,
  'Session Details': <BarChart3 className="h-3 w-3" />,
  'Best Sleep Analysis': <Sparkles className="h-3 w-3" />,
  'Custom Analysis': <Search className="h-3 w-3" />,
  'Journal Search': <BookOpen className="h-3 w-3" />,
  'Journal Overview': <BookOpen className="h-3 w-3" />
};

export function StreamingInsightsChat({ dateRange }: StreamingInsightsChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    streamingState,
    lastResponse,
    sendMessage,
    cancelStream
  } = useStreamingChat({ dateRange });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingState.streamedText, streamingState.currentStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streamingState.isStreaming) return;
    
    const message = input;
    setInput('');
    await sendMessage(message);
  };

  const formatMessage = (content: string) => {
    return content.replace(
      /\[Artifact:\s*([a-f0-9-]+)\]/g,
      '<span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-mono">$&</span>'
    );
  };

  const getToolIcon = (toolName: string | null) => {
    if (!toolName) return <Loader2 className="h-3 w-3 animate-spin" />;
    return TOOL_ICONS[toolName] || <Loader2 className="h-3 w-3 animate-spin" />;
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 pneuma-heading text-base">
          <Bot className="h-4 w-4" />
          Chat
        </CardTitle>
        <CardDescription className="text-xs">
          Ask about your CPAP data
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !streamingState.isStreaming && (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Ask about your therapy data</p>
              <p className="text-xs mt-2 pneuma-metadata">
                e.g., "Why did my sleep worsen?"
              </p>
            </div>
          )}
          
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-2 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
              
              <div
                className={`max-w-[85%] rounded-lg p-2 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {message.role === 'user' ? (
                  <p className="text-xs">{message.content}</p>
                ) : (
                  <div
                    className="text-xs prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                  />
                )}
                {index === messages.length - 1 && message.role === 'assistant' && lastResponse?.traceId && (
                  <FeedbackButtons traceId={lastResponse.traceId} />
                )}
              </div>
              
              {message.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <User className="h-3 w-3 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
          
          {/* Streaming state display */}
          {streamingState.isStreaming && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Bot className="h-3 w-3 text-primary-foreground" />
              </div>
              <div className="max-w-[85%] space-y-2">
                {/* Status/thinking message */}
                {streamingState.currentStatus && !streamingState.streamedText && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-3 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100">
                        {getToolIcon(streamingState.currentToolName)}
                      </div>
                      <span className="text-xs text-blue-800 font-medium">
                        {streamingState.currentStatus}
                      </span>
                    </div>
                    {streamingState.currentToolName && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse" />
                        <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse delay-75" />
                        <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse delay-150" />
                      </div>
                    )}
                  </div>
                )}
                
                {/* Streamed text */}
                {streamingState.streamedText && (
                  <div className="bg-muted rounded-lg p-2">
                    <div
                      className="text-xs prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: formatMessage(streamingState.streamedText) }}
                    />
                    <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5" />
                  </div>
                )}
                
                {/* Cancel button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelStream}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          {/* Error display */}
          {streamingState.error && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-destructive flex items-center justify-center flex-shrink-0">
                <Bot className="h-3 w-3 text-destructive-foreground" />
              </div>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2">
                <p className="text-xs text-destructive">
                  Error: {streamingState.error}
                </p>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 px-3 py-2 border rounded-full text-xs bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={streamingState.isStreaming}
            />
            <Button 
              type="submit" 
              size="sm" 
              disabled={streamingState.isStreaming || !input.trim()} 
              className="rounded-full"
            >
              {streamingState.isStreaming ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
