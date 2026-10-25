'use client';

import React from 'react';
import { LucideIcon, HelpCircle } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  accentColor?: string;
  formula?: string;
  badge?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  accentColor = '#1db954',
  formula,
  badge,
}) => {
  return (
    <div className="bg-[#181b21] border border-[#262b35] rounded-xl p-5 hover:border-[#1db954]/50 transition-all duration-200 group relative">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-[#94a3b8]">{title}</span>
            {formula && (
              <div className="relative group/tooltip">
                <HelpCircle className="w-3.5 h-3.5 text-[#64748b] hover:text-[#94a3b8] cursor-help" />
                <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block z-50 w-64 p-2 bg-[#0f1115] border border-[#262b35] rounded shadow-xl text-xs text-[#94a3b8]">
                  <span className="font-semibold text-white block mb-0.5">Calculation:</span>
                  {formula}
                </div>
              </div>
            )}
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">{value}</div>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
          style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-[#64748b] pt-3 border-t border-[#262b35]/50">
        <span>{subtitle || 'Verified against Snowflake Gold'}</span>
        {badge && (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#262b35] text-[#94a3b8]">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
};
