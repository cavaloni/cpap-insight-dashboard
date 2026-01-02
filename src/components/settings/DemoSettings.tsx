'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Settings, 
  Database, 
  Trash2, 
  Loader2,
  CheckCircle,
  AlertCircle,
  Calendar,
  FileText,
  Moon
} from 'lucide-react';

interface DemoSettings {
  enabled: boolean;
  seedInfo: {
    startDate: string;
    endDate: string;
    nightsCount: number;
    journalEntriesCount: number;
    seededAt: string;
  } | null;
}

export function DemoSettings() {
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/demo/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 30 })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: 'success', text: data.message });
        await fetchSettings();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to seed demo data' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to seed demo data' });
    } finally {
      setSeeding(false);
    }
  };

  const handleClearDemo = async () => {
    setClearing(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/demo/clear', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: 'success', text: data.message });
        await fetchSettings();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to clear demo data' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to clear demo data' });
    } finally {
      setClearing(false);
    }
  };

  const handleToggleDemo = async () => {
    if (!settings) return;
    
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoEnabled: !settings.enabled })
      });
      
      if (response.ok) {
        await fetchSettings();
      }
    } catch (error) {
      console.error('Failed to toggle demo mode:', error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="pneuma-heading text-xl mb-2">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure demo mode and application settings
        </p>
      </div>

      {/* Demo Mode Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Demo Mode
          </CardTitle>
          <CardDescription className="text-xs">
            Generate sample CPAP data to explore the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${settings?.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">
                Demo Mode: {settings?.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            {settings?.seedInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleDemo}
                className="text-xs"
              >
                {settings.enabled ? 'Disable' : 'Enable'}
              </Button>
            )}
          </div>

          {/* Seed Info */}
          {settings?.seedInfo && (
            <div className="p-3 bg-blue-50 rounded-lg space-y-2">
              <p className="text-xs font-medium text-blue-800">Demo Data Summary</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{settings.seedInfo.startDate} to {settings.seedInfo.endDate}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Moon className="h-3 w-3" />
                  <span>{settings.seedInfo.nightsCount} nights</span>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  <span>{settings.seedInfo.journalEntriesCount} journal entries</span>
                </div>
                <div className="text-blue-600">
                  Seeded: {new Date(settings.seedInfo.seededAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!settings?.seedInfo ? (
              <Button
                onClick={handleSeedDemo}
                disabled={seeding}
                className="flex-1"
              >
                {seeding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Generate 30 Days of Demo Data
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleSeedDemo}
                  disabled={seeding || clearing}
                  variant="outline"
                  className="flex-1"
                >
                  {seeding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4 mr-2" />
                      Regenerate
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleClearDemo}
                  disabled={seeding || clearing}
                  variant="destructive"
                  className="flex-1"
                >
                  {clearing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Demo Data
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Message */}
          {message && (
            <div className={`flex items-center gap-2 text-xs p-2 rounded ${
              message.type === 'success' 
                ? 'text-green-600 bg-green-50' 
                : 'text-red-600 bg-red-50'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {message.text}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p className="font-medium mb-1">What demo mode does:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Creates 30 nights of realistic CPAP therapy data</li>
              <li>Generates journal entries with various sleep factors</li>
              <li>Adds sleep annotations and diary notes</li>
              <li>Synthetic time-series data for detailed views</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* App Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Application Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data Storage</span>
              <span>SQLite + Parquet</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time-series Engine</span>
              <span>DuckDB</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
