import React, { useState } from "react";
import { Brain, Activity, Zap, AlertTriangle, CheckCircle, ChevronRight, Loader2, Sparkles, Shield } from "lucide-react";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";

type AnalysisType = "incident" | "anomaly" | "capacity" | "security";

interface AnalysisResult {
    summary: string;
    severity: "low" | "medium" | "high" | "critical";
    recommendations: string[];
    estimatedImpact: string;
    model: string;
    latencyMs: number;
    isSimulated: boolean;
}

const ANALYSIS_OPTIONS: { type: AnalysisType; label: string; description: string; icon: React.ReactNode }[] = [
    { type: "incident", label: "Incident Report", description: "Full incident classification and timeline", icon: <AlertTriangle className="h-4 w-4" /> },
    { type: "anomaly", label: "Anomaly Analysis", description: "Detect and explain active anomaly patterns", icon: <Activity className="h-4 w-4" /> },
    { type: "capacity", label: "Capacity Forecast", description: "Predict resource headroom and scaling needs", icon: <Zap className="h-4 w-4" /> },
    { type: "security", label: "Security Audit", description: "Assess access logs for threats and vulnerabilities", icon: <Shield className="h-4 w-4" /> },
];

const SEVERITY_STYLES = {
    low: { bar: "bg-emerald-500", badge: "text-emerald-400 border-emerald-800/50 bg-emerald-950/30", label: "LOW" },
    medium: { bar: "bg-yellow-500", badge: "text-yellow-400 border-yellow-800/50 bg-yellow-950/30", label: "MEDIUM" },
    high: { bar: "bg-orange-500", badge: "text-orange-400 border-orange-800/50 bg-orange-950/30", label: "HIGH" },
    critical: { bar: "bg-red-500", badge: "text-red-400 border-red-800/50 bg-red-950/30", label: "CRITICAL" },
};

