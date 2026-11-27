import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false, className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="w-7 h-7 sm:w-8 sm:h-8 shrink-0"
      >
        <defs>
          <linearGradient id="aureliaGold" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff0bd" />
            <stop offset="48%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8d6514" />
          </linearGradient>
          <linearGradient id="aureliaCore" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3b0764" />
            <stop offset="100%" stopColor="#0d0818" />
          </linearGradient>
        </defs>
        <path
          d="M32 4L56 20L47 56H17L8 20L32 4Z"
          fill="url(#aureliaCore)"
          stroke="url(#aureliaGold)"
          strokeWidth="2.75"
          strokeLinejoin="round"
        />
        <path
          d="M32 14L44 32L32 49L20 32L32 14Z"
          fill="url(#aureliaGold)"
          fillOpacity="0.92"
        />
        <path
          d="M32 21L38 32L32 42L26 32L32 21Z"
          fill="#110a1f"
        />
      </svg>
      {!compact && (
        <span className="font-display text-sm sm:text-lg font-bold tracking-[0.1em] sm:tracking-[0.14em] gold-gradient-text uppercase">
          Aurelia Arena
        </span>
      )}
    </span>
  );
};
