import React, { useState, useEffect, useMemo } from "react";
import { Globe, Activity, Network, AlertTriangle, Signal, Wifi, FlaskConical } from "lucide-react";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAppMode } from "../contexts/AppModeContext";

// --- Types ---
interface GridRegion {
    id: string;
    code: string;
    name: string;
    row: number;
    col: number;
    nodeCount: number;
    health: number;
    avgLatency: number;
    bandwidth: number;
    status: "healthy" | "degraded" | "critical" | "offline";
}

// 24 geographic grid cells
const REGION_MAP: { code: string; name: string; row: number; col: number; awsPrefix?: string }[] = [
    { code: "NA-NW", name: "N. America Northwest", row: 0, col: 0, awsPrefix: "us-west" },
    { code: "NA-NE", name: "N. America Northeast", row: 0, col: 1, awsPrefix: "us-east" },
    { code: "NA-SW", name: "N. America Southwest", row: 1, col: 0, awsPrefix: "us-west" },
    { code: "NA-SE", name: "N. America Southeast", row: 1, col: 1, awsPrefix: "us-east" },
    { code: "EU-NW", name: "Europe Northwest", row: 0, col: 2, awsPrefix: "eu-west" },
    { code: "EU-NE", name: "Europe Northeast", row: 0, col: 3, awsPrefix: "eu-north" },
    { code: "EU-SW", name: "Europe Southwest", row: 1, col: 2, awsPrefix: "eu-west" },
    { code: "EU-SE", name: "Europe Southeast", row: 1, col: 3, awsPrefix: "eu-central" },
    { code: "AF-NW", name: "Africa Northwest", row: 2, col: 2, awsPrefix: "af-south" },
    { code: "AF-NE", name: "Africa Northeast", row: 2, col: 3, awsPrefix: "me-south" },
    { code: "AF-SW", name: "Africa Southwest", row: 3, col: 2, awsPrefix: "af-south" },
    { code: "AF-SE", name: "Africa Southeast", row: 3, col: 3, awsPrefix: "af-south" },
    { code: "AS-NW", name: "Asia Northwest", row: 0, col: 4, awsPrefix: "ap-south" },
    { code: "AS-NE", name: "Asia Northeast", row: 0, col: 5, awsPrefix: "ap-northeast" },
    { code: "AS-SW", name: "Asia Southwest", row: 1, col: 4, awsPrefix: "ap-south" },
    { code: "AS-SE", name: "Asia Southeast", row: 1, col: 5, awsPrefix: "ap-southeast" },
    { code: "OC-NW", name: "Oceania Northwest", row: 2, col: 4, awsPrefix: "ap-southeast" },
    { code: "OC-NE", name: "Oceania Northeast", row: 2, col: 5, awsPrefix: "ap-southeast" },
    { code: "OC-SW", name: "Oceania Southwest", row: 3, col: 4, awsPrefix: "ap-southeast" },
    { code: "OC-SE", name: "Oceania Southeast", row: 3, col: 5, awsPrefix: "ap-southeast" },
    { code: "SA-NW", name: "S. America Northwest", row: 2, col: 0, awsPrefix: "sa-east" },
    { code: "SA-NE", name: "S. America Northeast", row: 2, col: 1, awsPrefix: "sa-east" },
    { code: "SA-SW", name: "S. America Southwest", row: 3, col: 0, awsPrefix: "sa-east" },
    { code: "SA-SE", name: "S. America Southeast", row: 3, col: 1, awsPrefix: "sa-east" },
];

// --- Demo data generator ---
function generateDemoRegions(): GridRegion[] {
    return REGION_MAP.map((r, i) => {
        const health = Math.random() > 0.9 ? 50 + Math.random() * 30 : 80 + Math.random() * 20;
        return {
            id: `REG-${String(i).padStart(2, "0")}`,
            code: r.code,
            name: r.name,
            row: r.row,
            col: r.col,
            nodeCount: Math.floor(5 + Math.random() * 45),
            health: Math.round(health * 10) / 10,
            avgLatency: Math.round(5 + Math.random() * (health < 80 ? 120 : 50)),
            bandwidth: Math.round((1 + Math.random() * 9) * 10) / 10,
            status: health >= 95 ? "healthy" : health >= 80 ? "degraded" : health >= 60 ? "critical" : "offline",
        };
    });
}

