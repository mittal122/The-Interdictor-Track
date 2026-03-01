import React, { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Shield, AlertTriangle, Filter, Search, Activity, FileText } from "lucide-react";
import { cn } from "../utils/cn";

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
    const allLogs = useMemo(() => generateLogs(500), []);
    const [severityFilter, setSeverityFilter] = useState<string>("ALL");
    const [typeFilter, setTypeFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState("");

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

    // Virtualized table
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: filteredLogs.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 44,
        overscan: 10,
    });

    return (
        <div className="flex h-full flex-col gap-4 overflow-hidden">
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
                                            className={cn(
                                                "absolute top-0 left-0 w-full grid grid-cols-[80px_160px_80px_70px_120px_90px_160px_70px_1fr] gap-2 px-3 py-2.5 text-xs font-mono border-l-2 border-b border-zinc-800/20 hover:bg-zinc-800/30 transition-colors items-center",
                                                severityColors[log.severity],
                                                virtualRow.index % 2 === 0 ? "bg-zinc-950/30" : "bg-zinc-900/10"
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
        </div>
    );
}
