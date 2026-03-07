import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useAppMode } from './AppModeContext';
import { useCredentials } from './CredentialsContext';

export type ConnectionState = 'demo' | 'connecting' | 'live';

interface SocketContextType {
  socket: Socket | null;
  telemetry: any | null;
  connectionState: ConnectionState;
}

const SocketContext = createContext<SocketContextType | null>(null);

// ── Demo mode: generate realistic dummy telemetry locally ─────────────────
function generateDemoTelemetry() {
  const spike = Math.random() > 0.85;
  const health = spike ? 65 + Math.random() * 20 : 88 + Math.random() * 12;
  const anomalyCount = spike ? Math.floor(Math.random() * 4) + 1 : (Math.random() > 0.7 ? 1 : 0);

  return {
    timestamp: Date.now(),
    globalHealth: health,
    networkLatency: spike ? 120 + Math.random() * 80 : 18 + Math.random() * 45,
    cpuUsage: spike ? 70 + Math.random() * 25 : 20 + Math.random() * 55,
    memoryUsage: 30 + Math.random() * 45,
    anomalies: Array.from({ length: anomalyCount }, (_, i) => ({
      id: `ANM-DEMO-${Date.now().toString(36).toUpperCase()}-${i}`,
      lat: (Math.random() * 140) - 70,
      lng: (Math.random() * 340) - 170,
      severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"][Math.floor(Math.random() * 4)],
    })),
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
  const [connectionState, setConnectionState] = useState<ConnectionState>('demo');
  const { token, logout } = useAuth();
  const { mode } = useAppMode();
  const { credentials } = useCredentials();
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // ── DEMO MODE ─────────────────────────────────────────────────────────
    if (mode === 'demo') {
      // Disconnect live socket if we're switching back to demo
      if (socket) { socket.disconnect(); setSocket(null); }

      setConnectionState('demo');
      setTelemetry(generateDemoTelemetry());
      demoIntervalRef.current = setInterval(() => setTelemetry(generateDemoTelemetry()), 2000);
      return () => { if (demoIntervalRef.current) clearInterval(demoIntervalRef.current); };
    }

    // ── LIVE MODE ─────────────────────────────────────────────────────────
    // Clear demo interval first
    if (demoIntervalRef.current) { clearInterval(demoIntervalRef.current); demoIntervalRef.current = null; }

    // Need a JWT token to connect. If missing, stay disconnected.
    if (!token) {
      if (socket) { socket.disconnect(); setSocket(null); }
      return;
    }

    // Connect the WebSocket with JWT + cloud credentials in the auth payload.
    // The backend stores cloudCredentials per-socket and uses them to fetch
    // real AWS EC2 + billing data, then emits personalized telemetry to this socket only.
    setConnectionState('connecting');
    const newSocket = io(window.location.origin, {
      auth: {
        token,
        // Pass credentials to backend — they're stored server-side in socket.data
        // and NEVER written to any logs (masked by credentialMaskMiddleware for HTTP routes).
        cloudCredentials: credentials
          ? {
            awsAccessKeyId: credentials.awsAccessKeyId,
            awsSecretKey: credentials.awsSecretKey,
            awsRegion: credentials.awsRegion,
          }
          : null,
      },
      transports: ['websocket'],
      rejectUnauthorized: import.meta.env.PROD,
    });

    newSocket.on('connect', () => {
      console.log(`[LIVE] WebSocket connected — real AWS telemetry active`);
    });

    newSocket.on('connect_error', (err) => {
      console.error('[LIVE] WebSocket connection failed:', err.message);
      if (
        err.message.includes('Authentication error') ||
        err.message.includes('jwt expired') ||
        err.message.includes('Invalid token')
      ) {
        logout();
      }
      // If connection fails (e.g. backend down), fall back to demo generation
      setTelemetry(generateDemoTelemetry());
    });

    newSocket.on('telemetry_update', (data) => {
      setConnectionState('live');
      setTelemetry(data);
    });

    setSocket(newSocket);

    return () => { newSocket.disconnect(); };
  }, [token, mode, credentials]); // re-connect when credentials change

  return (
    <SocketContext.Provider value={{ socket, telemetry, connectionState }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
}