// --- Build live regions from AWS EC2 nodes ---
function buildLiveRegions(computeNodes: any[]): GridRegion[] {
    // Group EC2 instances by their region prefix
    const regionGroups: Record<string, any[]> = {};
    computeNodes.forEach(node => {
        const nodeRegion = (node.region || "").toLowerCase();
        // Find best-matching REGION_MAP entry by awsPrefix
        const match = REGION_MAP.find(r => r.awsPrefix && nodeRegion.startsWith(r.awsPrefix));
        const key = match?.code || "NA-NE"; // default to us-east if unmatched
        if (!regionGroups[key]) regionGroups[key] = [];
        regionGroups[key].push(node);
    });

    return REGION_MAP.map((r, i) => {
        const nodes = regionGroups[r.code] || [];
        const hasLiveData = nodes.length > 0;

        if (hasLiveData) {
            const runningNodes = nodes.filter((n: any) => n.status === "running");
            const health = nodes.length > 0 ? Math.round((runningNodes.length / nodes.length) * 100) : 100;
            const avgCpu = nodes.reduce((s: number, n: any) => s + (n.cpu || 0), 0) / nodes.length;
            return {
                id: `REG-${String(i).padStart(2, "0")}`,
                code: r.code,
                name: r.name,
                row: r.row,
                col: r.col,
                nodeCount: nodes.length,
                health,
                avgLatency: Math.round(10 + avgCpu * 0.5), // derived estimate
                bandwidth: Math.round(nodes.length * 0.8 * 10) / 10,
                status: health >= 95 ? "healthy" : health >= 80 ? "degraded" : health >= 60 ? "critical" : "offline",
            };
        }

        // Region has no EC2 nodes — show as low-confidence offline
        return {
            id: `REG-${String(i).padStart(2, "0")}`,
            code: r.code,
            name: r.name,
            row: r.row,
            col: r.col,
            nodeCount: 0,
            health: 0,
            avgLatency: 0,
            bandwidth: 0,
            status: "offline" as const,
        };
    });
}

function healthColor(health: number): string {
    if (health >= 95) return "bg-emerald-500/60 border-emerald-500/30 hover:bg-emerald-500/80";
    if (health >= 85) return "bg-emerald-700/40 border-emerald-600/20 hover:bg-emerald-600/50";
    if (health >= 80) return "bg-yellow-600/40 border-yellow-600/20 hover:bg-yellow-500/50";
    if (health >= 60) return "bg-orange-600/40 border-orange-600/20 hover:bg-orange-500/50";
    if (health > 0) return "bg-red-600/50 border-red-600/30 hover:bg-red-500/60";
    return "bg-zinc-800/40 border-zinc-700/20 hover:bg-zinc-700/30";
}
function healthTextColor(health: number): string {
    if (health >= 95) return "text-emerald-300";
    if (health >= 80) return "text-yellow-300";
    if (health >= 60) return "text-orange-300";
    if (health > 0) return "text-red-300";
    return "text-zinc-600";
}

