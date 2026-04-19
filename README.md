# The Interdictor Track: AWS Infrastructure Intelligence 🌐⚡

**The Interdictor Track** is an enterprise-grade AWS Infrastructure Intelligence platform designed to provide real-time visibility, cost optimization, and automated security analysis of your cloud environments.

---

## 🎯 Why Was This Project Built?

Modern cloud infrastructure is complex. DevOps engineers and system architects frequently spend hours manually logging into the AWS Console, clicking through 20+ different pages across multiple regions, just to understand:
1. *What exactly is running right now?*
2. *Where are we wasting money?*
3. *Are there any critical security flaws?*

Existing tools either produce unreadable "spaghetti diagrams" or require granting broad permissions to third-party services.

## 🛑 The Problem It Solves

- **The "Diagram Spaghetti" Problem:** Standard infrastructure graphs are often chaotic and unreadable due to overlapping lines.
- **Cost Blind Spots:** Leftover load balancers, orphaned EBS volumes, and idle EC2 instances drain company budgets silently.
- **Security Risks:** Simple misconfigurations, like an open Port 22 or a Single Point of Failure (SPOF), can lead to breaches or downtime.
- **Manual Auditing & IaC:** Bringing a manually created cloud environment back into Terraform code is tedious and error-prone.

## ✅ How It Solves It

**The Interdictor Track** transforms raw, chaotic AWS telemetry into readable, intelligent diagrams and actionable insights:

1. **AI-Powered Layouts:** Uses NVIDIA NIM (Llama 3.1) to intelligently organize nodes for maximum readability.
2. **3D Isometric Views:** Presents the infrastructure in an immersive layered view (Networking → Compute → Data).
3. **Automated Cost & Waste Detection:** Points out specific resources that are costing money but aren't actively being used.
4. **AI Cloud Analyst:** Acts as a "Digital Cloud Consultant," reading your Truth Map and instantly flagging security vulnerabilities.
5. **Reverse Terraform Export:** Converts your live configuration directly into professional HCL files for Disaster Recovery or environment cloning.

---

## 🗺️ Visual Flow: How the Platform Works

```mermaid
graph TD
    classDef user fill:#6366f1,stroke:#3b82f6,stroke-width:2px,color:#fff
    classDef aws fill:#eab308,stroke:#ca8a04,stroke-width:2px,color:#000
    classDef backend fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff
    classDef ai fill:#a855f7,stroke:#9333ea,stroke-width:2px,color:#fff
    classDef ui fill:#ec4899,stroke:#db2777,stroke-width:2px,color:#fff

    A[User Inputs Read-Only IAM Keys]:::user -->|Secure Request via TLS| B(AWS Discovery Engine):::backend
    B -->|AssumeRole / Scan| C[AWS Cloud Regions]:::aws
    C -.->|Raw Telemetry| B
    
    B -->|Filter & Anonymize Data| D(NVIDIA NIM AI / Gemini):::ai
    D -.->|Logical Grouping & Security Insights| B
    
    B -->|WebSocket Stream| E[Client Dashboard]:::ui
    
    E --> F[2D AI Layout Graph]:::ui
    E --> G[3D Isometric Diagram]:::ui
    E --> H[Cost & Waste Panel]:::ui
    E --> I[Terraform Code Export]:::ui
    E --> J[AI Insights & Security Audit]:::ui
```

---

## 🔒 Security First

All AWS Access Keys are encrypted using **AES-256-CBC** with a secure Vault Key and can be saved solely on the client side using secure local storage. Data passed to the AI models is strictly anonymized. 

## 🚀 Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set your API credentials (e.g., `GEMINI_API_KEY`, `NVIDIA_NIM_API_KEY`) in `.env.local` based on the `.env.example` format.
3. Run the development server:
   ```bash
   npm run dev
   ```
