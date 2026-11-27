import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, Globe, ShieldCheck, Smartphone } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { GENERATED_ASSETS, VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';

const INSTALL_STEPS = [
  'Download the APK file directly using the verified HTTPS button above.',
  'Open the downloaded aurelia-arena.apk file from your browser downloads or file manager.',
  'Allow installation from this source if Android requests permission for unknown apps.',
  'Tap Install and wait for package verification to complete.',
  'Open Aurelia Arena and sign in with your account to sync your virtual coin wallet.',
];

export default function DownloadApkPage() {
  const { apkConfig } = useApp();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="surface-panel rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-7 sm:p-10 space-y-6 flex flex-col justify-center">
          <BrandLogo />
          <div className="space-y-2">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#faf6ee]">
              Android APK Download
            </h1>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Install the dedicated Android companion build when available, or play all three 3D WebGL games directly in your browser right now without installing anything.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-white/10">
            <div>
              <dt className="text-xs text-zinc-500">App Name</dt>
              <dd className="font-medium text-zinc-100 mt-0.5">Aurelia Arena 3D</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Version</dt>
              <dd className="font-mono-num text-zinc-100 mt-0.5">v{apkConfig.version}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">APK File Size</dt>
              <dd className="font-mono-num text-zinc-100 mt-0.5">{apkConfig.size}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Latest Update</dt>
              <dd className="font-mono-num text-zinc-100 mt-0.5">{apkConfig.updatedAt}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-zinc-500">Android Compatibility</dt>
              <dd className="text-zinc-200 mt-0.5">{apkConfig.androidCompat}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={apkConfig.downloadUrl || '/api/download-apk'}
              download="aurelia-arena-v1.2.0.apk"
              className="gold-button px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Download APK (v{apkConfig.version})</span>
            </a>

            <Link
              to="/games"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#d4af37]/30 text-sm text-[#f6dc93] hover:bg-white/5 whitespace-nowrap"
            >
              <Globe className="w-4 h-4" />
              <span>Play Directly in Browser</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 min-h-[280px] bg-[#0b0814]">
          <img
            src={GENERATED_ASSETS.apkShowcase}
            alt="Aurelia Arena Android device preview"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* 5-Step Installation Instructions */}
      <div className="surface-panel rounded-2xl p-6 sm:p-8 space-y-5">
        <h2 className="font-display text-2xl font-bold text-[#faf6ee]">
          Android Installation Instructions
        </h2>
        <ol className="space-y-3.5 text-sm text-zinc-300">
          {INSTALL_STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="font-mono-num text-xs font-bold text-[#09070d] bg-[#d4af37] w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            <span>Full web version remains 100% playable without installing the APK</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#d4af37]" />
            <span>{VIRTUAL_COIN_DISCLAIMER}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
