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
    return (
        <div className="space-y-1">
            {lines.map((line, i) => {
                // Headers
                if (line.startsWith("### ")) return <p key={i} className="font-bold text-violet-300 text-sm mt-3 mb-1">{line.slice(4)}</p>;
                if (line.startsWith("## ")) return <p key={i} className="font-bold text-violet-300 text-sm mt-3 mb-1">{line.slice(3)}</p>;
                if (line.startsWith("# ")) return <p key={i} className="font-bold text-violet-200 text-sm mt-3 mb-1">{line.slice(2)}</p>;

                // Bold via **text**
                const boldReplaced = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

                // Bullet points
                if (line.startsWith("- ") || line.startsWith("* ")) {
                    return (
                        <div key={i} className="flex items-start gap-2 mt-1">
                            <span className="text-violet-400 mt-0.5 shrink-0">•</span>
                            <span className="text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: boldReplaced.slice(2) }} />
                        </div>
                    );
                }

                // Numbered list (e.g., "1. " or "**Step 1.**")
                const numMatch = line.match(/^(\d+\.|(?:.*?)(?:Step \d+|Step \d+\.).*?:?)\s+(.*)/);
                if (numMatch) {
                    return (
                        <div key={i} className="flex items-start gap-2 mt-2">
                            <span className="text-violet-400 font-bold text-xs shrink-0" dangerouslySetInnerHTML={{ __html: numMatch[1].replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                            <span className="text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: numMatch[2].replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                        </div>
                    );
                }

                // If the entire line is bold (like a sub-header)
                if (line.startsWith("**") && line.endsWith("**")) {
                    return <p key={i} className="font-bold text-violet-300 text-xs mt-3 mb-1">{line.replace(/\*\*(.*?)\*\*/g, "$1")}</p>;
                }

                if (line.trim() === "") return <div key={i} className="h-1" />;

                const formatted = boldReplaced.replace(/\*(.*?)\*/g, "<em>$1</em>");
                return <p key={i} className="text-xs leading-relaxed mt-1" dangerouslySetInnerHTML={{ __html: formatted }} />;
            })}
        </div>
    );
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
