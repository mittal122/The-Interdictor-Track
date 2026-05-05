import React, { useState, useMemo, useCallback } from "react";
import {
    Trash2, AlertTriangle, Shield, HardDrive, CircleDot, Loader2, Cloud,
    ArrowLeft, RefreshCw, XCircle, CheckCircle2
} from "lucide-react";
import { RefreshButton } from "../components/RefreshButton";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAppMode } from "../contexts/AppModeContext";

export function AwsUnusedResources() {
    const { socket, connectionState } = useSocket();
    const { mode } = useAppMode();
    const isLive = mode === "live" && connectionState === "live";
    const navigate = useNavigate();

    const [infraData, setInfraData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const handleFetch = useCallback(() => {
        if (!socket || !isLive) return;
        setLoading(true);
        setError(null);
        socket.emit("fetch_full_account_map", (res: any) => {
            setLoading(false);
            if (res.status === "error") {
                setError(res.message);
            } else {
                setInfraData(res.data);
            }
        });
    }, [socket, isLive]);

    // Derived unused assets
    const unusedItems = useMemo(() => {
        if (!infraData) return [];
        return infraData.nodes.filter((n: any) => n.status === "orphan" || n.status === "idle");
    }, [infraData]);

    const handleDelete = (item: any) => {
        if (!socket || !isLive) return;

        // Safety prompt
        const confirmStr = window.prompt(`Type "DELETE" to confirm destroying ${item.name} (${item.id})`);
        if (confirmStr !== "DELETE") return;

        setActionLoading(item.id);
        socket.emit("delete_infrastructure_resource", { type: item.type, id: item.id, meta: item.meta, region: item.region }, (res: any) => {
            setActionLoading(null);
            if (res.status === "success") {
                handleFetch(); // Refresh list
            } else {
                alert(`Failed to delete: ${res.message}`);
            }
        });
    };

    return (
        <div className="flex h-full flex-col gap-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/aws-architecture")}
                        className="p-1.5 rounded bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-red-400" />
                            Unused Resources
                        </h2>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
                            Orphaned or Idle infrastructure safely isolated
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isLive && (
                        <button
                            onClick={handleFetch}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-sky-400 hover:bg-sky-500/20 transition disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            {loading ? "Scanning…" : "Scan Account"}
                        </button>
                    )}
                    {isLive && <RefreshButton onRefresh={handleFetch} />}
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400 relative">
                    <AlertTriangle className="h-4 w-4 inline mr-2 -mt-0.5" />
                    <span className="font-semibold text-sm">Scan Failed:</span> {error}
                </div>
            )}

            {!isLive ? (
                <div className="flex flex-col items-center justify-center p-12 mt-12 text-center max-w-lg mx-auto border border-amber-500/30 bg-amber-500/10 rounded-xl">
                    <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
                    <h3 className="text-lg font-bold text-amber-500 mb-2">Live Mode Required</h3>
                    <p className="text-zinc-400 text-sm">
                        Orphan detection and destructive actions are disabled in Demo mode. Please connect your AWS credentials and toggle Live Mode to locate unused resources.
                    </p>
                </div>
            ) : !infraData && !loading ? (
                <div className="flex flex-col items-center justify-center p-12 mt-12 text-center max-w-lg mx-auto border border-zinc-800/50 bg-zinc-900/30 rounded-xl">
                    <Cloud className="h-10 w-10 text-zinc-600 mb-4 opacity-50" />
                    <h3 className="text-lg font-bold text-zinc-300 mb-2">Ready to Scan</h3>
                    <p className="text-zinc-500 text-sm mb-6">
                        Click "Scan Account" above to detect orphaned EBS volumes, unused Elastic IPs, and idle Security Groups.
                    </p>
                </div>
            ) : unusedItems.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center p-12 mt-12 text-center max-w-lg mx-auto border border-emerald-500/30 bg-emerald-500/10 rounded-xl">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-4" />
                    <h3 className="text-lg font-bold text-emerald-500 mb-2">Account is Clean</h3>
                    <p className="text-emerald-400/80 text-sm">
                        No orphaned or idle resources were detected in this scan. You are highly optimized!
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {unusedItems.map((item: any) => (
                        <div key={item.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                <div className={cn(
                                    "p-2.5 rounded-lg shrink-0",
                                    item.status === 'orphan' ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                                )}>
                                    {item.type === 'ebs' ? <HardDrive className="h-5 w-5" /> : null}
                                    {item.type === 'sg' ? <Shield className="h-5 w-5" /> : null}
                                    {item.type === 'eip' ? <CircleDot className="h-5 w-5" /> : null}
                                    {['ebs', 'sg', 'eip'].indexOf(item.type) === -1 ? <XCircle className="h-5 w-5" /> : null}
                                </div>
                                <div className="min-w-0 flex-1 border-r border-zinc-800 pr-4">
                                    <h4 className="font-bold text-zinc-200 truncate" title={item.name}>{item.name}</h4>
                                    <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                                        <span className="text-zinc-400">{item.type}</span>
                                        <span>•</span>
                                        <span>{item.region}</span>
                                        <span>•</span>
                                        <span className={item.status === 'orphan' ? "text-red-400" : "text-blue-400"}>{item.status}</span>
                                    </div>
                                    <p className="mt-2 text-xs text-zinc-400 line-clamp-2">
                                        {item.type === 'ebs' && `Unattached Volume (${item.meta.size} GB ${item.meta.volumeType}). You are paying for provisioned IOPS and storage.`}
                                        {item.type === 'sg' && `Unused Security Group. Not attached to any instances or interfaces.`}
                                        {item.type === 'eip' && `Unassociated Elastic IP (${item.meta.publicIp}). AWS charges for EIPs that are not attached to a running instance.`}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                <button
                                    onClick={() => handleDelete(item)}
                                    disabled={actionLoading === item.id}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition font-bold tracking-wider text-[11px] disabled:opacity-50"
                                >
                                    {actionLoading === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    DELETE
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
