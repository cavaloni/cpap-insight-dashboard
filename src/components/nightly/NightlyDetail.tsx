'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ReferenceLine
} from 'recharts';
import { 
  Activity, 
  Clock, 
  Wind, 
  Gauge, 
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { SleepScoreOrb } from '@/components/pneumaflow/SleepScoreOrb';

interface NightlyDetailProps {
  sessionId: string;
  date: string;
  onBack: () => void;
}

interface MesoData {
  timestamp: number;
  pressure: number;
  leak_rate: number;
  flow_rate: number;
  mask_on: boolean;
}

interface MicroData {
  timestamp: number;
  pressure: number;
  leak_rate: number;
  flow_rate: number;
  mask_on: boolean;
}

interface SessionInfo {
  sessionId: string;
  date: string;
  total_usage_minutes: number;
  ahi: number;
  avg_pressure: number;
  avg_leak: number;
  sleep_quality_score: number;
}

type Resolution = 'meso' | 'micro';

export function NightlyDetail({ sessionId, date, onBack }: NightlyDetailProps) {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [mesoData, setMesoData] = useState<MesoData[]>([]);
  const [microData, setMicroData] = useState<MicroData[]>([]);
  const [currentData, setCurrentData] = useState<MesoData[] | MicroData[]>([]);
  const [resolution, setResolution] = useState<Resolution>('meso');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0 });
  const [viewRange, setViewRange] = useState({ start: 0, end: 0 });
  const chartRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load session info and meso data on mount
  useEffect(() => {
    loadSessionData();
    
    // Cleanup debounce timer on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sessionId]);

  const loadSessionData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get session info from dashboard API
      const dashboardResponse = await fetch(`/api/dashboard?start=${date}&end=${date}`);
      if (!dashboardResponse.ok) {
        throw new Error('Failed to fetch nightly summary');
      }
      const dashboardData = await dashboardResponse.json();
      
      if (dashboardData.trends && dashboardData.trends.length > 0) {
        const nightData = dashboardData.trends[0];
        setSessionInfo({
          sessionId,
          date,
          total_usage_minutes: nightData.total_usage_minutes,
          ahi: nightData.ahi,
          avg_pressure: nightData.median_pressure,
          avg_leak: nightData.median_leak_rate,
          sleep_quality_score: nightData.sleep_quality_score
        });
      }

      // Load meso data (1-minute buckets)
      const mesoResponse = await fetch(`/api/session/${sessionId}/meso?bucket=60`);
      if (!mesoResponse.ok) {
        const text = await mesoResponse.text();
        throw new Error(`Failed to fetch nightly data (${mesoResponse.status}): ${text}`);
      }
      const mesoResult = await mesoResponse.json();
      
      if (mesoResult.data) {
        const normalizedMeso: MesoData[] = (mesoResult.data as Array<any>).map((r) => {
          const timestamp = Number(r.timestamp ?? r.bucket_start);
          const pressure = Number(r.pressure ?? r.pressure_avg ?? 0);
          const leakRate = Number(r.leak_rate ?? r.leak_max ?? 0);
          const flowRate = Number(r.flow_rate ?? r.flow_avg ?? 0);
          const maskOn = Boolean(r.mask_on ?? ((r.mask_on_pct ?? 0) >= 50));

          return {
            timestamp,
            pressure,
            leak_rate: leakRate,
            flow_rate: flowRate,
            mask_on: maskOn
          };
        }).filter((r) => Number.isFinite(r.timestamp));

        if (normalizedMeso.length === 0) {
          throw new Error('No chart data returned for this night');
        }

        setMesoData(normalizedMeso);
        setCurrentData(normalizedMeso);
        
        // Set initial time range to full night
        if (normalizedMeso.length > 0) {
          const start = normalizedMeso[0].timestamp;
          const end = normalizedMeso[normalizedMeso.length - 1].timestamp;
          setTimeRange({ start, end });
          setViewRange({ start, end });
        }
      }
    } catch (error) {
      console.error('Failed to load session data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load nightly view');
    } finally {
      setLoading(false);
    }
  };

  const loadMicroData = useCallback(async (start: number, end: number) => {
    try {
      const response = await fetch(
        `/api/session/${sessionId}/micro?start=${start}&end=${end}&points=2000`
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch micro data (${response.status}): ${text}`);
      }
      const result = await response.json();
      
      if (result.data) {
        const normalizedMicro: MicroData[] = (result.data as Array<any>).map((r) => ({
          timestamp: Number(r.timestamp),
          pressure: Number(r.pressure ?? 0),
          leak_rate: Number(r.leak_rate ?? 0),
          flow_rate: Number(r.flow_rate ?? 0),
          mask_on: Boolean(r.mask_on)
        })).filter((r) => Number.isFinite(r.timestamp));

        if (normalizedMicro.length > 0) {
          setMicroData(normalizedMicro);
          setCurrentData(normalizedMicro);
        }
        setResolution('micro');
      }
    } catch (error) {
      console.error('Failed to load micro data:', error);
    }
  }, [sessionId]);

  const handleZoom = useCallback((direction: 'in' | 'out' | 'reset') => {
    // Clear any pending debounced calls
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the zoom operation
    debounceTimerRef.current = setTimeout(() => {
      if (resolution === 'meso' && direction !== 'reset') {
        // Switch to micro data when zooming in from meso
        const duration = viewRange.end - viewRange.start;
        const center = (viewRange.start + viewRange.end) / 2;
        
        if (direction === 'in') {
          const newDuration = duration * 0.5;
          const newStart = center - newDuration / 2;
          const newEnd = center + newDuration / 2;
          
          // Clamp to time range
          const clampedStart = Math.max(timeRange.start, newStart);
          const clampedEnd = Math.min(timeRange.end, newEnd);
          
          setViewRange({ start: clampedStart, end: clampedEnd });
          
          // Load micro data for this range
          loadMicroData(clampedStart, clampedEnd);
        }
      } else if (resolution === 'micro') {
        const duration = viewRange.end - viewRange.start;
        const center = (viewRange.start + viewRange.end) / 2;
        
        if (direction === 'in') {
          const newDuration = duration * 0.7;
          const newStart = center - newDuration / 2;
          const newEnd = center + newDuration / 2;
          
          const clampedStart = Math.max(timeRange.start, newStart);
          const clampedEnd = Math.min(timeRange.end, newEnd);
          
          setViewRange({ start: clampedStart, end: clampedEnd });
          loadMicroData(clampedStart, clampedEnd);
        } else if (direction === 'out') {
          const newDuration = duration * 1.5;
          const newStart = center - newDuration / 2;
          const newEnd = center + newDuration / 2;
          
          const clampedStart = Math.max(timeRange.start, newStart);
          const clampedEnd = Math.min(timeRange.end, newEnd);
          
          setViewRange({ start: clampedStart, end: clampedEnd });
          
          // If zoomed out far enough, switch back to meso
          if (newDuration >= (timeRange.end - timeRange.start) * 0.8) {
            setCurrentData(mesoData);
            setResolution('meso');
            setViewRange(timeRange);
          } else {
            loadMicroData(clampedStart, clampedEnd);
          }
        } else if (direction === 'reset') {
          setCurrentData(mesoData);
          setResolution('meso');
          setViewRange(timeRange);
        }
      }
    }, 200); // 200ms debounce
  }, [resolution, viewRange, timeRange, loadMicroData, mesoData]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const formatTooltipTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: resolution === 'micro' ? '2-digit' : undefined,
      hour12: false 
    });
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-64"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded"></div>
          ))}
        </div>
        <div className="h-96 bg-muted rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="pneuma-heading">Nightly View</CardTitle>
          <CardDescription>
            {new Date(date).toLocaleDateString()} • Session: {sessionId}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Overview
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!sessionInfo) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Session not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Overview
          </Button>
          <div>
            <h2 className="pneuma-heading text-xl">
              {new Date(date).toLocaleDateString()}
            </h2>
            <p className="text-sm text-muted-foreground">
              Session ID: {sessionId}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleZoom('out')}
            disabled={resolution === 'meso'}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleZoom('in')}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleZoom('reset')}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">AHI</p>
                <p className="text-2xl font-bold">{sessionInfo.ahi.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">events/hour</p>
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
                <p className="text-2xl font-bold">
                  {(() => {
                    const totalMinutes = Math.round(sessionInfo.total_usage_minutes || 0);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    return `${hours}h ${minutes}m`;
                  })()}
                </p>
                <p className="text-xs text-muted-foreground">total</p>
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
                <p className="text-2xl font-bold">{sessionInfo.avg_pressure.toFixed(1)}</p>
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
                <p className="text-2xl font-bold">{sessionInfo.avg_leak.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">L/min</p>
              </div>
              <Wind className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sleep Quality Orb */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center">
              <p className="text-sm font-medium text-muted-foreground mb-4">SLEEP QUALITY</p>
              <SleepScoreOrb score={sessionInfo.sleep_quality_score} size="md" />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Resolution: {resolution === 'meso' ? '1-minute' : '25Hz'}</p>
              <p>Data points: {currentData.length.toLocaleString()}</p>
              <p>Time range: {formatTooltipTime(viewRange.start)} - {formatTooltipTime(viewRange.end)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="pneuma-heading">Pressure & Flow Analysis</CardTitle>
          <CardDescription>
            {resolution === 'meso' 
              ? 'Click zoom to see high-resolution data' 
              : 'Showing detailed 25Hz data'
            }
          </CardDescription>
        </CardHeader>
        <CardContent ref={chartRef}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={currentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp"
                domain={[viewRange.start, viewRange.end]}
                type="number"
                scale="time"
                tickFormatter={formatTimestamp}
                tick={{ fontSize: 12 }}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip 
                labelFormatter={(value) => formatTooltipTime(Number(value))}
              />
              <ReferenceLine 
                yAxisId="left"
                y={sessionInfo.avg_pressure} 
                stroke="#8b5cf6" 
                strokeDasharray="5 5"
                label="Avg Pressure"
              />
              <Line 
                yAxisId="left"
                type="monotone"
                dataKey="pressure"
                stroke="#8b5cf6"
                strokeWidth={resolution === 'micro' ? 1 : 2}
                dot={false}
                name="Pressure (cm H2O)"
              />
              <Line 
                yAxisId="right"
                type="monotone"
                dataKey="flow_rate"
                stroke="#10b981"
                strokeWidth={resolution === 'micro' ? 1 : 2}
                dot={false}
                name="Flow Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
