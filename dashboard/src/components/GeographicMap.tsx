'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { CountryDistItem } from '@/lib/data';
import { Globe, BarChart2, MapPin, Info, TrendingUp } from 'lucide-react';

const RealLeafletMap = dynamic(() => import('./RealLeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[270px] bg-[#12151b] border border-[#262b35] rounded-lg flex items-center justify-center text-xs text-[#64748b] animate-pulse">
      <Globe className="w-5 h-5 text-[#10b981] animate-spin mr-2" />
      <span>Loading interactive map tiles...</span>
    </div>
  ),
});

const COUNTRY_NAMES: Record<string, string> = {
  AU: 'Australia',
  US: 'United States',
  IN: 'India',
  CA: 'Canada',
  UK: 'United Kingdom',
  DE: 'Germany',
};

interface GeographicMapProps {
  countryData: CountryDistItem[];
  selectedCountry: string;
  onSelectCountry: (country: string) => void;
  totalFilteredEvents?: number;
}

export const GeographicMap: React.FC<GeographicMapProps> = ({
  countryData,
  selectedCountry,
  onSelectCountry,
  totalFilteredEvents = 0,
}) => {
  const [viewMode, setViewMode] = useState<'ranked' | 'map'>('ranked');

  // Sort countries descending by count
  const sortedCountries = [...countryData].sort((a, b) => b.count - a.count);

  const scopeTotal = totalFilteredEvents > 0
    ? totalFilteredEvents
    : sortedCountries.reduce((acc, c) => acc + c.count, 0) || 1;

  const maxCount = sortedCountries.length > 0 ? sortedCountries[0].count : 1;
  const topCountry = sortedCountries.length > 0 ? sortedCountries[0] : null;

  return (
    <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 flex flex-col justify-between space-y-3">
      {/* Header & View Mode Switcher */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-[#10b981]" />
            <h2 className="text-sm font-bold text-white tracking-tight">Country Activity</h2>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-0.5">
            Geographic distribution: <span className="text-white font-medium">Where does listening activity come from?</span>
          </p>
        </div>

        {/* Toggle between Ranked Bars and Map */}
        <div className="flex items-center space-x-1.5">
          {selectedCountry !== 'ALL' && (
            <button
              onClick={() => onSelectCountry('ALL')}
              className="text-[11px] text-[#10b981] hover:underline cursor-pointer mr-1"
            >
              Clear ({selectedCountry})
            </button>
          )}

          <div className="flex bg-[#12151b] p-0.5 rounded-lg border border-[#262b35] text-xs">
            <button
              onClick={() => setViewMode('ranked')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                viewMode === 'ranked'
                  ? 'bg-[#10b981] text-black font-semibold'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              <span>Ranked</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-[#10b981] text-black font-semibold'
                  : 'text-[#94a3b8] hover:text-white'
              }`}
            >
              <MapPin className="w-3 h-3" />
              <span>Map</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {sortedCountries.length === 0 ? (
        <div className="h-[270px] flex items-center justify-center text-xs text-[#64748b] bg-[#12151b]/40 rounded-lg border border-[#262b35]/60">
          No country activity found for selected filters
        </div>
      ) : viewMode === 'ranked' ? (
        /* Ranked Horizontal Bars (Section 4 F requirement) */
        <div className="space-y-2 py-1">
          {sortedCountries.map((c, idx) => {
            const isSelected = selectedCountry === c.country;
            const pct = ((c.count / scopeTotal) * 100).toFixed(1);
            const barPct = Math.max((c.count / maxCount) * 100, 4);
            const fullName = COUNTRY_NAMES[c.country] || c.country;

            return (
              <div
                key={c.country}
                onClick={() => onSelectCountry(isSelected ? 'ALL' : c.country)}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#10b981]/10 border-[#10b981]'
                    : 'bg-[#12151b] border-[#262b35]/60 hover:border-[#10b981]/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="w-4 text-center font-bold text-[#64748b] text-[11px]">{idx + 1}</span>
                    <span className="font-semibold text-white text-xs">{fullName}</span>
                    <span className="text-[10px] text-[#94a3b8] font-mono">({c.country})</span>
                  </div>
                  <div className="text-right flex items-center space-x-3">
                    <span className="text-[10px] text-[#64748b]">{c.users} listeners</span>
                    <span className="font-bold text-white text-xs">
                      {c.count} <span className="font-normal text-[#10b981] text-[11px]">({pct}%)</span>
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[#181b21] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: isSelected ? '#34d399' : '#10b981',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Real Leaflet Map View */
        <RealLeafletMap
          countryData={sortedCountries}
          selectedCountry={selectedCountry}
          onSelectCountry={onSelectCountry}
        />
      )}

      {/* Insight Box */}
      {topCountry && (
        <div className="bg-[#12151b] border border-[#262b35] rounded-lg p-2.5 flex items-start space-x-2 text-xs">
          <TrendingUp className="w-3.5 h-3.5 text-[#10b981] shrink-0 mt-0.5" />
          <div className="text-[#94a3b8] leading-relaxed text-[11px]">
            <strong className="text-white">Regional Insight:</strong>{' '}
            <strong className="text-white">{COUNTRY_NAMES[topCountry.country] || topCountry.country}</strong> leads with{' '}
            <strong className="text-white">{topCountry.count}</strong> events ({((topCountry.count / scopeTotal) * 100).toFixed(1)}% of volume) and{' '}
            <strong className="text-white">{topCountry.users}</strong> distinct listeners.
          </div>
        </div>
      )}

      {/* Footnote with geographic privacy disclaimer */}
      <div className="flex items-center space-x-1 text-[10px] text-[#64748b] pt-1 border-t border-[#262b35]/60">
        <Info className="w-3 h-3 text-[#94a3b8] shrink-0" />
        <span>Country tags represent synthetic account territories; individual user physical GPS locations are not captured.</span>
      </div>
    </div>
  );
};
