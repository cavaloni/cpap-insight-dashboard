'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Upload, 
  FileText, 
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';

export function JournalUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus('idle');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/journal/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      setUploadStatus('success');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Journal Upload
        </CardTitle>
        <CardDescription className="text-xs">
          Upload your journal entries to enhance chat insights
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-blue-600" />
            <div>
              <p className="font-medium text-blue-800 mb-1">Important Note</p>
              <p className="text-blue-700">
                While your journal data can be messy and disorganized, <strong>dates are required</strong> to properly associate entries with your sleep data. Please ensure each entry includes a clear date (e.g., "January 15, 2024" or "2024-01-15").
              </p>
            </div>
          </div>
        </div>

        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv"
            onChange={handleFileUpload}
            className="hidden"
            id="journal-upload"
            disabled={isUploading}
          />
          <label htmlFor="journal-upload" className="cursor-pointer">
            <div className="flex flex-col items-center gap-2">
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {isUploading ? 'Processing...' : 'Choose journal file'}
              </span>
              <span className="text-xs text-muted-foreground">
                Supports .txt, .md, .csv files
              </span>
            </div>
          </label>
        </div>

        {uploadStatus === 'success' && (
          <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded">
            <CheckCircle className="h-3 w-3" />
            Journal uploaded successfully! Entries are being processed.
          </div>
        )}

        {uploadStatus === 'error' && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded">
            <AlertCircle className="h-3 w-3" />
            {errorMessage}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <div className="flex items-center gap-1 mb-1">
            <Calendar className="h-3 w-3" />
            <span className="font-medium">Date formats recognized:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 ml-4">
            <li>MM/DD/YYYY or M/D/YYYY</li>
            <li>YYYY-MM-DD or YYYY/MM/DD</li>
            <li>Month Day, Year (e.g., "January 15, 2024")</li>
            <li>Relative dates (e.g., "Yesterday", "Last Tuesday")</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
