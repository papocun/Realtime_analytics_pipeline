'use client';

import React from 'react';
import { AnalyticsResponse } from '@/types/analytics';
import { Globe, Smartphone, Monitor, Laptop, ShieldAlert } from 'lucide-react';

interface AudienceDevicesTabProps {
  data: AnalyticsResponse;
}

export const AudienceDevicesTab: React.FC<AudienceDevicesTabProps> = ({ data }) => {
  const { country_activity, device_distribution } = data;

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case 'desktop': return Monitor;
      case 'mobile': return Smartphone;
      default: return Laptop;
    }
  };

  return (
    <div className="space-y-6">
      {/* Dimension Modeling Notice Banner */}
      <div className="p-4 bg-[#181b21] border border-amber-500/30 rounded-xl flex items-start space-x-3 text-xs text-[#94a3b8]">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-white text-sm block">Star-Schema Architecture Decision: Event-Level Context vs. User Dimension</strong>
          <p>
            During Phase 1 empirical data verification, individual users were proven to switch devices (e.g. mobile to desktop)
            and countries (up to 6 different countries within a single hour session). Treating country or device as a permanent
            attribute in <code className="text-[#1db954] bg-[#12151b] px-1 py-0.5 rounded">dim_users</code> would introduce data
            corruption and misleading aggregations.
          </p>
          <p>
            Therefore, geographic and device categories are modeled strictly as <strong>event-level context attributes</strong> in{' '}
            <code className="text-[#38bdf8] bg-[#12151b] px-1 py-0.5 rounded">fct_listening_events</code> and summarized in{' '}
            <code className="text-[#8b5cf6] bg-[#12151b] px-1 py-0.5 rounded">agg_country_activity</code> and{' '}
            <code className="text-[#8b5cf6] bg-[#12151b] px-1 py-0.5 rounded">agg_device_distribution</code>.
          </p>
        </div>
      </div>

      {/* Grid: Country on Left, Devices on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Country Activity Card */}
        <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center space-x-2">
                <Globe className="w-4 h-4 text-[#38bdf8]" />
                <span>Geographic Activity & Listener Reach (agg_country_activity)</span>
              </h2>
              <p className="text-xs text-[#94a3b8] mt-0.5">Interaction volume and verified stream distribution across nations</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-[#12151b] border border-[#262b35] text-[#94a3b8]">
              {country_activity.length} regions
            </span>
          </div>

          <div className="space-y-3">
            {country_activity.map((c) => {
              const countryNames: Record<string, string> = {
                AU: 'Australia',
                IN: 'India',
                CA: 'Canada',
                US: 'United States',
                DE: 'Germany',
                UK: 'United Kingdom',
              };
              return (
                <div
                  key={c.country}
                  className="p-3.5 rounded-lg bg-[#12151b] border border-[#262b35] hover:border-[#38bdf8]/40 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-8 h-6 rounded bg-[#181b21] border border-[#262b35] font-bold text-xs text-white flex items-center justify-center">
                        {c.country}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-white">{countryNames[c.country] || c.country}</div>
                        <div className="text-[11px] text-[#94a3b8]">{c.distinct_listeners} unique listeners active</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{c.total_events} events</div>
                      <div className="text-xs font-semibold text-[#1db954]">{c.play_events} plays ({c.event_share_pct}%)</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-[#181b21] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#38bdf8] h-full rounded-full transition-all duration-500"
                      style={{ width: `${c.event_share_pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Device Distribution Card */}
        <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-[#8b5cf6]" />
                <span>Device Platform Distribution (agg_device_distribution)</span>
              </h2>
              <p className="text-xs text-[#94a3b8] mt-0.5">Interaction volume across desktop, mobile, and web applications</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-[#12151b] border border-[#262b35] text-[#94a3b8]">
              3 platforms
            </span>
          </div>

          <div className="space-y-4">
            {device_distribution.map((d) => {
              const Icon = getDeviceIcon(d.device_type);
              const deviceColor =
                d.device_type === 'desktop' ? '#38bdf8' :
                d.device_type === 'mobile' ? '#1db954' : '#8b5cf6';

              return (
                <div
                  key={d.device_type}
                  className="p-4 rounded-lg bg-[#12151b] border border-[#262b35] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${deviceColor}18`, color: deviceColor }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white uppercase tracking-wider">{d.device_type}</div>
                        <div className="text-xs text-[#94a3b8]">{d.play_events} verified play events</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-extrabold text-white">{d.device_share_pct}%</div>
                      <div className="text-xs text-[#64748b]">{d.total_events} total events</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-[#181b21] h-2 rounded-full overflow-hidden border border-[#262b35]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${d.device_share_pct}%`, backgroundColor: deviceColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-3 rounded-lg bg-[#12151b] border border-[#262b35] text-xs text-[#64748b] space-y-1">
            <span className="font-semibold text-white block">Platform Observations:</span>
            <p>• <strong>Desktop</strong> leads engagement with 37.05% of all interactions (52 plays).</p>
            <p>• <strong>Mobile</strong> follows closely with 33.44% share (50 plays).</p>
            <p>• <strong>Web Player</strong> accounts for 29.51% share (45 plays).</p>
          </div>
        </div>
      </div>
    </div>
  );
};
