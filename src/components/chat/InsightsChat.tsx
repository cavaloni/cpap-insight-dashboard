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
    <div className="flex gap-6 h-[600px]">
      {/* Chat Interface */}
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            CPAP Insights Chat
          </CardTitle>
          <CardDescription>
            Ask questions about your CPAP data. All insights are based on computed analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Ask me anything about your CPAP therapy data!</p>
                <p className="text-sm mt-2">
                  For example: "Why did my sleep get worse this week?"
                </p>
              </div>
            )}
            
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'user' ? (
                    <p className="text-sm">{message.content}</p>
                  ) : (
                    <div
                      className="text-sm prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                    />
                  )}
                  {index === messages.length - 1 && message.role === 'assistant' && lastResponse?.traceId && (
                    <FeedbackButtons traceId={lastResponse.traceId} />
                  )}
                </div>
                
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground">Analyzing your data...</p>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your CPAP data..."
                className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Evidence Panel */}
      <Card className="w-80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Evidence Panel
          </CardTitle>
          <CardDescription>
            Data sources used for the last response
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastResponse?.evidence_artifacts && lastResponse.evidence_artifacts.length > 0 ? (
            <>
              <div className="space-y-3">
                {lastResponse.evidence_artifacts.map((artifactId) => (
                  <div key={artifactId} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-xs font-mono">Artifact: {artifactId.substring(0, 8)}...</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tool: {lastResponse.citations.find(c => c.artifact_id === artifactId)?.tool_name || 'Unknown'}
                    </p>
                  </div>
                ))}
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">Model Used:</p>
                <p className="text-xs text-muted-foreground">{lastResponse.model_used}</p>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  This analysis is for informational purposes only and not medical advice.
                </p>
              </div>
            </>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No evidence yet</p>
              <p className="text-xs">Ask a question to see data sources</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
