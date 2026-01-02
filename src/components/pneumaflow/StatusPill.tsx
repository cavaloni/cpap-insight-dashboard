'use client';

export function StatusPill() {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/30 backdrop-blur-[20px] border border-border">
      <div 
        className="w-2 h-2 rounded-full bg-air-glow"
        style={{
          animation: 'pneuma-pulse 2s ease-in-out infinite',
          boxShadow: '0 0 8px rgba(112, 216, 255, 0.6)'
        }}
      />
      <span className="text-sm font-medium text-air-glow">Ready</span>
    </div>
  );
}
