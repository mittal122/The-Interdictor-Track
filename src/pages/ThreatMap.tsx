import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useSocket } from '../contexts/SocketContext';
import L from 'leaflet';
import { Activity } from 'lucide-react';

// Custom icon for dark theme map
const anomalyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export function ThreatMap() {
  const { telemetry } = useSocket();
  const anomalies = telemetry?.anomalies || [];

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
            Global Threat Map
          </h2>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">
            Spatial Anomaly Detection Canvas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-500">Live Feed</span>
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-1 shadow-sm relative overflow-hidden z-0">
        <MapContainer 
          center={[20, 0]} 
          zoom={2} 
          style={{ height: '100%', width: '100%', background: '#09090b', borderRadius: '0.5rem' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          />
          {anomalies.map((anomaly: any) => (
            <Marker key={anomaly.id} position={[anomaly.lat, anomaly.lng]} icon={anomalyIcon}>
              <Popup className="dark-popup">
                <div className="text-zinc-900 font-mono text-xs p-1">
                  <strong className="text-red-600 uppercase tracking-wider block mb-1">Anomaly Detected</strong>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                    <span className="text-zinc-500">ID:</span>
                    <span className="font-semibold">{anomaly.id}</span>
                    <span className="text-zinc-500">Severity:</span>
                    <span className="font-semibold text-red-600">{anomaly.severity}</span>
                    <span className="text-zinc-500">Lat:</span>
                    <span>{anomaly.lat.toFixed(4)}</span>
                    <span className="text-zinc-500">Lng:</span>
                    <span>{anomaly.lng.toFixed(4)}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
