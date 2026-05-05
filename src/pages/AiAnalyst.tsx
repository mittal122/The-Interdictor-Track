import React, { useState, useRef, useEffect } from "react";
import { Brain, Send, Loader2, Sparkles, User, RotateCcw, Zap, MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";
import { useCredentials } from "../contexts/CredentialsContext";
import { v4 as uuidv4 } from "uuid";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
    latencyMs?: number;
    isSimulated?: boolean;
    timestamp: Date | string; // Allow string from localStorage
}

interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    updatedAt: number;
}

// ── Example Prompts ──────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
    { label: "Security Risks", text: "What are my biggest security risks right now?", icon: "🔐" },
    { label: "Orphaned Resources", text: "Which resources are idle?", icon: "🗑️" },
    { label: "Cost Savings", text: "How can I reduce my AWS costs?", icon: "💰" },
    { label: "Health Report", text: "What is the current infrastructure health?", icon: "🏥" },
];

// ── Markdown-like renderer ───────────────────────────────────────────────────

function RenderContent({ text }: { text: string }) {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;

    // Helper: format inline markdown (bold, italic, inline code, links)
    const fmt = (s: string): string => {
        return s
            .replace(/`([^`]+)`/g, '<code style="background:rgba(139,92,246,0.15);padding:1px 5px;border-radius:4px;font-size:0.7rem;color:#c4b5fd;font-family:monospace">$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e9d5ff">$1</strong>')
            .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#a78bfa;text-decoration:underline">$1</a>');
    };

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // ── Code blocks ───────────────────────────────────────────
        if (trimmed.startsWith("```")) {
            const lang = trimmed.slice(3).trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith("```")) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing ```
            elements.push(
                <div key={`code-${i}`} style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)', padding: '12px 14px', margin: '8px 0', overflowX: 'auto' }}>
                    {lang && <div style={{ fontSize: '0.6rem', color: '#8b5cf6', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>{lang}</div>}
                    <pre style={{ margin: 0, fontSize: '0.7rem', lineHeight: 1.5, color: '#e2e8f0', fontFamily: "'Fira Code', 'Cascadia Code', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
                        {codeLines.join('\n')}
                    </pre>
                </div>
            );
            continue;
        }

        // ── Horizontal Rule ───────────────────────────────────────
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
            elements.push(
                <hr key={`hr-${i}`} style={{ border: 'none', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.4), transparent)', margin: '12px 0' }} />
            );
            i++;
            continue;
        }

        // ── Blockquote / Callout boxes ────────────────────────────
        if (trimmed.startsWith("> ")) {
            const quoteLines: string[] = [];
            while (i < lines.length && (lines[i].trim().startsWith("> ") || lines[i].trim() === ">")) {
                quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
                i++;
            }
            // Detect callout type
            const content = quoteLines.join('\n');
            let borderColor = 'rgba(139,92,246,0.5)';
            let bgColor = 'rgba(139,92,246,0.06)';
            let icon = '💡';
            if (content.toLowerCase().includes('warning') || content.toLowerCase().includes('⚠')) {
                borderColor = 'rgba(234,179,8,0.5)'; bgColor = 'rgba(234,179,8,0.06)'; icon = '⚠️';
            } else if (content.toLowerCase().includes('error') || content.toLowerCase().includes('🔴')) {
                borderColor = 'rgba(239,68,68,0.5)'; bgColor = 'rgba(239,68,68,0.06)'; icon = '🔴';
            } else if (content.toLowerCase().includes('success') || content.toLowerCase().includes('✅') || content.toLowerCase().includes('🟢')) {
                borderColor = 'rgba(34,197,94,0.5)'; bgColor = 'rgba(34,197,94,0.06)'; icon = '✅';
            } else if (content.toLowerCase().includes('info') || content.toLowerCase().includes('ℹ')) {
                borderColor = 'rgba(59,130,246,0.5)'; bgColor = 'rgba(59,130,246,0.06)'; icon = 'ℹ️';
            }
            elements.push(
                <div key={`quote-${i}`} style={{
                    borderLeft: `3px solid ${borderColor}`, background: bgColor,
                    borderRadius: '0 8px 8px 0', padding: '10px 14px', margin: '8px 0',
                }}>
                    {quoteLines.map((ql, qi) => (
                        <p key={qi} style={{ fontSize: '0.75rem', lineHeight: 1.6, color: '#d1d5db', margin: '2px 0' }}
                           dangerouslySetInnerHTML={{ __html: fmt(ql) }} />
                    ))}
                </div>
            );
            continue;
        }

        // ── Table detection ───────────────────────────────────────
        if (trimmed.includes('|') && trimmed.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i].trim());
                i++;
            }
            // Filter separator row
            const rows = tableLines.filter(r => !r.match(/^\|[\s\-:|]+\|$/));
            const headerCells = rows[0]?.split('|').filter(c => c.trim()) || [];
            const bodyRows = rows.slice(1);
            elements.push(
                <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '8px 0', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(139,92,246,0.12)' }}>
                                {headerCells.map((cell, ci) => (
                                    <th key={ci} style={{ padding: '8px 12px', textAlign: 'left', color: '#c4b5fd', fontWeight: 600, borderBottom: '1px solid rgba(139,92,246,0.2)' }}
                                        dangerouslySetInnerHTML={{ __html: fmt(cell.trim()) }} />
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {bodyRows.map((row, ri) => {
                                const cells = row.split('|').filter(c => c.trim());
                                return (
                                    <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(139,92,246,0.04)' }}>
                                        {cells.map((cell, ci) => (
                                            <td key={ci} style={{ padding: '6px 12px', color: '#d1d5db', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                                dangerouslySetInnerHTML={{ __html: fmt(cell.trim()) }} />
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        // ── Headers ───────────────────────────────────────────────
        if (trimmed.startsWith("#### ")) {
            elements.push(<p key={`h4-${i}`} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c4b5fd', marginTop: '14px', marginBottom: '4px' }}>{trimmed.slice(5)}</p>);
            i++; continue;
        }
        if (trimmed.startsWith("### ")) {
            elements.push(
                <div key={`h3-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '16px', marginBottom: '6px' }}>
                    <div style={{ width: '3px', height: '14px', background: 'linear-gradient(180deg, #8b5cf6, #6d28d9)', borderRadius: '2px' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e9d5ff' }}>{trimmed.slice(4)}</span>
                </div>
            );
            i++; continue;
        }
        if (trimmed.startsWith("## ")) {
            elements.push(
                <div key={`h2-${i}`} style={{ marginTop: '18px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(139,92,246,0.2)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e9d5ff', letterSpacing: '0.02em' }} dangerouslySetInnerHTML={{ __html: fmt(trimmed.slice(3)) }} />
                </div>
            );
            i++; continue;
        }
        if (trimmed.startsWith("# ")) {
            elements.push(
                <div key={`h1-${i}`} style={{ marginTop: '18px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid rgba(139,92,246,0.3)' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f5f3ff', letterSpacing: '0.02em' }} dangerouslySetInnerHTML={{ __html: fmt(trimmed.slice(2)) }} />
                </div>
            );
            i++; continue;
        }

        // ── Numbered list ─────────────────────────────────────────
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
            elements.push(
                <div key={`num-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px', paddingLeft: '4px' }}>
                    <span style={{
                        minWidth: '20px', height: '20px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(109,40,217,0.3))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 700, color: '#c4b5fd', flexShrink: 0
                    }}>{numMatch[1]}</span>
                    <span style={{ fontSize: '0.75rem', lineHeight: 1.6, color: '#d1d5db' }}
                          dangerouslySetInnerHTML={{ __html: fmt(numMatch[2]) }} />
                </div>
            );
            i++; continue;
        }

        // ── Indented sub-bullets (e.g. "  - item" or "   - item") ─
        const indentBulletMatch = trimmed.match(/^[-*]\s+(.*)/);
        const indent = line.length - line.trimStart().length;
        if (indentBulletMatch && indent >= 2) {
            elements.push(
                <div key={`sub-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '2px', paddingLeft: `${Math.min(indent, 6) * 8}px` }}>
                    <span style={{ color: '#7c3aed', marginTop: '4px', fontSize: '0.4rem', flexShrink: 0 }}>●</span>
                    <span style={{ fontSize: '0.72rem', lineHeight: 1.5, color: '#c7c7cc' }}
                          dangerouslySetInnerHTML={{ __html: fmt(indentBulletMatch[1]) }} />
                </div>
            );
            i++; continue;
        }

        // ── Top-level bullet ──────────────────────────────────────
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            elements.push(
                <div key={`bullet-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px', paddingLeft: '4px' }}>
                    <span style={{ color: '#8b5cf6', marginTop: '5px', fontSize: '0.35rem', flexShrink: 0 }}>◆</span>
                    <span style={{ fontSize: '0.75rem', lineHeight: 1.6, color: '#d1d5db' }}
                          dangerouslySetInnerHTML={{ __html: fmt(trimmed.slice(2)) }} />
                </div>
            );
            i++; continue;
        }

        // ── Standalone bold line (section label) ──────────────────
        if (trimmed.startsWith("**") && trimmed.endsWith("**") && !trimmed.slice(2, -2).includes("**")) {
            elements.push(
                <p key={`bold-${i}`} style={{
                    fontSize: '0.8rem', fontWeight: 700, color: '#c4b5fd',
                    marginTop: '14px', marginBottom: '4px',
                    background: 'linear-gradient(90deg, rgba(139,92,246,0.08), transparent)',
                    padding: '4px 8px', borderRadius: '4px'
                }}>{trimmed.replace(/\*\*(.*?)\*\*/g, "$1")}</p>
            );
            i++; continue;
        }

        // ── Empty line ────────────────────────────────────────────
        if (trimmed === '') {
            elements.push(<div key={`space-${i}`} style={{ height: '6px' }} />);
            i++; continue;
        }

        // ── Regular paragraph ─────────────────────────────────────
        elements.push(
            <p key={`p-${i}`} style={{ fontSize: '0.75rem', lineHeight: 1.7, color: '#d1d5db', marginTop: '3px' }}
               dangerouslySetInnerHTML={{ __html: fmt(trimmed) }} />
        );
        i++;
    }

    return <div>{elements}</div>;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AiAnalyst() {
    const { telemetry } = useSocket();
    const { token, logout } = useAuth();
    const { credentials } = useCredentials();

    // Session State
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Chat State
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem("aria_chat_sessions");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setSessions(parsed);
                if (parsed.length > 0) {
                    setCurrentSessionId(parsed[0].id);
                } else {
                    createNewSession();
                }
            } catch (e) {
                createNewSession();
            }
        } else {
            createNewSession();
        }
    }, []);

    // Save to localStorage when sessions change
    useEffect(() => {
        if (sessions.length > 0) {
            localStorage.setItem("aria_chat_sessions", JSON.stringify(sessions));
        }
    }, [sessions]);

    // Derived state
    const currentSession = sessions.find(s => s.id === currentSessionId);
    const messages = currentSession?.messages || [];
    const isEmpty = messages.length === 0;

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    // ── Session Management ──

    const createNewSession = () => {
        const newSession: ChatSession = {
            id: uuidv4(),
            title: "New Analysis",
            messages: [],
            updatedAt: Date.now()
        };
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        setError(null);
        inputRef.current?.focus();
    };

    const deleteSession = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSessions(prev => prev.filter(s => s.id !== id));
        if (currentSessionId === id) {
            const remaining = sessions.filter(s => s.id !== id);
            if (remaining.length > 0) {
                setCurrentSessionId(remaining[0].id);
            } else {
                createNewSession();
            }
        }
    };

    const updateSessionMessages = (id: string, newMessages: ChatMessage[], newTitle?: string) => {
        setSessions(prev => prev.map(s => {
            if (s.id === id) {
                return {
                    ...s,
                    messages: newMessages,
                    title: newTitle || s.title,
                    updatedAt: Date.now()
                };
            }
            return s;
        }).sort((a, b) => b.updatedAt - a.updatedAt));
    };

    // ── Telemetry Payload ──

    const buildTelemetrySnapshot = () => {
        if (!telemetry) return undefined;
        const nodes = telemetry.computeNodes || [];
        const onlineNodes = nodes.filter((n: any) => n.status === "running");
        const offlineNodes = nodes.filter((n: any) => n.status !== "running");
        return {
            globalHealth: telemetry.globalHealth ?? 95,
            networkLatency: telemetry.networkLatency ?? 30,
            cpuUsage: telemetry.cpuUsage ?? 45,
            memoryUsage: telemetry.memoryUsage ?? 55,
            activeAnomalies: telemetry.anomalies?.length ?? 0,
            onlineNodesCount: onlineNodes.length,
            offlineNodesCount: offlineNodes.length,
            totalNodesCount: nodes.length,
            nodes: nodes.map((n: any) => ({
                id: n.id,
                name: n.name,
                type: n.type,
                region: n.region,
                status: n.status
            })),
            storage: (telemetry.storageArrays || []).map((s: any) => ({
                id: s.id,
                name: s.name,
                status: s.status,
                sizeGB: s.sizeGB
            }))
        };
    };

    // ── Chat Logic ──

    const sendMessage = async (userText: string) => {
        if (!currentSessionId) return;
        const trimmed = userText.trim();
        if (!trimmed || isTyping) return;

        setError(null);

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            content: trimmed,
            timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...messages, userMsg];

        // Auto-generate title
        let newTitle = currentSession?.title;
        if (messages.length === 0) {
            newTitle = trimmed.slice(0, 30) + (trimmed.length > 30 ? "..." : "");
        }

        updateSessionMessages(currentSessionId, updatedMessages, newTitle);
        setInput("");
        setIsTyping(true);

        const apiMessages = updatedMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

        try {
            const res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    messages: apiMessages,
                    telemetrySnapshot: buildTelemetrySnapshot(),
                    // Pass cloud credentials so the backend can fetch the full InfraMap
                    cloudCredentials: credentials ? {
                        awsAccessKeyId: credentials.awsAccessKeyId,
                        awsSecretKey: credentials.awsSecretKey,
                        awsRegion: credentials.awsRegion,
                    } : null,
                }),
            });

            if (res.status === 401) { logout(); return; }
            if (!res.ok) {
                let errMsg = "Server error occurred.";
                try {
                    const errBody = await res.json();
                    errMsg = errBody.message || errMsg;
                } catch { }
                throw new Error(errMsg);
            }

            const data = await res.json();

            const ariaMsg: ChatMessage = {
                id: `a-${Date.now()}`,
                role: "assistant",
                content: data.reply,
                model: data.model,
                latencyMs: data.latencyMs,
                isSimulated: data.isSimulated,
                timestamp: new Date().toISOString(),
            };

            updateSessionMessages(currentSessionId, [...updatedMessages, ariaMsg]);
        } catch (err: any) {
            setError(err.message || "Chat failed. Please try again.");
            updateSessionMessages(currentSessionId, updatedMessages);
        } finally {
            setIsTyping(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const clearChat = () => {
        if (currentSessionId) {
            updateSessionMessages(currentSessionId, [], "New Analysis");
        }
        setError(null);
        inputRef.current?.focus();
    };

    const formatTime = (isoString: string | Date) => {
        try {
            const d = new Date(isoString);
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    };

    return (
        <div className="flex h-full overflow-hidden bg-zinc-950 font-mono text-zinc-100 relative pt-1 border-t border-zinc-800">

            {/* ── Settings / History Sidebar ── */}
            <div className={cn(
                "flex flex-col border-r border-zinc-800/50 bg-zinc-900/40 transition-all duration-300 ease-in-out z-10 shrink-0",
                isSidebarOpen ? "w-64 opacity-100" : "w-0 opacity-0 overflow-hidden border-none"
            )}>
                <div className="p-4 border-b border-zinc-800/50 shrink-0">
                    <button
                        onClick={createNewSession}
                        className="flex w-full items-center justify-center gap-2 rounded bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors shadow-lg shadow-violet-500/10 cursor-pointer"
                    >
                        <Plus className="h-4 w-4" />
                        New Analysis
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800 p-2 space-y-1 content-start">
                    <p className="px-2 py-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold hidden sm:block">History</p>
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => setCurrentSessionId(session.id)}
                            className={cn(
                                "group flex items-center justify-between rounded px-3 py-2 cursor-pointer transition-colors text-xs",
                                currentSessionId === session.id
                                    ? "bg-violet-500/20 text-violet-200 border border-violet-500/30"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                            )}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                <span className="truncate">{session.title}</span>
                            </div>
                            <button
                                onClick={(e) => deleteSession(session.id, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                    {sessions.length === 0 && (
                        <p className="text-xs text-zinc-600 px-3 italic">No history yet.</p>
                    )}
                </div>
            </div>

            {/* ── Main Chat Area ── */}
            <div className="flex-1 flex flex-col min-w-0 pr-2 pl-3 h-full pb-4">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/50 py-3 shrink-0 mb-3 relative -ml-3 pl-3 pr-2">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="mr-3 p-1.5 rounded-lg bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
                    >
                        {isSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>

                    <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
                            <Brain className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold tracking-tight text-zinc-100">ARIA</h2>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider hidden sm:block">Automated Response Analyst</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {messages.length > 0 && (
                            <button
                                onClick={clearChat}
                                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded border border-zinc-700/50 bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all text-[10px] uppercase tracking-widest font-bold cursor-pointer"
                            >
                                <RotateCcw className="h-3 w-3" />
                                Clear
                            </button>
                        )}
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-violet-800/50 bg-violet-950/30">
                            <Sparkles className="h-3 w-3 text-violet-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">NIM API</span>
                        </div>
                    </div>
                </div>

                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-700/50 space-y-5 px-1 md:px-4 pb-4">
                    {isEmpty && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-8">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-700/30 flex items-center justify-center">
                                    <Brain className="h-8 w-8 text-violet-400 opacity-70" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-950 animate-pulse" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-zinc-300">Ask ARIA anything about your infrastructure</p>
                                <p className="text-xs text-zinc-600 mt-1">AI-powered analytics with your live AWS telemetry</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 w-full max-w-2xl pt-4">
                                {EXAMPLE_PROMPTS.map((prompt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(prompt.text)}
                                        className="flex flex-col items-start gap-1.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 text-left hover:border-violet-700/50 hover:bg-violet-950/20 hover:text-zinc-200 transition-all group cursor-pointer"
                                    >
                                        <div className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors uppercase tracking-widest break-words w-full flex items-center gap-2"><span className="text-base">{prompt.icon}</span> {prompt.label}</div>
                                        <div className="text-[10px] text-zinc-500 leading-snug break-words w-full mt-1.5">{prompt.text}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map(msg => (
                        <div key={msg.id} className={cn("flex items-start gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                            {msg.role === "assistant" ? (
                                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-900 border border-violet-800/40 shrink-0 mt-1">
                                    <Brain className="h-4 w-4 text-violet-400" />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 shrink-0 mt-1">
                                    <User className="h-4 w-4 text-zinc-400" />
                                </div>
                            )}

                            <div className={cn("flex flex-col gap-1 w-[85%] max-w-3xl", msg.role === "user" ? "items-end" : "items-start")}>
                                <div className={cn(
                                    "px-4 py-3 rounded-2xl w-full text-xs sm:text-sm",
                                    msg.role === "user"
                                        ? "bg-zinc-800/80 text-zinc-200 rounded-tr-sm border border-zinc-700/50"
                                        : "bg-transparent text-zinc-200"
                                )}>
                                    {msg.role === "assistant" ? (
                                        <RenderContent text={msg.content} />
                                    ) : (
                                        <p className="leading-relaxed">{msg.content}</p>
                                    )}
                                </div>

                                <div className={cn("flex items-center gap-2 text-[10px] text-zinc-600 px-1 font-mono", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                                    <span>{formatTime(msg.timestamp)}</span>
                                    {msg.role === "assistant" && (
                                        <>
                                            <span>·</span>
                                            {msg.isSimulated ? (
                                                <span className="text-yellow-700 font-bold uppercase tracking-widest">Demo Mode</span>
                                            ) : (
                                                <>
                                                    <span className="text-emerald-700 uppercase">{msg.model || 'LLama 3.1 8B'}</span>
                                                    {msg.latencyMs && (
                                                        <>
                                                            <span>·</span>
                                                            <span>{msg.latencyMs}ms</span>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isTyping && (
                        <div className="flex items-start gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-900 border border-violet-800/40 shrink-0 mt-1">
                                <Brain className="h-4 w-4 text-violet-400" />
                            </div>
                            <div className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                    {[0, 1, 2].map(i => (
                                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-500/80" style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-500 max-w-2xl mx-auto w-full text-center mt-4">
                            Failed to connect. {error}
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-6" />
                </div>

                {/* Input Bar */}
                <div className="shrink-0 pt-2 bg-zinc-950 border-t border-zinc-800/50">
                    <div className="flex items-end gap-2 rounded-xl border border-zinc-700/50 bg-zinc-900/50 px-3 py-2.5 focus-within:border-violet-600/50 transition-colors shadow-lg">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask ARIA to analyze infrastructure... (Shift+Enter for new line)"
                            rows={1}
                            disabled={isTyping || !currentSessionId}
                            className="flex-1 resize-none bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none leading-relaxed max-h-32 overflow-y-auto disabled:opacity-50 py-1"
                            style={{ minHeight: "28px" }}
                            onInput={e => {
                                const el = e.currentTarget;
                                el.style.height = "auto";
                                el.style.height = Math.min(el.scrollHeight, 128) + "px";
                            }}
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isTyping || !currentSessionId}
                            className={cn(
                                "flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-all cursor-pointer",
                                input.trim() && !isTyping && currentSessionId
                                    ? "bg-violet-600 text-white hover:bg-violet-500 shadow-md shadow-violet-500/20 hover:-translate-y-0.5"
                                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                            )}
                        >
                            {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-0.5" />}
                        </button>
                    </div>
                </div>

            </div>

            <style>{`
                @keyframes bounce {
                    0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
                    40% { transform: translateY(-4px); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
