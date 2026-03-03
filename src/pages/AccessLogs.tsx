import React, { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Shield, AlertTriangle, Filter, Search, Activity, FileText, X } from "lucide-react";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAppMode } from "../contexts/AppModeContext";

// --- Types ---
interface LogEntry {
    id: string;
    timestamp: string;
    eventType: "AUTH" | "SYSTEM" | "NETWORK" | "SECURITY";
    severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
    sourceIp: string;
    user: string;
    action: string;
    status: "SUCCESS" | "FAILURE" | "BLOCKED";
    details: string;
    rawJson?: string;
}

// --- Data Generator ---
const ACTIONS = {
    AUTH: ["LOGIN_ATTEMPT", "LOGOUT", "TOKEN_REFRESH", "PASSWORD_CHANGE", "2FA_VERIFY", "SESSION_EXPIRE"],
    SYSTEM: ["SERVICE_RESTART", "CONFIG_CHANGE", "BACKUP_RUN", "DISK_ALERT", "CPU_SPIKE", "MEMORY_WARN"],
    NETWORK: ["FIREWALL_RULE", "PORT_SCAN_DETECTED", "DNS_RESOLVE_FAIL", "SSL_CERT_EXPIRE", "LATENCY_SPIKE", "PACKET_LOSS"],
    SECURITY: ["BRUTE_FORCE_DETECT", "UNAUTHORIZED_ACCESS", "MALWARE_SCAN", "INTRUSION_DETECT", "PRIVILEGE_ESCALATION", "DATA_EXFIL_ATTEMPT"],
};

const USERS = ["admin", "viewer", "ops-bot", "ci-pipeline", "monitoring-svc", "unknown", "root", "deployer"];

function generateLogs(count: number): LogEntry[] {
    const logs: LogEntry[] = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const eventTypes = Object.keys(ACTIONS) as LogEntry["eventType"][];
        const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        const actions = ACTIONS[eventType];
        const action = actions[Math.floor(Math.random() * actions.length)];

        const severityRoll = Math.random();
        const severity: LogEntry["severity"] = severityRoll > 0.92 ? "CRITICAL" : severityRoll > 0.8 ? "ERROR" : severityRoll > 0.6 ? "WARN" : "INFO";

        const statusRoll = Math.random();
        const status: LogEntry["status"] = severity === "CRITICAL" ? "BLOCKED" : statusRoll > 0.8 ? "FAILURE" : "SUCCESS";

        const ts = new Date(now - i * (30000 + Math.random() * 60000));

        logs.push({
            id: `LOG-${String(count - i).padStart(5, "0")}`,
            timestamp: ts.toISOString().replace("T", " ").split(".")[0],
            eventType,
            severity,
            sourceIp: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
            user: USERS[Math.floor(Math.random() * USERS.length)],
            action,
            status,
            details: `${action.toLowerCase().replace(/_/g, " ")} from ${eventType.toLowerCase()} subsystem`,
            rawJson: JSON.stringify({
                eventSource: `${eventType.toLowerCase()}.amazonaws.com`,
                eventName: action,
                sourceIPAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
                userAgent: "Simulated-App-Driver/1.0",
                requestParameters: {
                    resourceId: `res-${Math.floor(Math.random() * 99999)}`,
                    environment: "production"
                },
                responseElements: status === "SUCCESS" ? { status: "OK" } : { error: "AccessDenied" }
            }, null, 2)
        });
    }
    return logs;
}

const severityColors: Record<string, string> = {
    INFO: "border-l-blue-500/60",
    WARN: "border-l-yellow-500/60",
    ERROR: "border-l-orange-500/60",
    CRITICAL: "border-l-red-500/80",
};

const severityBadge: Record<string, string> = {
    INFO: "bg-blue-950/50 text-blue-400 border-blue-800/30",
    WARN: "bg-yellow-950/50 text-yellow-400 border-yellow-800/30",
    ERROR: "bg-orange-950/50 text-orange-400 border-orange-800/30",
    CRITICAL: "bg-red-950/50 text-red-400 border-red-800/30",
};

const statusBadge: Record<string, string> = {
    SUCCESS: "text-emerald-400",
    FAILURE: "text-red-400",
    BLOCKED: "text-red-500 font-bold",
};

