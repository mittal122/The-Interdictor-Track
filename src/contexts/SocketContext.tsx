import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useAppMode } from './AppModeContext';

interface SocketContextType {
  socket: Socket | null;
  telemetry: any | null;
}

const SocketContext = createContext<SocketContextType | null>(null);

// ── Demo mode: generate realistic dummy telemetry locally ──────────────────
function generateDemoTelemetry() {
  const spike = Math.random() > 0.85;
  const health = spike ? 65 + Math.random() * 20 : 88 + Math.random() * 12;
  const anomalyCount = spike ? Math.floor(Math.random() * 4) + 1 : Math.random() > 0.7 ? 1 : 0;

  const anomalies = Array.from({ length: anomalyCount }, (_, i) => ({
    id: `ANM-DEMO-${Date.now().toString(36).toUpperCase()}-${i}`,
    lat: (Math.random() * 140) - 70,
    lng: (Math.random() * 340) - 170,
    severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"][Math.floor(Math.random() * 4)],
  }));

  return {
    timestamp: Date.now(),
    globalHealth: health,
    networkLatency: spike ? 120 + Math.random() * 80 : 18 + Math.random() * 45,
    cpuUsage: spike ? 70 + Math.random() * 25 : 20 + Math.random() * 55,
    memoryUsage: 30 + Math.random() * 45,
    anomalies,
    serverLoad: [
      { region: "US-East", load: 35 + Math.random() * 55 },
      { region: "US-West", load: 25 + Math.random() * 50 },
      { region: "EU-Central", load: 30 + Math.random() * 45 },
      { region: "AP-South", load: 20 + Math.random() * 60 },
      { region: "AP-East", load: 15 + Math.random() * 50 },
    ],
    computeNodes: null,
    billingData: null,
  };
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [telemetry, setTelemetry] = useState<any | null>(null);
  const { token } = useAuth();
  const { mode } = useAppMode();
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // ── DEMO MODE: local simulation, no WebSocket ────────────────────────
    if (mode === 'demo') {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setTelemetry(generateDemoTelemetry());
      demoIntervalRef.current = setInterval(() => {
        setTelemetry(generateDemoTelemetry());
      }, 2000);

      return () => {
        if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      };
    }

    // ── LIVE MODE: real WebSocket connection ─────────────────────────────
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }

    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const newSocket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket'],
      secure: protocol === 'wss',
      rejectUnauthorized: false,
    });

    newSocket.on('connect', () => {
      console.log(`[LIVE] Connected to telemetry stream (${protocol})`);
    });

    newSocket.on('telemetry_update', (data) => {
      setTelemetry(data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, mode]);

  return (
    <SocketContext.Provider value={{ socket, telemetry }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
