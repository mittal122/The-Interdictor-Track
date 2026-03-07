import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { LiveModeWizard } from '../components/LiveModeWizard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

export function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user } = useAuth();
  const { telemetry, connectionState } = useSocket();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-100 font-mono overflow-hidden">
      <Header telemetry={telemetry} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-950/50 relative">
          {connectionState === 'connecting' ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm">
              <div className="h-12 w-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
              <h2 className="text-xl font-bold text-emerald-400 mb-2">Connecting to AWS Region...</h2>
              <p className="text-zinc-500 text-sm max-w-md text-center">
                Establishing secure IAM connection and querying your infrastructure footprint. This usually takes 5-10 seconds.
              </p>
              <div className="w-64 h-1.5 bg-zinc-800 rounded-full mt-6 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full w-full animate-[pulse_2s_ease-in-out_infinite]"></div>
              </div>
            </div>
          ) : (
            <ErrorBoundary fallbackTitle="Page Error">
              <Outlet />
            </ErrorBoundary>
          )}
        </main>
      </div>
      {/* Live Mode wizard renders as a full-screen overlay when active */}
      <LiveModeWizard />
    </div>
  );
}
