'use client';

interface SleepScoreOrbProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function SleepScoreOrb({ score, size = 'sm' }: SleepScoreOrbProps) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-32 h-32',
    lg: 'w-40 h-40'
  };

  const textSizes = {
    sm: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-4xl'
  };

  return (
    <div 
      className={`${sizeClasses[size]} rounded-full relative flex items-center justify-center`}
      style={{
        background: `
          radial-gradient(circle at 30% 30%, rgba(112, 216, 255, 0.15) 0%, transparent 70%),
          radial-gradient(circle at center, rgba(230, 245, 255, 0.05) 0%, transparent 100%)
        `,
        boxShadow: `
          0 0 30px rgba(112, 216, 255, 0.2),
          inset 0 0 20px rgba(112, 216, 255, 0.1),
          0 10px 30px -10px rgba(0,0,0,0.5)
        `,
        border: '1px solid rgba(255, 255, 255, 0.12)'
      }}
    >
      <div 
        className={`${textSizes[size]} font-bold`}
        style={{
          background: 'linear-gradient(to bottom, #e0e6ed 0%, #70d8ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent' // Fallback for browsers that don't support background-clip
        }}
      >
        {score}
      </div>
    </div>
  );
}
