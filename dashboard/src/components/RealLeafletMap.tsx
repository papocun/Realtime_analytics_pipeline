'use client';

// Leaflet CSS must be imported here (client-only component) so Next.js
// processes it correctly alongside the map JS.
import 'leaflet/dist/leaflet.css';

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { CountryDistItem } from '@/lib/data';

interface RealLeafletMapProps {
  countryData: CountryDistItem[];
  selectedCountry: string;
  onSelectCountry: (country: string) => void;
}

export const COUNTRY_CENTROIDS: Record<string, { name: string; lat: number; lng: number }> = {
  AU: { name: 'Australia', lat: -25.2744, lng: 133.7751 },
  IN: { name: 'India', lat: 20.5937, lng: 78.9629 },
  CA: { name: 'Canada', lat: 56.1304, lng: -106.3468 },
  US: { name: 'United States', lat: 37.0902, lng: -95.7129 },
  DE: { name: 'Germany', lat: 51.1657, lng: 10.4515 },
  UK: { name: 'United Kingdom', lat: 55.3781, lng: -3.4360 },
};

/**
 * Calls invalidateSize() after mount using multiple staggered retries.
 * This fixes the Leaflet tile-split bug caused by grid/flex layout
 * measuring the container before CSS is fully applied.
 */
function AutoInvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timers = [
      setTimeout(() => map.invalidateSize(), 0),
      setTimeout(() => map.invalidateSize(), 150),
      setTimeout(() => map.invalidateSize(), 400),
      setTimeout(() => map.invalidateSize(), 900),
    ];

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());

    return () => {
      timers.forEach(clearTimeout);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

export default function RealLeafletMap({
  countryData,
  selectedCountry,
  onSelectCountry,
}: RealLeafletMapProps) {
  const maxEvents = countryData.length > 0 ? Math.max(...countryData.map((c) => c.count)) : 1;
  const activeCountries = countryData.filter((c) => COUNTRY_CENTROIDS[c.country]);

  return (
    /*
     * Outer wrapper: explicit pixel height + relative positioning.
     * MapContainer is set to position:absolute inset-0 so it fills the
     * wrapper regardless of what the parent grid computes.
     */
    <div
      style={{ position: 'relative', height: '270px', width: '100%' }}
      className="rounded-lg overflow-hidden border border-[#262b35]"
    >
      <MapContainer
        center={[25, 10]}
        zoom={1.5}
        minZoom={1}
        maxZoom={8}
        scrollWheelZoom={false}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          height: '100%',
          width: '100%',
        }}
      >
        <AutoInvalidateSize />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {activeCountries.map((c) => {
          const meta = COUNTRY_CENTROIDS[c.country];
          if (!meta) return null;
          const isSelected = selectedCountry === c.country;
          const radius = Math.max(8, Math.min(22, Math.round(8 + (c.count / maxEvents) * 14)));

          return (
            <CircleMarker
              key={c.country}
              center={[meta.lat, meta.lng]}
              radius={radius}
              pathOptions={{
                color: isSelected ? '#ffffff' : '#10b981',
                weight: isSelected ? 3 : 1.5,
                fillColor: isSelected ? '#34d399' : '#10b981',
                fillOpacity: isSelected ? 0.9 : 0.65,
              }}
              eventHandlers={{
                click: () => onSelectCountry(isSelected ? 'ALL' : c.country),
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={0.95}>
                <div style={{ fontSize: '12px', fontFamily: 'inherit' }}>
                  <strong>{meta.name} ({c.country})</strong>
                  <div>{c.count} events • {c.users} listeners</div>
                </div>
              </Tooltip>
              <Popup>
                <div style={{ fontSize: '12px', fontFamily: 'inherit', padding: '4px' }}>
                  <div style={{ fontWeight: 700, borderBottom: '1px solid #ddd', paddingBottom: '4px', marginBottom: '6px' }}>
                    {meta.name} ({c.country})
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                    <span>Events:</span><strong>{c.count}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginTop: '2px' }}>
                    <span>Listeners:</span><strong>{c.users}</strong>
                  </div>
                  <button
                    onClick={() => onSelectCountry(isSelected ? 'ALL' : c.country)}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: '8px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: '#10b981',
                      color: 'black',
                      fontWeight: 600,
                      fontSize: '11px',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {isSelected ? 'Clear Filter' : `Filter by ${c.country}`}
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
