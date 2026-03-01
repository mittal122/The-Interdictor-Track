import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";
import { Login } from "./pages/Login";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Dashboard } from "./components/Dashboard";
import { ThreatMap } from "./pages/ThreatMap";
import { StorageArrays } from "./pages/StorageArrays";
import { ComputeClusters } from "./pages/ComputeClusters";
import { GlobalNodes } from "./pages/GlobalNodes";
import { AccessLogs } from "./pages/AccessLogs";
import { SystemConfig } from "./pages/SystemConfig";
import { AiAnalyst } from "./pages/AiAnalyst";

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard telemetry={null} />} />
              <Route path="threat-map" element={<ThreatMap />} />
              <Route path="storage-arrays" element={<StorageArrays />} />
              <Route path="compute-clusters" element={<ComputeClusters />} />
              <Route path="global-nodes" element={<GlobalNodes />} />
              <Route path="access-logs" element={<AccessLogs />} />
              <Route path="system-config" element={<SystemConfig />} />
              <Route path="ai-analyst" element={<AiAnalyst />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
