'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FeedbackButtonsProps {
  traceId?: string;
  onResponse?: (feedback: boolean) => void;
}

export function FeedbackButtons({ traceId, onResponse }: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFeedback = async (isPositive: boolean) => {
    if (!traceId || feedback !== null) return;

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          traceId,
          feedback: isPositive,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      setFeedback(isPositive);
      onResponse?.(isPositive);
      console.log(isPositive ? 'Glad this was helpful!' : 'Thanks for the feedback');
    } catch (error) {
      console.error('Feedback error:', error);
      console.log('Failed to submit feedback');
    } finally {
      setIsLoading(false);
    }
  };

  if (!traceId) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-sm text-muted-foreground">Was this helpful?</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback(true)}
        disabled={feedback !== null || isLoading}
        className={feedback === true ? 'text-green-600' : ''}
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback(false)}
        disabled={feedback !== null || isLoading}
        className={feedback === false ? 'text-red-600' : ''}
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
