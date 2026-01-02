'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Send, 
  Bot, 
  User, 
  FileText, 
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { ChatMessage, ChatResponse, Citation } from '@/lib/llm/openrouter';
import { FeedbackButtons } from '@/components/FeedbackButtons';

interface InsightsChatProps {
  dateRange: { start: string; end: string };
}

export function InsightsChat({ dateRange }: InsightsChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<ChatResponse & { traceId?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          dateRange
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const chatResponse: ChatResponse & { traceId?: string } = await response.json();
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: chatResponse.message
      };

      setMessages(prev => [...prev, assistantMessage]);
      setLastResponse(chatResponse);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMessage = (content: string) => {
    // Highlight artifact citations
    return content.replace(
      /\[Artifact:\s*([a-f0-9-]+)\]/g,
      '<span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-mono">$&</span>'
    );
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
          {messages.length === 0 && (
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
          
          {isLoading && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Loader2 className="h-3 w-3 text-primary-foreground animate-spin" />
              </div>
              <div className="bg-muted rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Analyzing...</p>
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
              disabled={isLoading}
            />
            <Button type="submit" size="sm" disabled={isLoading || !input.trim()} className="rounded-full">
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
