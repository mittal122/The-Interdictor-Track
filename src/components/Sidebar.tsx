import React, { useState } from "react";
import { ChevronDown, ChevronRight, LayoutDashboard, Settings, ShieldAlert, Terminal, Activity, Database, Network, LogOut, Brain } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../utils/cn";
import { useAuth } from "../contexts/AuthContext";
import { useCredentials } from "../contexts/CredentialsContext";
import { useAppMode } from "../contexts/AppModeContext";

type NavItemType = {
  name: string;
  icon: React.ElementType;
  path?: string;
  children?: NavItemType[];
};

const navigation: NavItemType[] = [
  { name: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  {
    name: "Infrastructure",
    icon: Database,
    children: [
      { name: "Global Nodes", icon: Network, path: "/global-nodes" },
      { name: "Compute Clusters", icon: Server, path: "/compute-clusters" },
      { name: "Storage Arrays", icon: Database, path: "/storage-arrays" },
    ],
  },
  {
    name: "Security",
    icon: ShieldAlert,
    children: [
      { name: "Threat Map", icon: Activity, path: "/threat-map" },
      { name: "Access Logs", icon: Terminal, path: "/access-logs" },
    ],
  },
  { name: "System Config", icon: Settings, path: "/system-config" },
  { name: "ARIA AI Analyst", icon: Brain, path: "/ai-analyst" },
];

function Server(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></svg>;
}

export function Sidebar({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) {
  const [expanded, setExpanded] = useState<string[]>(["Infrastructure", "Security"]);
  const { logout } = useAuth();
  const { clearCredentials } = useCredentials();
  const { setMode } = useAppMode();

  const handleLogout = () => {
    clearCredentials();   // wipe transient AWS keys from memory
    setMode('demo');      // revert to safe demo mode
    logout();
  };

  const toggleExpand = (name: string) => {
    setExpanded((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300 ease-in-out shrink-0",
        isOpen ? "w-64" : "w-16"
      )}
    >
      <div className="flex h-12 items-center justify-between px-4 border-b border-zinc-800/50 shrink-0">
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-widest text-zinc-500 transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0 hidden"
          )}
        >
          Navigation
        </span>
        <button
          onClick={toggle}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <svg
            className={cn("h-4 w-4 transition-transform duration-300", !isOpen && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navigation.map((item) => (
            <NavItem
              key={item.name}
              item={item}
              isOpen={isOpen}
              isExpanded={expanded.includes(item.name)}
              onToggle={() => toggleExpand(item.name)}
            />
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-zinc-800/50 shrink-0">
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors text-zinc-400 hover:bg-zinc-800/50 hover:text-red-400",
            !isOpen && "justify-center px-0"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {isOpen && <span>Disconnect</span>}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  item,
  isOpen,
  isExpanded,
  onToggle,
  depth = 0,
}: {
  key?: React.Key;
  item: NavItemType;
  isOpen: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  depth?: number;
}) {
  const hasChildren = item.children && item.children.length > 0;
  const location = useLocation();
  const isActive = item.path ? location.pathname === item.path : false;

  const content = (
    <>
      <item.icon className={cn("h-4 w-4 shrink-0", depth > 0 && "h-3.5 w-3.5", isActive && "text-zinc-100")} />

      {isOpen && (
        <>
          <span className={cn("flex-1 text-left truncate", isActive && "text-zinc-100 font-semibold")}>{item.name}</span>
          {hasChildren && (
            <span className="shrink-0 text-zinc-500">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          )}
        </>
      )}
    </>
  );

  const className = cn(
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
    "hover:bg-zinc-800/50 hover:text-zinc-100",
    depth === 0 ? "text-zinc-300 font-medium" : "text-zinc-400",
    !isOpen && "justify-center px-0",
    isActive && "bg-zinc-800/50 text-zinc-100"
  );

  const style = { paddingLeft: isOpen && depth > 0 ? `${depth * 1.5 + 0.75}rem` : undefined };

  return (
    <li>
      {item.path ? (
        <Link to={item.path} className={className} style={style}>
          {content}
        </Link>
      ) : (
        <button onClick={hasChildren ? onToggle : undefined} className={className} style={style}>
          {content}
        </button>
      )}

      {isOpen && hasChildren && isExpanded && (
        <ul className="mt-1 space-y-1">
          {item.children!.map((child) => (
            <NavItem
              key={child.name}
              item={child}
              isOpen={isOpen}
              isExpanded={false}
              onToggle={() => { }}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
