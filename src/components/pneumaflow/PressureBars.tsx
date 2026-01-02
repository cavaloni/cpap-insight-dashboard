'use client';

import { useEffect, useState } from 'react';

interface PressureBarsProps {
  values?: number[];
  count?: number;
}

export function PressureBars({ values, count = 12 }: PressureBarsProps) {
  const [bars, setBars] = useState<number[]>([]);

  useEffect(() => {
    if (values) {
      setBars(values);
    } else {
      const randomBars = Array.from({ length: count }, () => 
        Math.random() * 0.5 + 0.3
      );
      setBars(randomBars);
    }
  }, [values, count]);

  return (
    <div className="flex items-end gap-1 h-16">
      {bars.map((height, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all duration-300"
          style={{
            height: `${height * 100}%`,
            background: 'linear-gradient(to top, #2a86ff, transparent)',
            animation: `pneuma-pulse ${2 + (i % 3) * 0.5}s ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
            opacity: 0.8
          }}
        />
      ))}
    </div>
  );
}
