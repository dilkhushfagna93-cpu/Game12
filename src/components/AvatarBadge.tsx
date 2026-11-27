import React from 'react';

const PALETTES = [
  ['#4c1d95', '#d4af37'],
  ['#1e1b4b', '#f59e0b'],
  ['#3b0764', '#e5c158'],
  ['#312e81', '#eab308'],
  ['#581c87', '#fbbf24'],
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export const AvatarBadge: React.FC<{ name: string; seed?: string; size?: 'sm' | 'md' | 'lg' }> = ({
  name,
  seed,
  size = 'md',
}) => {
  const safeName = (name || 'PL').trim();
  const initials = safeName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || 'AA';
  const [bg, accent] = PALETTES[hashSeed(seed || safeName) % PALETTES.length];
  const dims =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm';

  return (
    <div
      className={`${dims} rounded-xl flex items-center justify-center font-display font-bold shrink-0 border border-[#d4af37]/40 select-none`}
      style={{
        background: `linear-gradient(135deg, ${bg} 0%, #0d0919 100%)`,
        color: accent,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
};
