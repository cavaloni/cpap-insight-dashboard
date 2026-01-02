'use client';

export function PneumaBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div 
        className="absolute inset-0 bg-background"
        style={{
          background: `
            radial-gradient(circle at 20% 30%, rgba(112, 216, 255, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(42, 134, 255, 0.06) 0%, transparent 50%),
            #06090f
          `
        }}
      />
      
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(112, 216, 255, 0.03) 2px,
              rgba(112, 216, 255, 0.03) 4px
            )
          `,
          animation: 'pneuma-drift 60s linear infinite'
        }}
      />
    </div>
  );
}
