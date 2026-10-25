'use client';

import React from 'react';
import { Calendar, Globe, Smartphone, Search, RefreshCw } from 'lucide-react';

interface FilterBarProps {
  selectedCountry: string;
  setSelectedCountry: (country: string) => void;
  selectedDevice: string;
  setSelectedDevice: (device: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedCountry,
  setSelectedCountry,
  selectedDevice,
  setSelectedDevice,
  searchQuery,
  setSearchQuery,
  onRefresh,
  isLoading,
}) => {
  return (
    <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Indicator (fixed to active dataset) */}
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-[#12151b] border border-[#262b35] text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#1db954]" />
            <span className="text-[#94a3b8]">Reporting Date:</span>
            <span className="text-white font-medium">2026-10-20</span>
          </div>

          {/* Country Selector */}
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-[#12151b] border border-[#262b35] text-xs">
            <Globe className="w-3.5 h-3.5 text-[#38bdf8]" />
            <label htmlFor="country-select" className="text-[#94a3b8]">Country:</label>
            <select
              id="country-select"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#181b21]">All (6 Countries)</option>
              <option value="AU" className="bg-[#181b21]">Australia (AU)</option>
              <option value="IN" className="bg-[#181b21]">India (IN)</option>
              <option value="CA" className="bg-[#181b21]">Canada (CA)</option>
              <option value="US" className="bg-[#181b21]">United States (US)</option>
              <option value="DE" className="bg-[#181b21]">Germany (DE)</option>
              <option value="UK" className="bg-[#181b21]">United Kingdom (UK)</option>
            </select>
          </div>

          {/* Device Selector */}
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-[#12151b] border border-[#262b35] text-xs">
            <Smartphone className="w-3.5 h-3.5 text-[#8b5cf6]" />
            <label htmlFor="device-select" className="text-[#94a3b8]">Device:</label>
            <select
              id="device-select"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#181b21]">All Devices</option>
              <option value="desktop" className="bg-[#181b21]">Desktop</option>
              <option value="mobile" className="bg-[#181b21]">Mobile</option>
              <option value="web" className="bg-[#181b21]">Web Player</option>
            </select>
          </div>
        </div>

        {/* Right: Search & Refresh */}
        <div className="flex items-center space-x-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search song or artist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#12151b] border border-[#262b35] text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-[#1db954]"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#12151b] border border-[#262b35] text-xs text-[#94a3b8] hover:text-white hover:border-[#1db954]/50 transition-all disabled:opacity-50"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#1db954]' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
};
