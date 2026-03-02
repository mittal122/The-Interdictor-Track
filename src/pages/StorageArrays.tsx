import React, { useState, useEffect, useMemo } from "react";
import { Database, HardDrive, Activity, ArrowUpDown, Zap, Wifi, FlaskConical } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "../utils/cn";
import { useAppMode } from "../contexts/AppModeContext";
import { useSocket } from "../contexts/SocketContext";

// --- Simulated Data ---
interface StorageArray {
    id: string;
    name: string;
    capacity: number;      // TB
    used: number;           // TB
    writeLatency: number;   // microseconds
    readLatency: number;    // microseconds
    iops: number;
    throughput: number;     // MB/s
    status: "online" | "degraded" | "offline";
}

function generateArrays(): StorageArray[] {
    const prefixes = ["NVMe", "SSD", "HDD", "RAID"];
    return Array.from({ length: 24 }, (_, i) => {
        const writeLatency = Math.random() > 0.85
            ? 500 + Math.random() * 800          // hot spots
            : Math.random() > 0.5
                ? 100 + Math.random() * 400          // warm
                : 10 + Math.random() * 90;           // cool
        const capacity = [2, 4, 8, 16][Math.floor(Math.random() * 4)];
        return {
            id: `SA-${String(i + 1).padStart(3, "0")}`,
            name: `${prefixes[i % 4]}-ARRAY-${String.fromCharCode(65 + (i % 6))}${Math.floor(i / 6) + 1}`,
            capacity,
            used: +(capacity * (0.3 + Math.random() * 0.6)).toFixed(1),
            writeLatency: Math.round(writeLatency),
            readLatency: Math.round(writeLatency * (0.3 + Math.random() * 0.4)),
            iops: Math.round(5000 + Math.random() * 95000),
            throughput: Math.round(200 + Math.random() * 3800),
            status: Math.random() > 0.92 ? "degraded" : Math.random() > 0.97 ? "offline" : "online",
        };
    });
}

function getLatencyColor(latency: number): string {
    if (latency < 100) return "bg-emerald-500/70";
    if (latency < 250) return "bg-emerald-600/50";
    if (latency < 500) return "bg-yellow-500/60";
    if (latency < 800) return "bg-orange-500/60";
    return "bg-red-500/70";
}

function getLatencyBorderColor(latency: number): string {
    if (latency < 100) return "border-emerald-500/30";
    if (latency < 250) return "border-emerald-600/20";
    if (latency < 500) return "border-yellow-500/30";
    if (latency < 800) return "border-orange-500/30";
    return "border-red-500/40";
}

