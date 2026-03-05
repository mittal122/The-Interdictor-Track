import React, { useState, useEffect } from 'react';
import { FileCode, Download, X, Loader2, Copy, Check, File } from 'lucide-react';
import { cn } from '../utils/cn';
import { useSocket } from '../contexts/SocketContext';

interface TerraformFile {
    name: string;
    content: string;
}

interface TerraformData {
    files: TerraformFile[];
    resourceCount: number;
    supportedTypes: string[];
}

export function TerraformExportModal({ infraData, onClose }: { infraData: any; onClose: () => void }) {
    const { socket } = useSocket();
    const [tfData, setTfData] = useState<TerraformData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!socket || !infraData) return;
        setLoading(true);
        socket.emit('export_terraform', { infraData }, (res: any) => {
            setLoading(false);
            if (res.status === 'success') setTfData(res.data);
        });
    }, [socket, infraData]);

    const copyToClipboard = async () => {
        if (!tfData) return;
        const activeFile = tfData.files[activeTab];
        await navigator.clipboard.writeText(activeFile.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadFile = (file: TerraformFile) => {
        const blob = new Blob([file.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadAll = () => {
        if (!tfData) return;
        tfData.files.forEach(file => downloadFile(file));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-[900px] max-h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <FileCode className="h-5 w-5 text-emerald-400" />
                        <div>
                            <h3 className="text-sm font-bold text-zinc-100">Terraform Export</h3>
                            <p className="text-[10px] text-zinc-500">
                                {loading ? 'Generating...' : `${tfData?.resourceCount || 0} resources • ${tfData?.files.length || 0} files`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {tfData && (
                            <button
                                onClick={downloadAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 transition"
                            >
                                <Download className="h-3 w-3" /> Download All
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 transition">
                            <X className="h-4 w-4 text-zinc-500" />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center py-16">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                            <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Generating Terraform...</div>
                        </div>
                    </div>
                ) : tfData ? (
                    <>
                        {/* Supported Types */}
                        <div className="px-5 py-2 border-b border-zinc-800/50 flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Resources:</span>
                            {tfData.supportedTypes.map(t => (
                                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono uppercase">{t}</span>
                            ))}
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-zinc-800/50 px-5">
                            {tfData.files.map((file, i) => (
                                <button
                                    key={file.name}
                                    onClick={() => setActiveTab(i)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider border-b-2 transition",
                                        activeTab === i
                                            ? "text-emerald-400 border-emerald-400"
                                            : "text-zinc-500 border-transparent hover:text-zinc-300"
                                    )}
                                >
                                    <File className="h-3 w-3" /> {file.name}
                                </button>
                            ))}
                        </div>

                        {/* Code Preview */}
                        <div className="flex-1 overflow-auto relative">
                            {/* Copy Button */}
                            <button
                                onClick={copyToClipboard}
                                className="absolute top-3 right-5 flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 bg-zinc-800 text-[9px] font-mono text-zinc-400 hover:text-zinc-200 transition z-10"
                            >
                                {copied ? <><Check className="h-3 w-3 text-emerald-400" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
                            </button>

                            <pre className="p-5 text-xs font-mono text-zinc-300 leading-relaxed overflow-x-auto">
                                {tfData.files[activeTab]?.content || ''}
                            </pre>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-2 border-t border-zinc-800 text-[9px] text-zinc-600 flex justify-between">
                            <span>Generated by The Interdictor Track</span>
                            <span>Review and customize before applying</span>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center py-16 text-zinc-500 text-xs">
                        Failed to generate Terraform code
                    </div>
                )}
            </div>
        </div>
    );
}