export function GlobalNodes() {
    const { telemetry } = useSocket();
    const { mode } = useAppMode();
    const [demoRegions, setDemoRegions] = useState<GridRegion[]>(() => generateDemoRegions());
    const [selected, setSelected] = useState<GridRegion | null>(null);

    // Only run the demo interval in demo mode
    useEffect(() => {
        if (mode === "live") return;
        const interval = setInterval(() => setDemoRegions(generateDemoRegions()), 3000);
        return () => clearInterval(interval);
    }, [mode]);

    // Decide which data source to use
    const isLive = mode === "live" && telemetry?.computeNodes && telemetry.computeNodes.length > 0;
    const regions: GridRegion[] = isLive
        ? buildLiveRegions(telemetry.computeNodes)
        : demoRegions;

    const stats = useMemo(() => ({
        totalNodes: regions.reduce((s, r) => s + r.nodeCount, 0),
        avgHealth: Math.round(regions.reduce((s, r) => s + r.health, 0) / regions.length * 10) / 10,
        worst: [...regions].sort((a, b) => a.health - b.health)[0],
        activeRegions: regions.filter(r => r.health > 0).length,
    }), [regions]);

    return (
        <div className="flex h-full flex-col gap-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Global Nodes</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Geographic Grid Health Map</p>
                </div>
                <div className="flex items-center gap-2">
                    {isLive ? (
                        <>
                            <Wifi className="h-4 w-4 text-emerald-400 animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                                Live · {telemetry.computeNodes.length} EC2 Nodes
                            </span>
                        </>
                    ) : (
                        <>
                            <FlaskConical className="h-4 w-4 text-yellow-400 animate-pulse" />
                            <span className="text-xs font-medium uppercase tracking-widest text-yellow-400">Demo Feed</span>
                        </>
                    )}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniKPI icon={Network} label="Total Nodes" value={stats.totalNodes.toString()} />
                <MiniKPI icon={Activity} label="Avg Health" value={`${stats.avgHealth}%`} color={stats.avgHealth > 90 ? "text-emerald-400" : "text-yellow-400"} />
                <MiniKPI icon={AlertTriangle} label="Lowest Region" value={stats.worst?.code || "—"} color="text-red-400" />
                <MiniKPI icon={Signal} label="Active Regions" value={`${stats.activeRegions} / ${regions.length}`} />
            </div>

            {/* Grid Map + Detail */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0">
                <div className="lg:col-span-3 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Regional Health Grid</h3>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/60" /> &gt;95%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-600/40" /> 80–95%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600/50" /> &lt;60%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-zinc-800/40" /> No Nodes</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-x-auto min-h-0 pb-2 -mx-2 px-2 lg:mx-0 lg:px-0 lg:overflow-visible">
                        <div className="grid grid-cols-6 grid-rows-4 gap-2 min-w-[600px] lg:min-w-0 h-full" style={{ minHeight: "320px" }}>
                            {regions.map(region => (
                                <button
                                    key={region.id}
                                    onClick={() => setSelected(region)}
                                    className={cn(
                                        "rounded-lg border p-2.5 text-left transition-all cursor-pointer flex flex-col justify-between",
                                        healthColor(region.health),
                                        selected?.id === region.id && "ring-2 ring-zinc-300 ring-offset-1 ring-offset-zinc-950"
                                    )}
                                    style={{ gridRow: region.row + 1, gridColumn: region.col + 1 }}
                                >
                                    <div className="text-[11px] font-bold text-white/90 tracking-wider">{region.code}</div>
                                    <div className="mt-auto">
                                        <div className={cn("text-lg font-mono font-bold", healthTextColor(region.health))}>
                                            {region.health > 0 ? `${region.health}%` : "—"}
                                        </div>
                                        <div className="text-[9px] text-white/60">
                                            {region.nodeCount > 0 ? `${region.nodeCount} nodes · ${region.avgLatency}ms` : "no nodes"}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                    <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-4">Region Details</h3>
                    {selected ? (
                        <div className="space-y-3 font-mono text-xs">
                            <div className="flex items-center gap-2 mb-4">
                                <Globe className="h-5 w-5 text-zinc-400" />
                                <div>
                                    <div className="text-zinc-100 font-semibold text-sm">{selected.code}</div>
                                    <div className="text-zinc-500 text-[10px]">{selected.name}</div>
                                </div>
                            </div>
                            <DetailRow label="Health" value={selected.health > 0 ? `${selected.health}%` : "No data"} color={healthTextColor(selected.health)} />
                            <DetailRow label="Status" value={selected.status.toUpperCase()} color={selected.status === "healthy" ? "text-emerald-400" : selected.status === "offline" ? "text-zinc-500" : "text-yellow-400"} />
                            <DetailRow label="Node Count" value={selected.nodeCount.toString()} />
                            <DetailRow label="Avg Latency" value={selected.avgLatency > 0 ? `${selected.avgLatency} ms` : "—"} color={selected.avgLatency > 80 ? "text-red-400" : "text-zinc-200"} />
                            <DetailRow label="Bandwidth" value={selected.bandwidth > 0 ? `${selected.bandwidth} Gbps` : "—"} />
                            {isLive && <DetailRow label="Source" value="AWS EC2 Live" color="text-emerald-400" />}
                            {!isLive && <DetailRow label="Source" value="Simulation" color="text-yellow-500" />}
                            {selected.health > 0 && (
                                <div className="mt-3">
                                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Health</div>
                                    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                                        <div
                                            className={cn("h-full rounded-full transition-all", selected.health >= 80 ? "bg-emerald-500" : selected.health >= 60 ? "bg-yellow-500" : "bg-red-500")}
                                            style={{ width: `${selected.health}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-zinc-600">
                            <Globe className="h-8 w-8 mb-2" />
                            <p className="text-xs uppercase tracking-wider">Select a region</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MiniKPI({ icon: Icon, label, value, color = "text-zinc-100" }: { icon: React.ElementType; label: string; value: string; color?: string }) {
    return (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
                <Icon className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-widest">{label}</span>
            </div>
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
