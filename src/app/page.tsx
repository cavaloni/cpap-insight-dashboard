'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CPAPDataUpload } from '@/components/upload/CPAPDataUpload';
import { OverviewDashboard } from '@/components/dashboard/OverviewDashboard';
import { InsightsChat } from '@/components/chat/InsightsChat';
import { Calendar } from 'lucide-react';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [activeTab, setActiveTab] = useState('overview');

  const handleDateRangeChange = (range: { start: string; end: string }) => {
    setDateRange(range);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">CPAP Insight Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Analytics-powered insights for your CPAP therapy
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload">Upload Data</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Night Details</TabsTrigger>
            <TabsTrigger value="insights">Insights Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <CPAPDataUpload />
          </TabsContent>

          <TabsContent value="overview" className="space-y-4">
            <OverviewDashboard 
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
            />
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <p>Night detail view coming soon</p>
              <p className="text-sm">View detailed time-series data for specific nights</p>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <InsightsChat dateRange={dateRange} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
