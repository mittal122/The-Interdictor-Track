import React, { useState, useMemo } from "react";
import {
    Boxes, Server, HardDrive, Play, Square, AlertTriangle, CheckCircle2, XCircle,
    Loader2, Cloud, Activity, RefreshCw
} from "lucide-react";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAppMode } from "../contexts/AppModeContext";

// ── Demo Data ──────────────────────────────────────────────────────────────
function generateDemoData() {
    const statuses = ["running", "stopped", "running", "running", "stopped", "running"];
    const types = ["t3.micro", "t3.small", "m5.large", "t3.micro", "t2.micro", "c5.xlarge"];
    const regions = ["us-east-1", "us-west-2", "eu-central-1", "ap-southeast-1", "us-east-2", "eu-west-1"];
    const names = ["Web-Server-01", "API-Gateway", "DB-Primary", "Cache-Node", "Dev-Box", "ML-Worker"];

    const instances = names.map((name, i) => ({
        id: `i-demo${String(i).padStart(6, "0")}`,
        name,
        type: types[i],
        status: statuses[i],
        region: regions[i],
        launchTime: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
        publicIp: `54.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        cpu: Math.round(Math.random() * 80),
    }));

    const volumes = regions.slice(0, 4).map((r, i) => ({
        id: `vol-demo${String(i).padStart(6, "0")}`,
        size: [20, 100, 500, 50][i],
        state: "in-use",
        type: ["gp3", "gp3", "io2", "gp3"][i],
        region: r,
        attachedTo: instances[i].id,
    }));

    return { instances, volumes };
}

// ── Status Badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { color: string; icon: React.ElementType }> = {
        running: { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
        stopped: { color: "text-zinc-500 bg-zinc-500/10 border-zinc-600/30", icon: XCircle },
        pending: { color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", icon: Loader2 },
        "shutting-down": { color: "text-red-400 bg-red-500/10 border-red-500/30", icon: AlertTriangle },
        stopping: { color: "text-orange-400 bg-orange-500/10 border-orange-500/30", icon: Loader2 },
        terminated: { color: "text-red-600 bg-red-500/10 border-red-700/30", icon: XCircle },
    };
    const cfg = map[status] || map["stopped"];
    const Icon = cfg.icon;
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", cfg.color)}>
            <Icon className={cn("h-3 w-3", (status === "pending" || status === "stopping") && "animate-spin")} />
            {status}
        </span>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export function AwsOverview() {
    const { telemetry, socket, connectionState } = useSocket();
    const { mode } = useAppMode();
    const isLive = mode === "live" && connectionState === "live";

    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Resolve data
    const demo = useMemo(() => generateDemoData(), []);
    const instances: any[] = isLive && telemetry?.computeNodes ? telemetry.computeNodes : demo.instances;
    const volumes: any[] = isLive && telemetry?.storageArrays ? telemetry.storageArrays : demo.volumes;

    // ── Computed Summary ───────────────────────────────────────────────────
    const runningInstances = instances.filter((n: any) => n.status === "running");
    const stoppedInstances = instances.filter((n: any) => n.status === "stopped");
    const totalVolumeSizeGB = volumes.reduce((s: number, v: any) => s + (v.size || 0), 0);
    const uniqueRegions = [...new Set(instances.map((n: any) => n.region))];

    const services = [
        {
            name: "Amazon EC2",
            icon: Server,
            resourceCount: instances.length,
            running: runningInstances.length,
            stopped: stoppedInstances.length,
        },
        {
            name: "Amazon EBS",
            icon: HardDrive,
            resourceCount: volumes.length,
            running: volumes.filter((v: any) => v.state === "in-use").length,
            stopped: volumes.filter((v: any) => v.state !== "in-use").length,
        },
    ];

    // ── Handlers ───────────────────────────────────────────────────────────
    const handleAction = (action: "start" | "stop", nodeId: string, instanceId: string, region: string) => {
        if (!socket || !isLive) return;
        setActionLoading(nodeId);
        const event = action === "start" ? "start_ec2_node" : "stop_ec2_node";
        socket.emit(event, { instanceId, region }, (res: any) => {
            setActionLoading(null);
            if (res.status === "error") {
                alert(`Action failed: ${res.message}`);
            }
        });
    };

    return (
        <div className="flex h-full flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                        <Cloud className="h-5 w-5 text-sky-400" />
                        AWS Resource Overview
                    </h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">
                        {isLive ? "Live Account Inventory" : "Demo Simulation"}
                    </p>
                </div>
                {!isLive && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-400 uppercase tracking-widest">
                        Demo Mode
                    </span>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <SummaryCard label="Active Services" value={services.filter(s => s.resourceCount > 0).length.toString()} icon={Boxes} color="text-sky-400" />
                <SummaryCard label="Total Resources" value={(instances.length + volumes.length).toString()} icon={Activity} color="text-emerald-400" />
                <SummaryCard label="Running Now" value={runningInstances.length.toString()} icon={Play} color="text-green-400" />
                <SummaryCard label="Regions Used" value={uniqueRegions.length.toString()} icon={RefreshCw} color="text-purple-400" />
            </div>

            {/* Service Breakdown */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {services.map(svc => (
                    <div key={svc.name} className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <svc.icon className="h-4 w-4 text-sky-400" />
                            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">{svc.name}</h3>
                        </div>
                        <div className="flex gap-6 text-xs text-zinc-400">
                            <span>Total: <strong className="text-zinc-200">{svc.resourceCount}</strong></span>
                            <span>Running: <strong className="text-emerald-400">{svc.running}</strong></span>
                            <span>Stopped: <strong className="text-zinc-500">{svc.stopped}</strong></span>
                        </div>
                    </div>
                ))}
            </div>

            {/* EC2 Instances Table */}
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 flex-1">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                        <Server className="h-4 w-4 text-sky-400" />
                        EC2 Instances ({instances.length})
                    </h3>
                    {isLive && (
                        <span className="text-[10px] text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                        </span>
                    )}
                </div>
                <div className="overflow-auto max-h-[350px]">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-zinc-800/50 text-[10px] uppercase tracking-widest text-zinc-500">
                                <th className="py-2 px-3 font-medium">Name</th>
                                <th className="py-2 px-3 font-medium">Instance ID</th>
                                <th className="py-2 px-3 font-medium">Type</th>
                                <th className="py-2 px-3 font-medium">Region</th>
                                <th className="py-2 px-3 font-medium">Status</th>
                                <th className="py-2 px-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {instances.map((node: any) => (
                                <tr key={node.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                                    <td className="py-2.5 px-3 text-zinc-200 font-medium">{node.name || "—"}</td>
                                    <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">{node.id}</td>
                                    <td className="py-2.5 px-3 text-zinc-400">{node.type || "—"}</td>
                                    <td className="py-2.5 px-3 text-zinc-400">{node.region}</td>
                                    <td className="py-2.5 px-3"><StatusBadge status={node.status} /></td>
                                    <td className="py-2.5 px-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {node.status === "running" && (
                                                <button
                                                    onClick={() => handleAction("stop", node.id, node.instanceId || node.id, node.region)}
                                                    disabled={actionLoading === node.id || !isLive}
                                                    title={!isLive ? "Live Mode required" : "Stop this instance (billing will pause)"}
                                                    className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
                                                >
                                                    {actionLoading === node.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                                                    Stop
                                                </button>
                                            )}
                                            {node.status === "stopped" && (
                                                <button
                                                    onClick={() => handleAction("start", node.id, node.instanceId || node.id, node.region)}
                                                    disabled={actionLoading === node.id || !isLive}
                                                    title={!isLive ? "Live Mode required" : "Start this instance (billing will resume ~$0.01/hr for t3.micro)"}
                                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-40"
                                                >
                                                    {actionLoading === node.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                                    Start
                                                </button>
                                            )}
                                            {(node.status === "pending" || node.status === "stopping" || node.status === "shutting-down") && (
                                                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Transitioning…</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {instances.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-zinc-600 text-xs uppercase tracking-widest">
                                        No EC2 instances found in this account
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* EBS Volumes Table */}
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2 mb-4">
                    <HardDrive className="h-4 w-4 text-sky-400" />
                    EBS Volumes ({volumes.length}) — {totalVolumeSizeGB} GB Total
                </h3>
                <div className="overflow-auto max-h-[250px]">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-zinc-800/50 text-[10px] uppercase tracking-widest text-zinc-500">
                                <th className="py-2 px-3 font-medium">Volume ID</th>
                                <th className="py-2 px-3 font-medium">Size</th>
                                <th className="py-2 px-3 font-medium">Type</th>
                                <th className="py-2 px-3 font-medium">Region</th>
                                <th className="py-2 px-3 font-medium">State</th>
                                <th className="py-2 px-3 font-medium">Attached To</th>
                            </tr>
                        </thead>
                        <tbody>
                            {volumes.map((vol: any) => (
                                <tr key={vol.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                                    <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">{vol.id}</td>
                                    <td className="py-2.5 px-3 text-zinc-200 font-medium">{vol.size} GB</td>
                                    <td className="py-2.5 px-3 text-zinc-400">{vol.type || "gp3"}</td>
                                    <td className="py-2.5 px-3 text-zinc-400">{vol.region}</td>
                                    <td className="py-2.5 px-3"><StatusBadge status={vol.state === "in-use" ? "running" : "stopped"} /></td>
                                    <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">{vol.attachedTo || "—"}</td>
                                </tr>
                            ))}
                            {volumes.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-zinc-600 text-xs uppercase tracking-widest">
                                        No EBS volumes found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ── Summary Card Component ─────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
    return (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 flex items-center gap-3">
            <div className={cn("rounded-lg bg-zinc-800/50 p-2", color)}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-2xl font-bold text-zinc-100 font-mono">{value}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
            </div>
        </div>
    );
}
