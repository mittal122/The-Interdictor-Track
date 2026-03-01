import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { LiveModeWizard } from '../components/LiveModeWizard';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

export function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user } = useAuth();
  const { telemetry } = useSocket();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-100 font-mono overflow-hidden">
      <Header telemetry={telemetry} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-950/50">
          <Outlet />
        </main>
      </div>
      {/* Live Mode wizard renders as a full-screen overlay when active */}
      <LiveModeWizard />
    </div>
  );
}
