import React from "react";
import { KPICard } from "./charts/KPICard";
import { LatencyChart } from "./charts/LatencyChart";
import { ServerLoadChart } from "./charts/ServerLoadChart";
import { CommandModule } from "./CommandModule";
import { Activity, AlertTriangle, Cpu, Network } from "lucide-react";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";

export function Dashboard({ telemetry: _propTelemetry }: { telemetry: any }) {
  const { telemetry } = useSocket();
  const { user } = useAuth();

  if (!telemetry) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-zinc-500">
          <Activity className="h-8 w-8 animate-pulse" />
          <p className="text-sm uppercase tracking-widest">Establishing Uplink...</p>
        </div>
      </div>
    );
  }

  const isCritical = telemetry.globalHealth < 90;
  const isAdmin = user?.role === "admin";
  const activeAnomaliesCount = telemetry.anomalies?.length || 0;

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
            System Overview
          </h2>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">
            Real-time telemetry & command interface
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Global Health"
          value={`${telemetry.globalHealth.toFixed(1)}%`}
          icon={Activity}
          trend={isCritical ? "down" : "up"}
          status={isCritical ? "critical" : "nominal"}
          className="lg:col-span-1"
        />
        <KPICard
          title="Avg Latency"
          value={`${telemetry.networkLatency.toFixed(0)} ms`}
          icon={Network}
          trend={telemetry.networkLatency > 50 ? "up" : "down"}
          status={telemetry.networkLatency > 100 ? "critical" : telemetry.networkLatency > 50 ? "warning" : "nominal"}
        />
        <KPICard
          title="Active Anomalies"
          value={activeAnomaliesCount.toString()}
          icon={AlertTriangle}
          trend={activeAnomaliesCount > 0 ? "up" : "neutral"}
          status={activeAnomaliesCount > 1 ? "critical" : activeAnomaliesCount === 1 ? "warning" : "nominal"}
        />
        <KPICard
          title="Core Compute"
          value={`${telemetry.cpuUsage.toFixed(1)}%`}
          icon={Cpu}
          trend="up"
          status={telemetry.cpuUsage > 80 ? "warning" : "nominal"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 flex-1 min-h-0">
        <div className={isAdmin ? "lg:col-span-2 flex flex-col gap-4 h-full" : "lg:col-span-3 flex flex-col gap-4 h-full"}>
          <div className="flex-1 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 shadow-sm min-h-[250px]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
                Network Latency Trend
              </h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                Live Data
              </span>
            </div>
            <div className="h-[calc(100%-2rem)] w-full">
              <LatencyChart currentLatency={telemetry.networkLatency} />
            </div>
          </div>

          <div className="flex-1 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 shadow-sm min-h-[250px]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
                Regional Server Load
              </h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                Capacity
              </span>
            </div>
            <div className="h-[calc(100%-2rem)] w-full">
              <ServerLoadChart data={telemetry.serverLoad} />
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="lg:col-span-1 h-full">
            <CommandModule />
          </div>
        )}
      </div>
    </div>
  );
}
