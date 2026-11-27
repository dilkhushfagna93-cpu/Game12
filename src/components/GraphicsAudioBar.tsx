import React from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const GraphicsAudioBar: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { soundEnabled, musicEnabled, volume, updateAudio } = useApp();

  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'flex-wrap gap-3'} text-xs shrink-0`}>
      <div className="flex items-center gap-0.5 sm:gap-1 bg-black/50 border border-white/10 rounded-lg p-0.5 sm:p-1">
        <button
          type="button"
          onClick={() => updateAudio({ soundEnabled: !soundEnabled })}
          className={`inline-flex items-center gap-1.5 ${
            compact ? 'px-2 py-1' : 'px-2.5 py-1'
          } rounded-md transition-colors whitespace-nowrap shrink-0 ${
            soundEnabled ? 'text-[#f6dc93] bg-white/5' : 'text-zinc-500 hover:text-zinc-200'
          }`}
          aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          title={soundEnabled ? 'Mute Sound Effects' : 'Unmute Sound Effects'}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          {!compact && <span>SFX</span>}
        </button>

        <button
          type="button"
          onClick={() => updateAudio({ musicEnabled: !musicEnabled })}
          className={`inline-flex items-center gap-1.5 ${
            compact ? 'px-2 py-1' : 'px-2.5 py-1'
          } rounded-md transition-colors whitespace-nowrap shrink-0 ${
            musicEnabled ? 'text-[#f6dc93] bg-white/5' : 'text-zinc-500 hover:text-zinc-200'
          }`}
          aria-label={musicEnabled ? 'Turn ambient music off' : 'Turn ambient music on'}
          title={musicEnabled ? 'Mute Ambient Music' : 'Play Ambient Music'}
        >
          <Music className="w-3.5 h-3.5" />
          {!compact && <span>Music</span>}
        </button>

        {!compact && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => updateAudio({ volume: Number(e.target.value) })}
            aria-label="Master Volume"
            className="w-20 accent-[#d4af37] cursor-pointer mx-1.5"
          />
        )}
      </div>
    </div>
  );
};
