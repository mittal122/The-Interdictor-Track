import React, { useState } from "react";
import { Terminal, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";

export function CommandModule() {
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState<"idle" | "executing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const { socket } = useSocket();

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || status === "executing" || !socket) return;

    setStatus("executing");
    setMessage("Transmitting command...");

    socket.emit("execute_command", { command }, (response: any) => {
      if (response.status === "success") {
        setStatus("success");
        setMessage(response.message);
        setCommand("");
      } else {
        setStatus("error");
        setMessage(response.message || "Execution failed.");
      }

      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    });
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 border-b border-zinc-800/50 pb-3">
        <Terminal className="h-5 w-5 text-zinc-400" />
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
          Command Execution
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        <div className="rounded bg-zinc-950 p-3 text-xs text-zinc-400 font-mono">
          <p className="mb-2 text-zinc-500">System Ready. Awaiting input.</p>
          <p className="text-emerald-500/70">Connected to primary node.</p>
          {status !== "idle" && (
            <div
              className={cn(
                "mt-4 p-2 rounded border",
                status === "executing" && "border-zinc-700 text-zinc-300 bg-zinc-900",
                status === "success" && "border-emerald-900 text-emerald-400 bg-emerald-950/30",
                status === "error" && "border-red-900 text-red-400 bg-red-950/30"
              )}
            >
              <div className="flex items-center gap-2">
                {status === "executing" && <Activity className="h-3 w-3 animate-spin" />}
                {status === "success" && <CheckCircle2 className="h-3 w-3" />}
                {status === "error" && <AlertCircle className="h-3 w-3" />}
                <span>{message}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleExecute} className="mt-auto flex flex-col gap-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <span className="text-zinc-500 font-mono text-sm">{">"}</span>
          </div>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter system command..."
            className="block w-full rounded-md border border-zinc-700 bg-zinc-950 py-2 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono"
            disabled={status === "executing"}
          />
        </div>
        
        <div className="relative group">
          <button
            type="submit"
            disabled={!command.trim() || status === "executing"}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
          >
            <Send className="h-4 w-4" />
            Execute
          </button>
          
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-64 rounded bg-zinc-800 p-2 text-xs text-zinc-300 shadow-lg group-hover:block border border-zinc-700 z-10">
            <div className="font-semibold text-zinc-100 mb-1 uppercase tracking-wider">Warning</div>
            This action will simulate a command execution on the primary node. Use 'fail' in the command to simulate an error.
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800"></div>
          </div>
        </div>
      </form>
    </div>
  );
}

function Activity(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}
