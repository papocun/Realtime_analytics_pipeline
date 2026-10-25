'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  activeTab: 'overview' | 'songs' | 'audience' | 'quality';
  setActiveTab: (tab: 'overview' | 'songs' | 'audience' | 'quality') => void;
  lastUpdated?: string;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, lastUpdated }) => {
  const tabs: Array<{ id: 'overview' | 'songs' | 'audience' | 'quality'; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs & Artists' },
    { id: 'audience', label: 'Audience & Devices' },
    { id: 'quality', label: 'Data Quality & Lineage' },
  ];

  return (
    <header className="border-b border-[#262b35] bg-[#12151b] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg shadow-[#10b981]/20 text-black">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <rect x="2" y="9" width="2.5" height="6" rx="1.25" />
                <rect x="6.5" y="5" width="2.5" height="14" rx="1.25" />
                <rect x="11" y="2" width="2.5" height="20" rx="1.25" />
                <rect x="15.5" y="6" width="2.5" height="12" rx="1.25" />
                <rect x="20" y="10" width="2.5" height="4" rx="1.25" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Realtime Music Analytics</h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30">
                  Analytics Platform
                </span>
              </div>
              <p className="text-xs text-[#94a3b8]">Music Streaming Intelligence</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="hidden md:flex items-center space-x-4">
            {lastUpdated && (
              <span className="text-xs text-[#64748b]">Sync: {lastUpdated}</span>
            )}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-[#181b21] border border-[#262b35] text-xs">
              <div className="w-2 h-2 rounded-full bg-[#1db954] animate-pulse"></div>
              <span className="text-[#94a3b8]">Snowflake:</span>
              <span className="text-white font-medium">SPOTIFY_DB.GOLD</span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-[#64748b]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1db954]" />
              <span>117 dbt tests passing</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 overflow-x-auto py-2 border-t border-[#262b35]/60">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#1db954] text-black shadow-md shadow-[#1db954]/20 font-semibold'
                  : 'text-[#94a3b8] hover:text-white hover:bg-[#181b21]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