export function AiAnalyst() {
    const { telemetry } = useSocket();
    const { token } = useAuth();
    const [selectedType, setSelectedType] = useState<AnalysisType>("incident");
    const [customContext, setCustomContext] = useState("");
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!telemetry) return;
        setLoading(true);
        setError(null);
        setResult(null);

        const offlineNodes = telemetry.computeNodes
            ? telemetry.computeNodes.filter((n: any) => n.status === "offline").length
            : 0;

        try {
            const res = await fetch("/api/ai/analyze", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    analysisType: selectedType,
                    telemetrySnapshot: {
                        globalHealth: telemetry.globalHealth ?? 95,
                        networkLatency: telemetry.networkLatency ?? 30,
                        cpuUsage: telemetry.cpuUsage ?? 45,
                        memoryUsage: telemetry.memoryUsage ?? 55,
                        activeAnomalies: telemetry.anomalies?.length ?? 0,
                        offlineNodes,
                        totalNodes: (telemetry.computeNodes?.length ?? 32),
                        serverLoad: telemetry.serverLoad,
                    },
                    customContext: customContext || undefined,
                }),
            });

            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const data: AnalysisResult = await res.json();
            setResult(data);
        } catch (err: any) {
            setError(err.message || "Analysis failed");
        } finally {
            setLoading(false);
        }
    };

    const severityStyle = result ? SEVERITY_STYLES[result.severity] : null;

    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
                        <Brain className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">ARIA</h2>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider">Automated Response &amp; Incident Analyst · NVIDIA NIM</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-violet-800/50 bg-violet-950/30">
                    <Sparkles className="h-3 w-3 text-violet-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">NIM Powered</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                {/* Left: Controls */}
                <div className="flex flex-col gap-4">
                    {/* Analysis Type */}
                    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-3">Analysis Mode</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {ANALYSIS_OPTIONS.map(opt => (
                                <button
                                    key={opt.type}
                                    onClick={() => setSelectedType(opt.type)}
                                    className={cn(
                                        "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all cursor-pointer",
                                        selectedType === opt.type
                                            ? "border-violet-700/60 bg-violet-950/30 text-violet-300"
                                            : "border-zinc-700/40 bg-zinc-800/20 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                                    )}
                                >
                                    <div className={cn("shrink-0 mt-0.5", selectedType === opt.type ? "text-violet-400" : "text-zinc-500")}>
                                        {opt.icon}
                                    </div>
                                    <div>
                                        <div className="text-xs font-semibold">{opt.label}</div>
                                        <div className="text-[10px] text-zinc-500 mt-0.5 leading-snug">{opt.description}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Additional Context */}
                    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Additional Context (Optional)</h3>
                        <textarea
                            value={customContext}
                            onChange={e => setCustomContext(e.target.value)}
                            placeholder="e.g. 'Deployed new feature flag 20 minutes ago' or 'Region AP-South is undergoing maintenance'..."
                            rows={3}
                            className="w-full bg-zinc-950/80 border border-zinc-700/50 rounded-lg p-3 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-600/50 resize-none font-mono"
                        />
                    </div>

                    {/* Live Telemetry Preview */}
                    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-3">Live Snapshot</h3>
                        {telemetry ? (
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: "Health", value: `${telemetry.globalHealth?.toFixed(1)}%`, warn: telemetry.globalHealth < 90 },
                                    { label: "Latency", value: `${telemetry.networkLatency?.toFixed(0)}ms`, warn: telemetry.networkLatency > 100 },
                                    { label: "CPU", value: `${telemetry.cpuUsage?.toFixed(1)}%`, warn: telemetry.cpuUsage > 80 },
                                    { label: "Memory", value: `${telemetry.memoryUsage?.toFixed(1)}%`, warn: telemetry.memoryUsage > 80 },
                                    { label: "Anomalies", value: `${telemetry.anomalies?.length ?? 0}`, warn: telemetry.anomalies?.length > 0 },
                                    { label: "Region Load", value: `${Math.max(...(telemetry.serverLoad?.map((r: any) => r.load) ?? [0])).toFixed(0)}%`, warn: false },
                                ].map(item => (
                                    <div key={item.label} className="flex justify-between items-center py-1 border-b border-zinc-800/30">
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.label}</span>
                                        <span className={cn("text-xs font-mono font-semibold", item.warn ? "text-yellow-400" : "text-zinc-200")}>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-zinc-600 italic">Awaiting telemetry data…</p>
                        )}
                    </div>

                    {/* Trigger Button */}
                    <button
                        onClick={handleAnalyze}
                        disabled={loading || !telemetry}
                        className={cn(
                            "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold uppercase tracking-widest transition-all",
                            loading || !telemetry
                                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:-translate-y-0.5"
                        )}
                    >
                        {loading ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
                        ) : (
                            <><Brain className="h-4 w-4" /> Run Analysis</>
                        )}
                    </button>

                    {error && (
                        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
                            ⚠️ {error}
                        </div>
                    )}
                </div>

                {/* Right: Result Panel */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-4 flex flex-col">
                    {!result && !loading && (
                        <div className="flex flex-col items-center justify-center h-full text-center text-zinc-700 gap-3 py-12">
                            <Brain className="h-14 w-14 opacity-20" />
                            <p className="text-sm uppercase tracking-widest font-medium">Select an analysis mode</p>
                            <p className="text-xs text-zinc-600 max-w-[240px]">ARIA will analyze current telemetry using NVIDIA NIM AI and generate a detailed incident report.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full border-2 border-violet-700/30 flex items-center justify-center">
                                    <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-500 animate-pulse" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm text-violet-300 font-medium">ARIA is analyzing…</p>
                                <p className="text-xs text-zinc-600 mt-1">Running inference via NVIDIA NIM</p>
                            </div>
                        </div>
                    )}

                    {result && severityStyle && (
                        <div className="flex flex-col gap-4 h-full">
                            {/* Severity Badge */}
                            <div className="flex items-center justify-between">
                                <span className={cn("text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-widest", severityStyle.badge)}>
                                    {severityStyle.label} Severity
                                </span>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                                    {result.isSimulated ? (
                                        <span className="text-yellow-600">Simulation Mode</span>
                                    ) : (
                                        <>
                                            <span className="text-emerald-600">{result.model}</span>
                                            <span>·</span>
                                            <span>{result.latencyMs}ms</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className={cn("h-0.5 w-full rounded", severityStyle.bar, "opacity-50")} />

                            {/* Summary */}
                            <div>
                                <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Analysis Summary</h4>
                                <p className="text-sm text-zinc-200 leading-relaxed">{result.summary}</p>
                            </div>

                            {/* Recommendations */}
                            <div>
                                <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Recommended Actions</h4>
                                <div className="space-y-2">
                                    {result.recommendations.map((rec, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-950/50 border border-violet-700/40 shrink-0 mt-0.5">
                                                <span className="text-[9px] font-bold text-violet-400">{i + 1}</span>
                                            </div>
                                            <p className="text-xs text-zinc-300 leading-snug">{rec}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Estimated Impact */}
                            <div className="mt-auto rounded-lg border border-zinc-800/40 bg-zinc-950/50 p-3">
                                <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Estimated Impact</h4>
                                <p className="text-xs text-zinc-400">{result.estimatedImpact}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
