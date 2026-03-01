import React, { useState } from "react";
import { Settings, FileCode, GitBranch, Clock, ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "../utils/cn";

// --- Types ---
interface ConfigFile {
    id: string;
    name: string;
    type: "terraform" | "ansible" | "docker" | "yaml";
    icon: string;
    content: string;
    language: string;
}

interface VersionEntry {
    hash: string;
    author: string;
    date: string;
    message: string;
    filesChanged: number;
}

// --- Sample IaC Files ---
const CONFIG_FILES: ConfigFile[] = [
    {
        id: "tf-main",
        name: "main.tf",
        type: "terraform",
        icon: "TF",
        language: "hcl",
        content: `# Interdictor Track - Main Infrastructure
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "interdictor-tfstate"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source     = "./modules/vpc"
  cidr_block = var.vpc_cidr
  env        = var.environment
}

module "ecs_cluster" {
  source       = "./modules/ecs"
  cluster_name = "interdictor-\${var.environment}"
  vpc_id       = module.vpc.vpc_id
  subnets      = module.vpc.private_subnet_ids
}

module "rds" {
  source          = "./modules/rds"
  engine          = "postgres"
  engine_version  = "16.1"
  instance_class  = "db.r6g.xlarge"
  db_name         = "interdictor_db"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.database_subnet_ids
}`,
    },
    {
        id: "tf-vars",
        name: "variables.tf",
        type: "terraform",
        icon: "TF",
        language: "hcl",
        content: `variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

variable "alert_email" {
  description = "Email for CloudWatch alerts"
  type        = string
  default     = "ops@interdictor.gov"
}`,
    },
    {
        id: "ansible-play",
        name: "deploy.yml",
        type: "ansible",
        icon: "AN",
        language: "yaml",
        content: `---
# Interdictor Track - Deployment Playbook
- name: Deploy Interdictor Command Center
  hosts: production_servers
  become: yes
  vars:
    app_version: "{{ lookup('env', 'APP_VERSION') }}"
    deploy_dir: /opt/interdictor
    node_env: production

  tasks:
    - name: Ensure deployment directory exists
      file:
        path: "{{ deploy_dir }}"
        state: directory
        owner: interdictor
        group: interdictor
        mode: '0755'

    - name: Pull latest container image
      docker_image:
        name: "registry.interdictor.gov/command-center"
        tag: "{{ app_version }}"
        source: pull
        force_source: yes

    - name: Stop existing containers
      docker_compose:
        project_src: "{{ deploy_dir }}"
        state: absent
      ignore_errors: yes

    - name: Deploy new version
      docker_compose:
        project_src: "{{ deploy_dir }}"
        state: present
        pull: yes
      environment:
        APP_VERSION: "{{ app_version }}"
        NODE_ENV: "{{ node_env }}"

    - name: Verify health endpoint
      uri:
        url: "https://localhost:3000/api/health"
        validate_certs: no
        status_code: 200
      retries: 5
      delay: 10

    - name: Send deployment notification
      slack:
        token: "{{ slack_token }}"
        msg: "Interdictor v{{ app_version }} deployed to production"
        channel: "#ops-deployments"`,
    },
    {
        id: "docker-compose",
        name: "docker-compose.prod.yml",
        type: "docker",
        icon: "DK",
        language: "yaml",
        content: `version: '3.8'

services:
  app:
    image: registry.interdictor.gov/command-center:\${APP_VERSION}
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PG_HOST: postgres
      PG_PORT: 5432
      PG_USER: interdictor
      PG_PASSWORD_FILE: /run/secrets/db_password
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      PROMETHEUS_URL: http://prometheus:9090
    secrets:
      - db_password
      - jwt_secret
    depends_on:
      postgres:
        condition: service_healthy
      prometheus:
        condition: service_started
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
        max_attempts: 5

  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: interdictor
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
      POSTGRES_DB: interdictor_db
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U interdictor"]
      interval: 10s
      timeout: 5s
      retries: 5

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - promdata:/prometheus
    ports:
      - "9090:9090"

volumes:
  pgdata:
  promdata:

secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt`,
    },
    {
        id: "k8s-deploy",
        name: "deployment.yaml",
        type: "yaml",
        icon: "K8",
        language: "yaml",
        content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: interdictor-command-center
  namespace: production
  labels:
    app: interdictor
    tier: frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: interdictor
  template:
    metadata:
      labels:
        app: interdictor
    spec:
      containers:
        - name: command-center
          image: registry.interdictor.gov/command-center:latest
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          envFrom:
            - configMapRef:
                name: interdictor-config
            - secretRef:
                name: interdictor-secrets`,
    },
];

// --- Simulated Version History ---
const VERSION_HISTORY: VersionEntry[] = [
    { hash: "a3f8c2d", author: "ops-admin", date: "2026-03-01 09:15", message: "feat: add SSL/TLS cert rotation config", filesChanged: 3 },
    { hash: "e7b1d4a", author: "deployer", date: "2026-02-28 18:42", message: "fix: PostgreSQL connection pool sizing", filesChanged: 2 },
    { hash: "9c2e5f8", author: "ops-admin", date: "2026-02-28 14:20", message: "chore: update Prometheus scrape interval", filesChanged: 1 },
    { hash: "1d4a7b3", author: "ci-pipeline", date: "2026-02-27 22:10", message: "feat: add K8s deployment manifest", filesChanged: 4 },
    { hash: "6f3e8c1", author: "ops-admin", date: "2026-02-27 11:05", message: "refactor: split Terraform into modules", filesChanged: 6 },
    { hash: "b8d2f5e", author: "deployer", date: "2026-02-26 16:30", message: "feat: add Ansible deployment playbook", filesChanged: 2 },
    { hash: "4a7c9d2", author: "ops-admin", date: "2026-02-25 09:00", message: "init: initial infrastructure setup", filesChanged: 8 },
];

const TYPE_COLORS: Record<string, string> = {
    terraform: "text-purple-400 bg-purple-950/30 border-purple-800/30",
    ansible: "text-red-400 bg-red-950/30 border-red-800/30",
    docker: "text-blue-400 bg-blue-950/30 border-blue-800/30",
    yaml: "text-cyan-400 bg-cyan-950/30 border-cyan-800/30",
};

export function SystemConfig() {
    const [selectedFile, setSelectedFile] = useState<ConfigFile>(CONFIG_FILES[0]);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(selectedFile.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const lines = selectedFile.content.split("\n");

    return (
        <div className="flex h-full flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-100">System Config</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Infrastructure as Code Control Interface</p>
                </div>
                <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-zinc-400 animate-spin" style={{ animationDuration: "8s" }} />
                    <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">{CONFIG_FILES.length} configs</span>
                </div>
            </div>

            {/* Main Layout */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-4 min-h-0 overflow-hidden">
                {/* File Browser */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/30">
                        <FileCode className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Config Files</span>
                    </div>
                    <div className="space-y-1">
                        {CONFIG_FILES.map(file => (
                            <button
                                key={file.id}
                                onClick={() => setSelectedFile(file)}
                                className={cn(
                                    "flex items-center gap-2 w-full rounded px-2.5 py-2 text-left transition-all text-xs cursor-pointer",
                                    "hover:bg-zinc-800/50",
                                    selectedFile.id === file.id ? "bg-zinc-800/70 text-zinc-100" : "text-zinc-400"
                                )}
                            >
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", TYPE_COLORS[file.type])}>
                                    {file.icon}
                                </span>
                                <span className="font-mono truncate">{file.name}</span>
                                {selectedFile.id === file.id && <ChevronRight className="h-3 w-3 ml-auto text-zinc-500" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Code Viewer */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/80 overflow-hidden flex flex-col min-h-0">
                    {/* Code header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50 shrink-0 bg-zinc-900/50">
                        <div className="flex items-center gap-2">
                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", TYPE_COLORS[selectedFile.type])}>
                                {selectedFile.icon}
                            </span>
                            <span className="text-xs font-mono text-zinc-200">{selectedFile.name}</span>
                        </div>
                        <button onClick={handleCopy} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer">
                            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    {/* Code content */}
                    <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                        <table className="w-full">
                            <tbody>
                                {lines.map((line, i) => (
                                    <tr key={i} className="hover:bg-zinc-800/30">
                                        <td className="text-right pr-4 text-zinc-600 select-none w-10 align-top" style={{ minWidth: "2.5rem" }}>
                                            {i + 1}
                                        </td>
                                        <td className="text-zinc-300 whitespace-pre">
                                            {highlightLine(line)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Version History */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/30">
                        <GitBranch className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Version History</span>
                    </div>
                    <div className="space-y-1">
                        {VERSION_HISTORY.map((entry, i) => (
                            <div key={entry.hash} className="relative pl-5 pb-4">
                                {/* Timeline line */}
                                {i < VERSION_HISTORY.length - 1 && (
                                    <div className="absolute left-[7px] top-3 bottom-0 w-px bg-zinc-800" />
                                )}
                                {/* Timeline dot */}
                                <div className={cn(
                                    "absolute left-0 top-1 w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                    i === 0 ? "border-emerald-500 bg-emerald-500/20" : "border-zinc-700 bg-zinc-800"
                                )}>
                                    <div className={cn("w-1.5 h-1.5 rounded-full", i === 0 ? "bg-emerald-400" : "bg-zinc-600")} />
                                </div>
                                {/* Content */}
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono text-zinc-500">{entry.hash}</span>
                                        <span className="text-[9px] text-zinc-600">•</span>
                                        <span className="text-[10px] text-zinc-500">{entry.filesChanged} files</span>
                                    </div>
                                    <p className="text-xs text-zinc-300 mt-0.5 leading-snug">{entry.message}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Clock className="h-2.5 w-2.5 text-zinc-600" />
                                        <span className="text-[10px] text-zinc-600">{entry.date}</span>
                                        <span className="text-[10px] text-zinc-500">by {entry.author}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Simple Syntax Highlighting ---
function highlightLine(line: string): React.ReactNode {
    // Comments
    if (line.trimStart().startsWith("#") || line.trimStart().startsWith("//")) {
        return <span className="text-zinc-600 italic">{line}</span>;
    }
    // Keywords
    const keywords = /\b(terraform|variable|module|resource|provider|output|data|locals|backend|source|type|default|description|name|image|ports|volumes|environment|depends_on|deploy|replicas|spec|metadata|kind|apiVersion|hosts|tasks|become|vars)\b/g;
    const strings = /(["'])(?:(?=(\\?))\2.)*?\1/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const combined = new RegExp(`(${keywords.source})|(${strings.source})`, "g");
    let match;

    while ((match = combined.exec(line)) !== null) {
        if (match.index > lastIndex) {
            parts.push(<span key={lastIndex}>{line.slice(lastIndex, match.index)}</span>);
        }
        if (match[1]) {
            parts.push(<span key={match.index} className="text-purple-400">{match[0]}</span>);
        } else {
            parts.push(<span key={match.index} className="text-emerald-400">{match[0]}</span>);
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
        parts.push(<span key={lastIndex}>{line.slice(lastIndex)}</span>);
    }

    return parts.length > 0 ? <>{parts}</> : <span>{line}</span>;
}
