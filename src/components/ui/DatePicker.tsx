'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';

interface DatePickerProps {
  dateRange: { start: string; end: string };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  dataBounds: { minDate: string; maxDate: string };
}

export function DatePicker({ dateRange, onDateRangeChange, dataBounds }: DatePickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const presetRanges = [
    {
      label: 'Last 7 Days',
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);
        return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        };
      }
    },
    {
      label: 'Last 30 Days',
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        };
      }
    },
    {
      label: 'Last 90 Days',
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 90);
        return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        };
      }
    },
    {
      label: 'All Data',
      getValue: () => ({
        start: dataBounds.minDate,
        end: dataBounds.maxDate
      })
    }
  ];

  const handlePresetClick = (preset: typeof presetRanges[0]) => {
    const newRange = preset.getValue();
    // Ensure the range is within data bounds
    const clampedRange = {
      start: newRange.start < dataBounds.minDate ? dataBounds.minDate : newRange.start,
      end: newRange.end > dataBounds.maxDate ? dataBounds.maxDate : newRange.end
    };
    onDateRangeChange(clampedRange);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    if (newStart <= dateRange.end && newStart >= dataBounds.minDate && newStart <= dataBounds.maxDate) {
      onDateRangeChange({ ...dateRange, start: newStart });
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    if (newEnd >= dateRange.start && newEnd >= dataBounds.minDate && newEnd <= dataBounds.maxDate) {
      onDateRangeChange({ ...dateRange, end: newEnd });
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">Date Range</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-2">
              {presetRanges.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetClick(preset)}
                  className="text-xs"
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-16">From:</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={handleStartDateChange}
                  min={dataBounds.minDate}
                  max={dateRange.end}
                  className="flex-1 px-2 py-1 text-xs border rounded"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-16">To:</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={handleEndDateChange}
                  min={dateRange.start}
                  max={dataBounds.maxDate}
                  className="flex-1 px-2 py-1 text-xs border rounded"
                />
              </div>
            </div>
          </div>
        )}

        {!isExpanded && (
          <div className="mt-2 text-xs text-muted-foreground">
            {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
