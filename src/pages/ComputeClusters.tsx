import React, { useState, useEffect, useMemo } from "react";
import { Activity, Cpu, Zap, AlertTriangle, Server, Thermometer } from "lucide-react";
import { cn } from "../utils/cn";

// --- Types ---
interface ServerUnit {
    id: string;
    hostname: string;
    ip: string;
    rack: string;
    slot: number;
    status: "online" | "warning" | "offline" | "maintenance";
    cpu: number;
    ram: number;
    disk: number;
    pue: number;
    uptime: string;
    temp: number;
}

// --- Data Generator ---
function generateServers(): ServerUnit[] {
    const racks = ["RACK-A", "RACK-B", "RACK-C", "RACK-D"];
    const servers: ServerUnit[] = [];
    racks.forEach((rack, ri) => {
        for (let slot = 1; slot <= 8; slot++) {
            const statusRoll = Math.random();
            const status: ServerUnit["status"] = statusRoll > 0.92 ? "offline" : statusRoll > 0.85 ? "maintenance" : statusRoll > 0.75 ? "warning" : "online";
            servers.push({
                id: `SRV-${rack.slice(-1)}${slot}`,
                hostname: `node-${rack.toLowerCase().slice(-1)}${slot}.interdictor.local`,
                ip: `10.${ri + 1}.${slot}.${Math.floor(Math.random() * 254) + 1}`,
                rack,
                slot,
                status,
                cpu: status === "offline" ? 0 : Math.round(10 + Math.random() * 85),
                ram: status === "offline" ? 0 : Math.round(20 + Math.random() * 70),
                disk: status === "offline" ? 0 : Math.round(15 + Math.random() * 75),
                pue: +(1.1 + Math.random() * 0.8).toFixed(2),
                uptime: status === "offline" ? "DOWN" : `${Math.floor(Math.random() * 365)}d ${Math.floor(Math.random() * 24)}h`,
                temp: status === "offline" ? 0 : Math.round(35 + Math.random() * 40),
            });
        }
    });
    return servers;
}

const statusColors: Record<string, string> = {
    online: "bg-emerald-500",
    warning: "bg-yellow-500",
    offline: "bg-red-500",
    maintenance: "bg-zinc-500",
};

const statusGlow: Record<string, string> = {
    online: "shadow-emerald-500/30",
    warning: "shadow-yellow-500/30",
    offline: "shadow-red-500/30",
    maintenance: "shadow-zinc-500/20",
};

