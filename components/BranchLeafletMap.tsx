'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

interface LiveBranch {
  id: string;
  name: string;
  desc: string;
  mapsLink: string;
  chain_id: string;
  lat: number | null;
  lng: number | null;
  color_hex: string;
}

interface BranchLeafletMapProps {
  branches: LiveBranch[];
  activeMapPin: string;
  setActiveMapPin: (id: string) => void;
  quickNavigateLabel: string;
  costColorByChain?: Record<string, string>;
  costTotalByChain?: Record<string, number>;
  basketAtBranchLabel?: string;
}

const DEFAULT_CENTER: [number, number] = [32.0853, 34.7818]; // Tel Aviv fallback

function chainIcon(colorHex: string, isActive: boolean) {
  const size = isActive ? 34 : 26;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${colorHex};
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FlyToActive({ branches, activeMapPin }: { branches: LiveBranch[]; activeMapPin: string }) {
  const map = useMap();
  useEffect(() => {
    const active = branches.find((b) => b.id === activeMapPin);
    if (active?.lat && active?.lng) {
      map.flyTo([active.lat, active.lng], 14, { duration: 0.6 });
    }
  }, [activeMapPin, branches, map]);
  return null;
}

export function BranchLeafletMap({ branches, activeMapPin, setActiveMapPin, quickNavigateLabel, costColorByChain, costTotalByChain, basketAtBranchLabel }: BranchLeafletMapProps) {
  const withCoords = branches.filter((b) => b.lat && b.lng);
  const center: [number, number] = withCoords.length > 0
    ? [withCoords[0].lat as number, withCoords[0].lng as number]
    : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className="w-full h-full rounded-3xl" style={{ zIndex: 0 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToActive branches={withCoords} activeMapPin={activeMapPin} />
      {withCoords.map((b) => {
        const costColor = costColorByChain?.[b.chain_id];
        const basketTotal = costTotalByChain?.[b.chain_id];
        return (
          <Marker
            key={b.id}
            position={[b.lat as number, b.lng as number]}
            icon={chainIcon(costColor ?? b.color_hex, b.id === activeMapPin)}
            eventHandlers={{ click: () => setActiveMapPin(b.id) }}
          >
            <Popup>
              <div className="text-sm font-sans">
                <p className="font-bold">{b.name}</p>
                <p className="text-slate-500">{b.desc}</p>
                {basketTotal !== undefined && (
                  <p className="mt-1 font-mono font-semibold" style={{ color: costColor }}>
                    {basketAtBranchLabel ?? 'Basket cost here'}: ₪{basketTotal.toFixed(2)}
                  </p>
                )}
                <a
                  href={b.mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-indigo-600 font-semibold underline"
                >
                  {quickNavigateLabel}
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
