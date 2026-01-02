'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { 
  Activity, 
  Clock, 
  Wind, 
  Gauge, 
  TrendingUp,
  AlertTriangle,
  Calendar,
  ChevronRight
} from 'lucide-react';
import { SleepScoreOrb } from '@/components/pneumaflow/SleepScoreOrb';

interface KPIData {
  avgAhi: string;
  avgUsageHours: string;
  avgPressure: string;
  avgLeak: string;
  avgQualityScore: number;
  totalNights: number;
}

interface TrendData {
  date: string;
  session_id: string;
  ahi: number;
  total_usage_minutes: number;
  median_pressure: number;
  median_leak_rate: number;
  sleep_quality_score: number;
}

interface AnomalyData {
  date: string;
  session_id: string;
  ahi: number;
  large_leak_percent: number;
  sleep_quality_score: number;
}

interface DashboardData {
  kpis: KPIData;
  trends: TrendData[];
  anomalies: AnomalyData[];
  weekly: Array<{
    week: string;
    avg_ahi: number;
    avg_usage: number;
    avg_quality: number;
  }>;
}

interface OverviewDashboardProps {
  dateRange: { start: string; end: string };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  onNightSelect?: (sessionId: string, date: string) => void;
}

export function OverviewDashboard({ dateRange, onDateRangeChange, onNightSelect }: OverviewDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/dashboard?start=${dateRange.start}&end=${dateRange.end}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      
      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getAhiStatus = (ahi: number) => {
    if (ahi < 5) return { text: 'Normal', color: 'text-green-600' };
    if (ahi < 15) return { text: 'Mild', color: 'text-yellow-600' };
    if (ahi < 30) return { text: 'Moderate', color: 'text-orange-600' };
    return { text: 'Severe', color: 'text-red-600' };
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleNightClick = (date: string, sessionId?: string) => {
    if (!onNightSelect) return;

    if (sessionId) {
      onNightSelect(sessionId, date);
      return;
    }

    const trend = data?.trends.find(t => t.date === date);
    if (trend?.session_id) {
      onNightSelect(trend.session_id, date);
      return;
    }

    console.warn('Nightly view unavailable: missing session_id for date', date);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Error: {error || 'No data available'}</p>
        </CardContent>
      </Card>
    );
  }

  const ahiStatus = getAhiStatus(parseFloat(data.kpis.avgAhi));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">AHI</p>
                <p className="text-2xl font-bold">{data.kpis.avgAhi}</p>
                <p className={`text-xs ${ahiStatus.color}`}>{ahiStatus.text}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Usage</p>
                <p className="text-2xl font-bold">{data.kpis.avgUsageHours}h</p>
                <p className="text-xs text-muted-foreground">per night</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pressure</p>
                <p className="text-2xl font-bold">{data.kpis.avgPressure}</p>
                <p className="text-xs text-muted-foreground">cm H2O</p>
              </div>
              <Gauge className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Leak</p>
                <p className="text-2xl font-bold">{data.kpis.avgLeak}</p>
                <p className="text-xs text-muted-foreground">L/min</p>
              </div>
              <Wind className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center gap-3">
              <p className="text-sm font-medium text-muted-foreground pneuma-metadata">SLEEP QUALITY</p>
              <SleepScoreOrb score={data.kpis.avgQualityScore} size="sm" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Nights</p>
                <p className="text-2xl font-bold">{data.kpis.totalNights}</p>
                <p className="text-xs text-muted-foreground">total</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AHI Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="pneuma-heading">AHI Trend</CardTitle>
            <CardDescription>
              Apnea-Hypopnea Index over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value: any) => [value, 'AHI']}
                />
                <Line 
                  type="monotone" 
                  dataKey="ahi" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Usage & Quality Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="pneuma-heading">Usage & Sleep Quality</CardTitle>
            <CardDescription>
              Nightly usage hours and quality score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="total_usage_minutes" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Usage (min)"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="sleep_quality_score" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Quality Score"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pressure & Leak Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="pneuma-heading">Pressure & Leak Rate</CardTitle>
            <CardDescription>
              Median pressure and leak rate over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="median_pressure" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Pressure (cm H2O)"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="median_leak_rate" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Leak (L/min)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Anomalies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 pneuma-heading">
              <AlertTriangle className="h-5 w-5" />
              Top Anomaly Nights
            </CardTitle>
            <CardDescription>
              Click any night to view detailed analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.anomalies.map((anomaly, index) => (
                <div 
                  key={anomaly.date} 
                  className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => {
                    console.log('Anomaly night clicked', { date: anomaly.date, sessionId: anomaly.session_id });
                    if (onNightSelect && anomaly.session_id) {
                      onNightSelect(anomaly.session_id, anomaly.date);
                      return;
                    }
                    handleNightClick(anomaly.date, anomaly.session_id);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                    <div>
                      <p className="font-medium">{new Date(anomaly.date).toLocaleDateString()}</p>
                      <p className="text-sm text-muted-foreground">
                        Leak: {anomaly.large_leak_percent?.toFixed(1) || '0.0'}% | 
                        Quality: {anomaly.sleep_quality_score || 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{anomaly.ahi?.toFixed(1) || '0.0'}</p>
                      <p className="text-xs text-muted-foreground">AHI</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Anomaly night View button clicked', { date: anomaly.date, sessionId: anomaly.session_id });
                        if (onNightSelect && anomaly.session_id) {
                          onNightSelect(anomaly.session_id, anomaly.date);
                          return;
                        }
                        handleNightClick(anomaly.date, anomaly.session_id);
                      }}
                    >
                      View
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