export function ComputeClusters() {
    const [servers, setServers] = useState<ServerUnit[]>(() => generateServers());
    const [selected, setSelected] = useState<ServerUnit | null>(null);

    useEffect(() => {
        const interval = setInterval(() => setServers(generateServers()), 3000);
        return () => clearInterval(interval);
    }, []);

    const stats = useMemo(() => {
        const online = servers.filter(s => s.status === "online").length;
        const offline = servers.filter(s => s.status === "offline").length;
        const avgPue = +(servers.reduce((s, sv) => s + sv.pue, 0) / servers.length).toFixed(2);
        const avgCpu = Math.round(servers.filter(s => s.status !== "offline").reduce((s, sv) => s + sv.cpu, 0) / servers.filter(s => s.status !== "offline").length);
        return { total: servers.length, online, offline, avgPue, avgCpu };
    }, [servers]);

    const racks = ["RACK-A", "RACK-B", "RACK-C", "RACK-D"];

    return (
        <div className="flex h-full flex-col gap-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Compute Clusters</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">3D Data Center Rack Visualization</p>
                </div>
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium uppercase tracking-widest text-emerald-500">Live</span>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <MiniKPI label="Total Servers" value={stats.total.toString()} />
                <MiniKPI label="Online" value={stats.online.toString()} color="text-emerald-400" />
                <MiniKPI label="Offline" value={stats.offline.toString()} color={stats.offline > 0 ? "text-red-400" : "text-zinc-400"} />
                <MiniKPI label="Avg PUE" value={stats.avgPue.toString()} color={stats.avgPue > 1.6 ? "text-yellow-400" : "text-emerald-400"} />
                <MiniKPI label="Avg CPU Load" value={`${stats.avgCpu}%`} color={stats.avgCpu > 80 ? "text-red-400" : "text-zinc-100"} />
            </div>

            {/* 3D Rack Grid + Detail */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0">
                {/* Rack Visualization */}
                <div className="lg:col-span-3 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-6">
                    <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-6">Server Rack Layout</h3>
                    <div className="grid grid-cols-4 gap-6">
                        {racks.map((rack) => {
                            const rackServers = servers.filter(s => s.rack === rack);
                            return (
                                <div
                                    key={rack}
                                    className="rounded-xl border border-zinc-700/50 bg-zinc-800/20 p-3 transition-all duration-300 hover:border-zinc-600 hover:-translate-y-1"
                                    style={{
                                        boxShadow: "0 20px 40px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.05)",
                                    }}
                                >
                                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 text-center border-b border-zinc-700/40 pb-2">
                                        {rack}
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {rackServers.map((srv) => (
                                            <button
                                                key={srv.id}
                                                onClick={() => setSelected(srv)}
                                                className={cn(
                                                    "flex items-center gap-2 rounded px-2 py-1.5 text-left transition-all border border-transparent hover:border-zinc-600 cursor-pointer",
                                                    "bg-zinc-800/60 hover:bg-zinc-700/60",
                                                    selected?.id === srv.id && "ring-1 ring-zinc-400 bg-zinc-700/80",
                                                )}
                                            >
                                                <div className={cn("w-2 h-2 rounded-full shrink-0 shadow-sm", statusColors[srv.status], statusGlow[srv.status])} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[10px] font-mono font-bold text-zinc-200 truncate">{srv.id}</div>
                                                </div>
                                                <div className="text-[9px] font-mono text-zinc-500">{srv.cpu}%</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-6 text-[10px] text-zinc-500">
                        {Object.entries(statusColors).map(([status, color]) => (
                            <span key={status} className="flex items-center gap-1.5">
                                <span className={cn("w-2.5 h-2.5 rounded-full", color)} />
                                <span className="uppercase tracking-wider">{status}</span>
                            </span>
                        ))}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                    <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-4">Server Detail</h3>
                    {selected ? (
                        <div className="space-y-3 font-mono text-xs">
                            <div className="flex items-center gap-2 mb-4">
                                <Server className="h-5 w-5 text-zinc-400" />
                                <div>
                                    <div className="text-zinc-100 font-semibold text-sm">{selected.id}</div>
                                    <div className="text-zinc-500 text-[10px]">{selected.hostname}</div>
                                </div>
                            </div>
                            <DetailRow label="Status" value={selected.status.toUpperCase()} color={statusTextColor(selected.status)} />
                            <DetailRow label="IP" value={selected.ip} />
                            <DetailRow label="Rack / Slot" value={`${selected.rack} / U${selected.slot}`} />
                            <DetailRow label="PUE" value={selected.pue.toString()} color={selected.pue > 1.6 ? "text-yellow-400" : "text-emerald-400"} />
                            <DetailRow label="Uptime" value={selected.uptime} />
                            <DetailRow label="Temp" value={`${selected.temp}°C`} color={selected.temp > 65 ? "text-red-400" : selected.temp > 50 ? "text-yellow-400" : "text-zinc-200"} />
                            <div className="mt-3 space-y-2">
                                <UsageBar label="CPU" value={selected.cpu} />
                                <UsageBar label="RAM" value={selected.ram} />
                                <UsageBar label="Disk" value={selected.disk} />
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-zinc-600">
                            <Cpu className="h-8 w-8 mb-2" />
                            <p className="text-xs uppercase tracking-wider">Select a server</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Sub-components ---
function MiniKPI({ label, value, color = "text-zinc-100" }: { label: string; value: string; color?: string }) {
    return (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
            <div className={cn("text-xl font-mono font-bold mt-1", color)}>{value}</div>
        </div>
    );
}

function DetailRow({ label, value, color = "text-zinc-200" }: { label: string; value: string; color?: string }) {
    return (
        <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/30">
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">{label}</span>
            <span className={cn("font-semibold", color)}>{value}</span>
        </div>
    );
}

function UsageBar({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <div className="flex justify-between text-[10px] mb-1">
                <span className="text-zinc-500 uppercase tracking-wider">{label}</span>
                <span className="text-zinc-300 font-semibold">{value}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all", value > 85 ? "bg-red-500" : value > 70 ? "bg-yellow-500" : "bg-emerald-500")}
                    style={{ width: `${value}%` }}
                />
            </div>
        </div>
    );
}

function statusTextColor(status: string): string {
    switch (status) {
        case "online": return "text-emerald-400";
        case "warning": return "text-yellow-400";
        case "offline": return "text-red-400";
        default: return "text-zinc-400";
    }
}