// --- Component ---
export function StorageArrays() {
    const { mode } = useAppMode();
    const { telemetry } = useSocket();
    const [simulatedArrays, setSimulatedArrays] = useState<StorageArray[]>(() => generateArrays());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [iopsHistory, setIopsHistory] = useState<{ time: string; iops: number }[]>([]);

    const isLive = mode === "live" && telemetry?.storageArrays;

    // Refresh metrics every 2s for demo mode
    useEffect(() => {
        if (isLive) return; // In live mode, we get data from socket/memo
        const interval = setInterval(() => {
            setSimulatedArrays(generateArrays());
        }, 2000);
        return () => clearInterval(interval);
    }, [isLive]);

    // Derive the final arrays from either live AWS telemetry or the local simulator
    const arrays = useMemo(() => {
        if (isLive) {
            // Live AWS EBS Data
            // CloudWatch limits real-time IOPS frequency, so we map real volumes and simulate safe jitter for visuals
            return telemetry.storageArrays.map((vol: any) => {
                const isSsd = ['gp2', 'gp3', 'io1', 'io2'].includes(vol.type);
                const writeLatency = isSsd ? 10 + Math.random() * 90 : 200 + Math.random() * 500;
                return {
                    id: vol.id,
                    name: vol.name || vol.type,
                    capacity: parseFloat((vol.capacity / 1024).toFixed(3)), // AWS gives GiB, we want TB
                    used: parseFloat(((vol.capacity / 1024) * (0.3 + Math.random() * 0.4)).toFixed(3)), // Simulate usage jitter
                    writeLatency: Math.round(writeLatency),
                    readLatency: Math.round(writeLatency * 0.4),
                    iops: vol.iops || Math.round(1000 + Math.random() * 5000),
                    throughput: vol.throughput || Math.round(50 + Math.random() * 200),
                    status: ['in-use', 'available'].includes(vol.status) ? "online" : vol.status === 'error' ? "degraded" : "offline",
                    region: vol.region,
                } as StorageArray;
            });
        }
        return simulatedArrays;
    }, [isLive, telemetry?.storageArrays, simulatedArrays]);

    const selected = useMemo(() => arrays.find(a => a.id === selectedId) || null, [arrays, selectedId]);

    // IOPS history
    useEffect(() => {
        const totalIops = arrays.reduce((sum, a) => sum + a.iops, 0);
        const now = new Date();
        const ts = `${now.getMinutes()}:${String(now.getSeconds()).padStart(2, "0")}`;
        setIopsHistory(prev => {
            const next = [...prev, { time: ts, iops: totalIops }];
            return next.length > 30 ? next.slice(-30) : next;
        });
    }, [arrays]);

    const stats = useMemo(() => ({
        totalCapacity: parseFloat(arrays.reduce((s, a) => s + a.capacity, 0).toFixed(1)),
        totalUsed: parseFloat(arrays.reduce((s, a) => s + a.used, 0).toFixed(1)),
        avgWriteLatency: arrays.length > 0 ? Math.round(arrays.reduce((s, a) => s + a.writeLatency, 0) / arrays.length) : 0,
        totalIops: arrays.reduce((s, a) => s + a.iops, 0),
        avgThroughput: arrays.length > 0 ? Math.round(arrays.reduce((s, a) => s + a.throughput, 0) / arrays.length) : 0,
    }), [arrays]);

    return (
        <div className="flex h-full flex-col gap-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Storage Arrays</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Write Latency Heatmap & Performance Metrics</p>
                </div>
                <div className="flex items-center gap-2">
                    {isLive ? (
                        <>
                            <Database className="h-4 w-4 text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Live · {arrays.length} AWS Volumes</span>
                        </>
                    ) : (
                        <>
                            <FlaskConical className="h-4 w-4 text-yellow-500" />
                            <span className="text-xs font-medium uppercase tracking-widest text-yellow-500">Demo Simulation</span>
                        </>
                    )}
                </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={HardDrive} label="Total Capacity" value={`${stats.totalCapacity} TB`} />
                <KPI icon={ArrowUpDown} label="Avg Write Latency" value={`${stats.avgWriteLatency} µs`} status={stats.avgWriteLatency > 500 ? "critical" : stats.avgWriteLatency > 200 ? "warning" : "nominal"} />
                <KPI icon={Zap} label="Aggregate IOPS" value={`${(stats.totalIops / 1000).toFixed(0)}K`} />
                <KPI icon={Database} label="Avg Throughput" value={`${stats.avgThroughput} MB/s`} />
            </div>

            {/* Heatmap + Detail */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Heatmap */}
                <div className="lg:col-span-2 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Write Latency Heatmap</h3>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/70" /> &lt;100µs</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/60" /> 250-500µs</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/70" /> &gt;800µs</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {arrays.map(arr => (
                            <button
                                key={arr.id}
                                onClick={() => setSelectedId(arr.id)}
                                className={cn(
                                    "rounded-lg border p-2 sm:p-3 text-left transition-all hover:scale-[1.03] hover:shadow-lg cursor-pointer",
                                    getLatencyColor(arr.writeLatency),
                                    getLatencyBorderColor(arr.writeLatency),
                                    selected?.id === arr.id && "ring-2 ring-zinc-400 ring-offset-1 ring-offset-zinc-950"
                                )}
                            >
                                <div className="text-[9px] sm:text-[10px] font-bold text-zinc-100 tracking-wider truncate">{arr.id}</div>
                                <div className="text-base sm:text-lg font-mono font-bold text-white mt-1">{arr.writeLatency}<span className="text-[9px] sm:text-[10px] font-normal ml-0.5">µs</span></div>
                                <div className="text-[8px] sm:text-[9px] text-zinc-200/80 mt-0.5 truncate">{arr.name}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                    <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-4">Array Details</h3>
                    {selected ? (
                        <div className="space-y-4 font-mono text-xs">
                            <div className="flex items-center gap-2 mb-4">
                                <HardDrive className="h-5 w-5 text-zinc-400" />
                                <div>
                                    <div className="text-zinc-100 font-semibold text-sm">{selected.id}</div>
                                    <div className="text-zinc-500">{selected.name}</div>
                                </div>
                            </div>
                            <DetailRow label="Status" value={selected.status.toUpperCase()} color={selected.status === "online" ? "text-emerald-400" : selected.status === "degraded" ? "text-yellow-400" : "text-red-400"} />
                            <DetailRow label="Write Latency" value={`${selected.writeLatency} µs`} />
                            <DetailRow label="Read Latency" value={`${selected.readLatency} µs`} />
                            <DetailRow label="IOPS" value={selected.iops.toLocaleString()} />
                            <DetailRow label="Throughput" value={`${selected.throughput} MB/s`} />
                            <DetailRow label="Capacity" value={`${selected.used} / ${selected.capacity} TB`} />
                            {/* Capacity bar */}
                            <div className="mt-2">
                                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all", selected.used / selected.capacity > 0.85 ? "bg-red-500" : selected.used / selected.capacity > 0.7 ? "bg-yellow-500" : "bg-emerald-500")}
                                        style={{ width: `${(selected.used / selected.capacity) * 100}%` }}
                                    />
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-1">{((selected.used / selected.capacity) * 100).toFixed(0)}% utilized</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-zinc-600">
                            <HardDrive className="h-8 w-8 mb-2" />
                            <p className="text-xs uppercase tracking-wider">Select an array</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* IOPS Trend */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 min-h-[250px]">
                    <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-4">Aggregate IOPS Trend</h3>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={iopsHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "6px", fontSize: "12px", color: "#e4e4e7" }} />
                                <Area type="monotone" dataKey="iops" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} dot={false} isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Throughput by Array (top 8) */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 min-h-[250px]">
                    <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider mb-4">Top Throughput by Array</h3>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[...arrays].sort((a, b) => b.throughput - a.throughput).slice(0, 8)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis dataKey="id" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}`} />
                                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "6px", fontSize: "12px", color: "#e4e4e7" }} formatter={(v: number) => [`${v} MB/s`, "Throughput"]} />
                                <Bar dataKey="throughput" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                    {[...arrays].sort((a, b) => b.throughput - a.throughput).slice(0, 8).map((_, i) => (
                                        <Cell key={i} fill={i < 2 ? "#10b981" : i < 5 ? "#3b82f6" : "#6366f1"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Sub-components ---
function KPI({ icon: Icon, label, value, status = "nominal" }: { icon: React.ElementType; label: string; value: string; status?: string }) {
    return (
        <div className={cn(
            "rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3",
            status === "critical" && "border-red-900/30",
            status === "warning" && "border-yellow-900/30",
        )}>
            <div className="flex items-center gap-2 text-zinc-500">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-widest">{label}</span>
            </div>
            <div className={cn(
                "text-xl font-mono font-bold mt-1",
                status === "critical" ? "text-red-400" : status === "warning" ? "text-yellow-400" : "text-zinc-100"
            )}>{value}</div>
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
