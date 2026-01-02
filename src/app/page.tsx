'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CPAPDataUpload } from '@/components/upload/CPAPDataUpload';
import { OverviewDashboard } from '@/components/dashboard/OverviewDashboard';
import { StreamingInsightsChat } from '@/components/chat/StreamingInsightsChat';
import { JournalUpload } from '@/components/journal/JournalUpload';
import { Calendar, Upload, BarChart3, MessageSquare, Activity, FileText, Settings } from 'lucide-react';
import { StatusPill } from '@/components/pneumaflow/StatusPill';
import { DemoSettings } from '@/components/settings/DemoSettings';
import { DatePicker } from '@/components/ui/DatePicker';
import { NightlyDetail } from '@/components/nightly/NightlyDetail';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  const [dataBounds, setDataBounds] = useState({
    minDate: '',
    maxDate: ''
  });
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'upload' | 'journal' | 'settings' | 'nightly'>('overview');
  const [selectedNight, setSelectedNight] = useState<{ sessionId: string; date: string } | null>(null);

  const handleDateRangeChange = (range: { start: string; end: string }) => {
    setDateRange(range);
  };

  const handleNightSelect = (sessionId: string, date: string) => {
    console.log('Opening nightly view', { sessionId, date });
    setSelectedNight({ sessionId, date });
    setActiveView('nightly');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackToOverview = () => {
    console.log('Returning to overview');
    setActiveView('overview');
    setSelectedNight(null);
  };

  useEffect(() => {
    const fetchDataBounds = async () => {
      try {
        const response = await fetch('/api/data-bounds');
        if (response.ok) {
          const bounds = await response.json();
          setDataBounds(bounds);
          setDateRange({
            start: bounds.minDate,
            end: bounds.maxDate
          });
        } else {
          // Fallback to current year if no data
          const currentYear = new Date().getFullYear();
          const fallbackRange = {
            start: `${currentYear}-01-01`,
            end: `${currentYear}-12-31`
          };
          setDataBounds({ minDate: fallbackRange.start, maxDate: fallbackRange.end });
          setDateRange(fallbackRange);
        }
      } catch (error) {
        console.error('Failed to fetch data bounds:', error);
        // Fallback to current year on error
        const currentYear = new Date().getFullYear();
        const fallbackRange = {
          start: `${currentYear}-01-01`,
          end: `${currentYear}-12-31`
        };
        setDataBounds({ minDate: fallbackRange.start, maxDate: fallbackRange.end });
        setDateRange(fallbackRange);
      } finally {
        setLoading(false);
      }
    };

    fetchDataBounds();
  }, []);

  return (
    <div className="min-h-screen">
      {/* 3-Column Grid Layout */}
      <div className="mx-auto max-w-[1800px] p-12">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-8">
          
          {/* LEFT COLUMN: Navigation & Status */}
          <aside className="space-y-6">
            {/* Header */}
            <div>
              <h1 className="pneuma-heading text-2xl mb-2">
                INSIGHT FLOW
              </h1>
              <p className="text-sm text-muted-foreground">
                CPAP + Behavioral Analytics Dashboard
              </p>
            </div>

            {/* AI Status */}
            <StatusPill />

            {/* Navigation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base pneuma-heading">Navigation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => setActiveView('overview')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all cursor-pointer ${
                    activeView === 'overview'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-sm font-medium">Overview</span>
                </button>

                {selectedNight && (
                  <button
                    onClick={() => setActiveView('nightly')}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-full transition-all cursor-pointer ${
                      activeView === 'nightly'
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">Nightly</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(selectedNight.date).toLocaleDateString()}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => setActiveView('upload')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all cursor-pointer ${
                    activeView === 'upload'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-sm font-medium">Upload Data</span>
                </button>
                <button
                  onClick={() => setActiveView('journal')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all cursor-pointer ${
                    activeView === 'journal'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span className="text-sm font-medium">Journal</span>
                </button>
                <button
                  onClick={() => setActiveView('settings')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all cursor-pointer ${
                    activeView === 'settings'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-sm font-medium">Settings</span>
                </button>
              </CardContent>
            </Card>

            {/* Date Range */}
            <DatePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              dataBounds={dataBounds}
            />

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base pneuma-heading">System</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pneuma-metadata">
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className="text-air-glow">Active</span>
                </div>
                <div className="flex justify-between">
                  <span>Version</span>
                  <span>1.0.0</span>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* CENTER COLUMN: Main Content */}
          <main className="space-y-6">
            {activeView === 'overview' && (
              <OverviewDashboard 
                dateRange={dateRange}
                onDateRangeChange={handleDateRangeChange}
                onNightSelect={handleNightSelect}
              />
            )}
            
            {activeView === 'nightly' && selectedNight && (
              <NightlyDetail
                sessionId={selectedNight.sessionId}
                date={selectedNight.date}
                onBack={handleBackToOverview}
              />
            )}

            {activeView === 'nightly' && !selectedNight && (
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">No night selected.</p>
                </CardContent>
              </Card>
            )}
            
            {activeView === 'upload' && (
              <div className="space-y-6">
                <div>
                  <h2 className="pneuma-heading text-xl mb-2">Upload Data</h2>
                  <p className="text-sm text-muted-foreground">
                    Import your CPAP therapy data for analysis
                  </p>
                </div>
                <CPAPDataUpload />
              </div>
            )}
            
            {activeView === 'journal' && (
              <div className="space-y-6">
                <div>
                  <h2 className="pneuma-heading text-xl mb-2">Journal Upload</h2>
                  <p className="text-sm text-muted-foreground">
                    Upload your personal journal to enhance AI insights
                  </p>
                </div>
                <JournalUpload />
              </div>
            )}
            
            {activeView === 'settings' && (
              <DemoSettings />
            )}
          </main>

          {/* RIGHT COLUMN: Insights Chat */}
          <aside className="space-y-6">
            <div>
              <h2 className="pneuma-heading text-lg mb-2 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Insights
              </h2>
              <p className="text-xs text-muted-foreground">
                AI-powered analysis
              </p>
            </div>
            
            <div className="h-[calc(100vh-200px)]">
              <StreamingInsightsChat dateRange={dateRange} />
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
