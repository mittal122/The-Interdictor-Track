# The Interdictor Track — Technical Project Report

## 1. Executive Summary
The Interdictor Track is an enterprise-grade AWS Infrastructure Intelligence platform designed to provide real-time visibility, cost optimization, and automated security analysis of cloud environments. It transforms complex raw AWS telemetry into interactive 2D graphs, immersive 3D isometric diagrams, and actionable AI insights.

---

## 2. Core Components & Features

### A. AWS Infrastructure Discovery Engine
- **Purpose**: Dynamically scans a user's AWS account across multiple regions to build a "Truth Map" of all running resources.
- **Implementation**: `src/services/awsInfrastructureEngine.ts`
- **Technologies**: AWS SDK v3 (EC2, S3, RDS, Lambda, IAM, ELB clients).
- **Security**: Uses **AWS STS AssumeRole**. Instead of using long-term static keys, the engine requests temporary session tokens. This ensures that even if a session is intercepted, it expires automatically.
- **User Benefit**: Automates the manual task of logging into the AWS Console and checking 20+ different pages.

### B. AI-Powered Layout Planner (NVIDIA NIM)
- **Purpose**: Solving the "Diagram Spaghetti" problem. Standard diagrams crossover lines; this component uses AI to place nodes logically.
- **Implementation**: `src/services/nimLayoutService.ts`
- **Technologies**: NVIDIA NIM API (`meta/llama-3.1-405b-instruct`).
- **Security**: API keys are stored in server-side `.env` files and never sent to the browser. Input data is anonymized (Resource IDs only, no sensitive values).
- **User Benefit**: Instantly creates a readable architecture diagram that looks like it was drawn by a human architect.

### C. 3D Isometric Infrastructure Diagram
- **Purpose**: Provides an immersive, high-level view of infrastructure layers (Networking → Compute → Data).
- **Implementation**: `src/components/Isometric3DView.tsx`
- **Technologies**: React Three Fiber, Three.js, GSAP for animations.
- **Security**: Client-side rendering only. Data is fetched once via the secure socket and processed in memory.
- **User Benefit**: Helps stakeholders visualize the "stack height" and physical relationships between networking subnets and compute instances.

### D. Cost Estimation & Waste Detection
- **Purpose**: Identifies exactly where money is being spent and, more importantly, where it is being wasted (orphaned resources).
- **Implementation**: `src/services/costEstimationService.ts` & `src/components/CostEstimationPanel.tsx`
- **Technologies**: AWS Pricing heuristics, Recharts (for visualization).
- **Security**: Calculations are performed on the server. No external billing APIs are called with user data.
- **User Benefit**: Detects "Orphaned EBS Volumes" or "Idle Load Balancers" that are costing money but aren't attached to anything.

### E. Terraform Infrastructure-as-Code (IaC) Export
- **Purpose**: Converts the live infrastructure back into code for disaster recovery or environment cloning.
- **Implementation**: `src/services/terraformExportService.ts` & `src/components/TerraformExportModal.tsx`
- **Technologies**: HCL (HashiCorp Configuration Language) generation engine.
- **Security**: Generates code with variable placeholders for sensitive values. Does not hardcode secrets into the exported files.
- **User Benefit**: Saves DevOps engineers hours of manual coding by "reverse engineering" an existing manual setup into professional Terraform files.

### F. AI Infrastructure Analyst
- **Purpose**: A "Digital Cloud Consultant" that reads your map and tells you what is wrong.
- **Implementation**: `src/services/aiAnalystService.ts` & `src/components/AiInsightsPanel.tsx`
- **Technologies**: Google Gemini 1.5 Pro / NVIDIA NIM LLMs.
- **Security**: Sends a compact "Infrastructure Summary" (no IP addresses, no account IDs) to the AI to prevent data leakage.
- **User Benefit**: Instantly flags security risks (e.g., "Open Port 22") or architecture flaws (e.g., "Single Point of Failure").

### G. VPC Infrastructure Filtering
- **Purpose**: Allows users to filter out "noise" and focus only on a specific production or staging environment.
- **Implementation**: `src/utils/vpcInfrastructureFilter.ts`
- **Technologies**: Recursive dependency tracing algorithms.
- **User Benefit**: Simplifies debugging by hiding the 90% of resources that are irrelevant to the current task.

---

## 3. Data Protection & Security Architecture

### I. Secure Credential Vault
- **What it is**: All AWS Access Keys are encrypted using **AES-256-CBC** before being stored.
- **Protection**: We use a `VAULT_SECRET_KEY` that never leaves the server. Even if the database is stolen, the keys remain unreadable without the secret.

### II. Role-Based Access Control (RBAC)
- **Roles**:
    - **Admin**: Full access to scan, export code, and manage keys.
    - **Engineer**: Can scan and view insights but cannot export Terraform or see detailed billing.
    - **Viewer**: Read-only access to diagrams.
- **Protection**: Every Socket.IO event and API endpoint check the user's JWT token for the required role before executing.

### III. Data Anonymization
- **Mechanism**: When data is sent to AI models for analysis, we strip away specific identifying information (Private IPs, exact resource names) and send general types and configuration counts to ensure privacy.

---

## 4. User Guide: How to Use the Platform

### When to use it?
1. **Auditing**: When you join a new company and need to know what they have running in AWS.
2. **Cost Cutting**: Use the **Cost Panel** monthly to find "zombie" resources.
3. **Security Review**: Use the **AI Analyst** before every deployment to catch open firewalls.
4. **Migration**: Use **Terraform Export** when moving from a manual setup to an automated one.

### How to use it?
1. **Connect**: Open the **Live Mode Wizard**, enter your Read-Only IAM credentials (use the provided policy for least-privilege).
2. **Scan**: Click **SCAN ACCOUNT**. The system will fetch data across all regions.
3. **Visualize**: Toggle between **Visual Graph** (for logic) and **3D View** (for architecture presentation).
4. **Optimize**: Open **AI Insights** to see a list of prioritized recommendations.

---

## 5. Technical Requirements for Industry Readiness
To move into a production environment, the platform leverages:
- **JWT Authentication**: Secure stateless login.
- **PostgreSQL**: Stable persistence for logs and user profiles.
- **Node.js Clusters**: High-performance asynchronous processing of AWS telemetry.
- **Secure WebSockets**: Real-time communication without refreshing the page.

---
*Report Generated: March 2026*
*Platform: The Interdictor Track*
