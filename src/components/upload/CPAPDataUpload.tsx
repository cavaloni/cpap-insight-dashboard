'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';

interface IngestResult {
  nightsImported: number;
  samplesImported: number;
  eventsImported: number;
  errors: string[];
  dateRange: { start: string; end: string } | null;
}

export function CPAPDataUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(f => f.type === 'text/csv' || f.name.endsWith('.csv'));
    
    if (csvFile) {
      setFile(csvFile);
      setError(null);
      setUploadResult(null);
    } else {
      setError('Please drop a CSV file');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setUploadResult(null);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result: IngestResult = await response.json();
      setUploadResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    setUploadResult(null);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload CPAP Data
        </CardTitle>
        <CardDescription>
          Upload your CPAP data in CSV format. This should include timestamped measurements 
          for leak rate, pressure, flow limitation, and events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFile}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-lg font-medium">Drop your CSV file here</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <Button asChild variant="outline">
                <label htmlFor="file-upload" className="cursor-pointer">
                  Select File
                </label>
              </Button>
            </div>
          )}
        </div>

        {/* Upload Button */}
        {file && (
          <Button 
            onClick={handleUpload} 
            disabled={isUploading}
            className="w-full"
          >
            {isUploading ? 'Uploading...' : 'Upload Data'}
          </Button>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Success Display */}
        {uploadResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">Upload successful!</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold">{uploadResult.nightsImported}</p>
                <p className="text-sm text-muted-foreground">Nights</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{uploadResult.samplesImported.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Samples</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{uploadResult.eventsImported}</p>
                <p className="text-sm text-muted-foreground">Events</p>
              </div>
            </div>

            {uploadResult.dateRange && (
              <p className="text-sm text-muted-foreground">
                Data range: {uploadResult.dateRange.start} to {uploadResult.dateRange.end}
              </p>
            )}

            {uploadResult.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-yellow-600">Warnings:</p>
                {uploadResult.errors.map((err, i) => (
                  <p key={i} className="text-sm text-muted-foreground">• {err}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Format Information */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Expected CSV format:</p>
          <p>timestamp, leak_rate, pressure, flow_limitation, mask_on, event_type, event_duration</p>
          <p>All fields are optional except timestamp.</p>
        </div>
      </CardContent>
    </Card>
  );
}