export function AccessLogs() {
    const { mode } = useAppMode();
    const { telemetry } = useSocket();
    const [simulatedLogs] = useState<LogEntry[]>(() => generateLogs(500));

    const allLogs = useMemo(() => {
        if (mode === 'live') {
            return telemetry?.accessLogs || [];
        }
        return simulatedLogs;
    }, [mode, telemetry?.accessLogs, simulatedLogs]);

    const [severityFilter, setSeverityFilter] = useState<string>("ALL");
    const [typeFilter, setTypeFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

    const filteredLogs = useMemo(() => {
        return allLogs.filter(log => {
            if (severityFilter !== "ALL" && log.severity !== severityFilter) return false;
            if (typeFilter !== "ALL" && log.eventType !== typeFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return log.user.toLowerCase().includes(q) || log.sourceIp.includes(q) || log.action.toLowerCase().includes(q) || log.id.toLowerCase().includes(q);
            }
            return true;
        });
    }, [allLogs, severityFilter, typeFilter, searchQuery]);

    const stats = useMemo(() => ({
        total: filteredLogs.length,
        critical: filteredLogs.filter(l => l.severity === "CRITICAL").length,
        authFailures: filteredLogs.filter(l => l.eventType === "AUTH" && l.status === "FAILURE").length,
        blocked: filteredLogs.filter(l => l.status === "BLOCKED").length,
    }), [filteredLogs]);

    const chartData = useMemo(() => {
        const buckets = new Map<string, { time: string, INFO: number, WARN: number, ERROR: number, CRITICAL: number }>();

        // Sort logs chronologically (oldest first)
        const sorted = [...filteredLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        for (const log of sorted) {
            // "2026-03-03 10:45:12" -> "10:45"
            const timeKey = log.timestamp.split(" ")[1]?.substring(0, 5) || "00:00";
            if (!buckets.has(timeKey)) {
                buckets.set(timeKey, { time: timeKey, INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 });
            }
            buckets.get(timeKey)![log.severity]++;
        }

        return Array.from(buckets.values());
    }, [filteredLogs]);

    // Virtualized table
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: filteredLogs.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 44,
        overscan: 10,
    });

    const selectedLog = useMemo(() => filteredLogs.find(l => l.id === selectedLogId), [filteredLogs, selectedLogId]);

    const handleDownloadCSV = () => {
        if (filteredLogs.length === 0) return;

        const headers = ["ID", "Timestamp", "Event Type", "Severity", "Source IP", "User", "Action", "Status", "Details"];

        const csvRows = [headers.join(",")];
        for (const log of filteredLogs) {
            const row = [
                log.id,
                log.timestamp,
                log.eventType,
                log.severity,
                log.sourceIp,
                log.user,
                log.action,
                log.status,
                `"${log.details.replace(/"/g, '""')}"`
            ];
            csvRows.push(row.join(","));
        }

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `access-logs-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex h-full flex-col gap-4 overflow-hidden relative">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Access Logs</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Forensic Event Visualization</p>
                </div>
                <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-400" />
                    <span className="text-xs font-medium uppercase tracking-widest text-blue-400">{stats.total} Events</span>
                </div>
            </div>

            {/* Activity Trends Chart */}
            {chartData.length > 0 && (
                <div className="h-40 shrink-0 rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-4 pt-5 pb-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorInfo" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorWarn" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="time"
                                stroke="#52525b"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#52525b"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => Math.floor(val).toString()}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem', fontSize: '10px' }}
                                itemStyle={{ padding: 0 }}
                                labelStyle={{ color: '#a1a1aa', marginBottom: '0.25rem' }}
                            />
                            <Area type="monotone" dataKey="INFO" stackId="1" stroke="#3b82f6" fillOpacity={1} fill="url(#colorInfo)" />
                            <Area type="monotone" dataKey="WARN" stackId="1" stroke="#eab308" fillOpacity={1} fill="url(#colorWarn)" />
                            <Area type="monotone" dataKey="ERROR" stackId="1" stroke="#f97316" fillOpacity={1} fill="url(#colorError)" />
                            <Area type="monotone" dataKey="CRITICAL" stackId="1" stroke="#ef4444" fillOpacity={1} fill="url(#colorCritical)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search user, IP, action..."
                        className="rounded-md border border-zinc-700 bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono w-56"
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-zinc-500" />
                    <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[10px] text-zinc-300 uppercase tracking-wider focus:outline-none cursor-pointer">
                        <option value="ALL">All Severity</option>
                        <option value="INFO">Info</option>
                        <option value="WARN">Warn</option>
                        <option value="ERROR">Error</option>
                        <option value="CRITICAL">Critical</option>
                    </select>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[10px] text-zinc-300 uppercase tracking-wider focus:outline-none cursor-pointer">
                        <option value="ALL">All Types</option>
                        <option value="AUTH">Auth</option>
                        <option value="SYSTEM">System</option>
                        <option value="NETWORK">Network</option>
                        <option value="SECURITY">Security</option>
                    </select>
                </div>
                {/* Stats pills */}
                <div className="ml-auto flex items-center gap-2 text-[10px]">
                    <button
                        onClick={handleDownloadCSV}
                        className="flex shrink-0 items-center justify-center gap-1.5 rounded cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-zinc-300 transition-colors uppercase tracking-widest font-semibold border border-zinc-700 hover:text-white mr-2"
                    >
                        <FileText className="h-3 w-3" />
                        Export CSV
                    </button>
                    <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-400">{stats.total} total</span>
                    {stats.critical > 0 && <span className="rounded bg-red-950/50 px-2 py-1 text-red-400 border border-red-900/30">{stats.critical} critical</span>}
                    {stats.authFailures > 0 && <span className="rounded bg-yellow-950/50 px-2 py-1 text-yellow-400 border border-yellow-900/30">{stats.authFailures} auth failures</span>}
                    {stats.blocked > 0 && <span className="rounded bg-red-950/50 px-2 py-1 text-red-400 border border-red-900/30">{stats.blocked} blocked</span>}
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900/20 flex flex-col">
                <div className="overflow-x-auto h-full w-full">
                    <div className="min-w-[1000px] h-full flex flex-col">
                        {/* Table Header */}
                        <div className="grid grid-cols-[80px_160px_80px_70px_120px_90px_160px_70px_1fr] gap-2 px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800/50 shrink-0 bg-zinc-900/80 sticky top-0 z-10">
                            <span>ID</span>
                            <span>Timestamp</span>
                            <span>Type</span>
                            <span>Severity</span>
                            <span>Source IP</span>
                            <span>User</span>
                            <span>Action</span>
                            <span>Status</span>
                            <span>Details</span>
                        </div>

                        {/* Virtualized Table Body */}
                        <div ref={parentRef} className="flex-1 overflow-y-auto relative">
                            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
                                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                    const log = filteredLogs[virtualRow.index];
                                    return (
                                        <div
                                            key={log.id}
                                            onClick={() => setSelectedLogId(log.id)}
                                            className={cn(
                                                "absolute top-0 left-0 w-full grid grid-cols-[80px_160px_80px_70px_120px_90px_160px_70px_1fr] gap-2 px-3 py-2.5 text-xs font-mono border-l-2 border-b border-zinc-800/20 hover:bg-zinc-800/50 cursor-pointer transition-colors items-center",
                                                severityColors[log.severity],
                                                virtualRow.index % 2 === 0 ? "bg-zinc-950/30" : "bg-zinc-900/10",
                                                selectedLogId === log.id && "bg-violet-900/30 outline-1 outline-violet-500/50 z-10"
                                            )}
                                            style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                                        >
                                            <span className="text-zinc-500 text-[10px]">{log.id}</span>
                                            <span className="text-zinc-400 text-[10px]">{log.timestamp}</span>
                                            <span className="text-zinc-300 text-[10px]">{log.eventType}</span>
                                            <span className={cn("text-[10px] rounded px-1.5 py-0.5 border text-center whitespace-nowrap", severityBadge[log.severity])}>{log.severity}</span>
                                            <span className="text-zinc-300 text-[10px]">{log.sourceIp}</span>
                                            <span className="text-zinc-300 text-[10px] truncate">{log.user}</span>
                                            <span className="text-zinc-200 text-[10px] truncate">{log.action}</span>
                                            <span className={cn("text-[10px] font-semibold", statusBadge[log.status])}>{log.status}</span>
                                            <span className="text-zinc-500 text-[10px] truncate">{log.details}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Slide-out Raw JSON View */}
            {selectedLog && (
                <div className="absolute top-0 right-0 h-full w-[450px] bg-zinc-950/95 backdrop-blur-md border-l border-zinc-700/50 shadow-2xl z-20 flex flex-col transform transition-transform animate-in slide-in-from-right-8 duration-200">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/80">
                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-violet-400" />
                            <h3 className="text-sm font-semibold text-zinc-200">Raw Event JSON</h3>
                        </div>
                        <button onClick={() => setSelectedLogId(null)} className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-4 border-b border-zinc-800/40 bg-zinc-900/30">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                                <span className="block text-zinc-500 uppercase tracking-widest text-[9px] mb-1">Event ID</span>
                                <span className="text-zinc-300 font-mono">{selectedLog.id}</span>
                            </div>
                            <div>
                                <span className="block text-zinc-500 uppercase tracking-widest text-[9px] mb-1">Timestamp</span>
                                <span className="text-zinc-300 font-mono">{selectedLog.timestamp}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                        <pre className="text-[11px] text-emerald-400/90 font-mono whitespace-pre-wrap leading-relaxed">
                            {selectedLog.rawJson || "{\n  \"message\": \"Raw payload not available\"\n}"}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
