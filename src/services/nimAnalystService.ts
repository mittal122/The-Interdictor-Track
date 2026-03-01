import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || "openai/gpt-oss-120b";

const nimClient = new OpenAI({
    apiKey: NVIDIA_API_KEY || "not-set",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

const hasValidKey = !!NVIDIA_API_KEY && !NVIDIA_API_KEY.includes("nvapi-your-key-here");

if (hasValidKey) {
    console.log(`🤖 NVIDIA NIM Active → model: ${NVIDIA_MODEL}`);
} else {
    console.log("🤖 NVIDIA NIM Offline: Add NVIDIA_NIM_API_KEY to .env to enable AI Analyst.");
}

export interface AnalysisRequest {
    analysisType: "incident" | "anomaly" | "capacity" | "security";
    telemetrySnapshot: {
        globalHealth: number;
        networkLatency: number;
        cpuUsage: number;
        memoryUsage: number;
        activeAnomalies: number;
        offlineNodes: number;
        totalNodes: number;
        serverLoad?: { region: string; load: number }[];
    };
    customContext?: string;
}

export interface AnalysisResponse {
    summary: string;
    severity: "low" | "medium" | "high" | "critical";
    recommendations: string[];
    estimatedImpact: string;
    model: string;
    latencyMs: number;
    isSimulated: boolean;
}

function buildSystemPrompt(): string {
    return `You are "ARIA" (Automated Response & Incident Analyst), an elite AI embedded in the Interdictor Command Center – an enterprise-grade cloud infrastructure monitoring platform.

Your role is to:
1. Rapidly assess incoming telemetry data and identify risks
2. Generate concise, actionable incident reports
3. Provide clear recommendations for SRE/DevOps teams
4. Classify incident severity using industry-standard ITIL methodology

Communication style:
- Direct and military-efficient (this is a NOC/SOC environment)
- Use technical language appropriate for seasoned DevOps engineers
- Be specific with numbers, thresholds, and SLAs
- Always provide 3 concrete next steps

CRITICAL: Respond with ONLY a raw JSON object (no markdown, no code fences). Structure:
{
  "summary": "...",
  "severity": "low|medium|high|critical",
  "recommendations": ["step 1", "step 2", "step 3"],
  "estimatedImpact": "..."
}`;
}

function buildUserPrompt(req: AnalysisRequest): string {
    const { telemetrySnapshot, analysisType, customContext } = req;
    const healthStatus = telemetrySnapshot.globalHealth < 75 ? "DEGRADED" :
        telemetrySnapshot.globalHealth < 90 ? "WARNING" : "HEALTHY";

    const maxRegion = telemetrySnapshot.serverLoad?.sort((a, b) => b.load - a.load)[0];

    return `ANALYSIS TYPE: ${analysisType.toUpperCase()}

LIVE TELEMETRY SNAPSHOT:
- Global Health: ${telemetrySnapshot.globalHealth.toFixed(1)}% [${healthStatus}]
- Network Latency: ${telemetrySnapshot.networkLatency.toFixed(0)}ms ${telemetrySnapshot.networkLatency > 100 ? "⚠️ HIGH" : "✅ OK"}
- CPU Load: ${telemetrySnapshot.cpuUsage.toFixed(1)}% ${telemetrySnapshot.cpuUsage > 80 ? "⚠️ HIGH" : "✅ OK"}
- Memory Utilization: ${telemetrySnapshot.memoryUsage.toFixed(1)}%
- Active Anomalies: ${telemetrySnapshot.activeAnomalies}
- Offline Nodes: ${telemetrySnapshot.offlineNodes} / ${telemetrySnapshot.totalNodes} total
${maxRegion ? `- Highest Region Load: ${maxRegion.load.toFixed(0)}% (${maxRegion.region})` : ""}
${customContext ? `\nADDITIONAL CONTEXT FROM OPERATOR: ${customContext}` : ""}

Generate a JSON incident analysis for this snapshot. Return ONLY raw JSON.`;
}

function generateFallbackResponse(req: AnalysisRequest): AnalysisResponse {
    const { telemetrySnapshot } = req;
    const issues: string[] = [];
    let severity: AnalysisResponse["severity"] = "low";

    if (telemetrySnapshot.globalHealth < 75) { issues.push("critical global health degradation"); severity = "critical"; }
    else if (telemetrySnapshot.globalHealth < 90) { issues.push("elevated health warning"); severity = "medium"; }
    if (telemetrySnapshot.networkLatency > 100) { issues.push(`network latency spike at ${telemetrySnapshot.networkLatency.toFixed(0)}ms`); if (severity !== "critical") severity = "high"; }
    if (telemetrySnapshot.offlineNodes > 0) { issues.push(`${telemetrySnapshot.offlineNodes} node(s) offline`); if (severity === "low") severity = "medium"; }
    if (telemetrySnapshot.cpuUsage > 85) { issues.push(`CPU saturation at ${telemetrySnapshot.cpuUsage.toFixed(0)}%`); if (severity === "low") severity = "medium"; }

    const issueStr = issues.length > 0 ? issues.join(", ") : "all systems nominal";

    return {
        summary: `[SIMULATION MODE] ${issueStr.charAt(0).toUpperCase() + issueStr.slice(1)} detected. Global health at ${telemetrySnapshot.globalHealth.toFixed(1)}% with ${telemetrySnapshot.activeAnomalies} active anomalies. Add NVIDIA_NIM_API_KEY to .env for real AI-powered analysis via ARIA.`,
        severity,
        recommendations: [
            issues.length > 0 ? `Escalate investigation into ${issues[0]} using runbook INT-${Math.floor(Math.random() * 900) + 100}` : "Maintain current watch posture — no anomalies detected",
            `Cross-reference Access Logs for unauthorized activity in the last 24 hours`,
            `Validate redundancy health across all ${telemetrySnapshot.totalNodes} nodes and confirm failover readiness`
        ],
        estimatedImpact: severity === "critical" ? "HIGH – SLA breach risk within 15 minutes" :
            severity === "high" ? "MEDIUM – up to 5-10% of requests may degrade" :
                severity === "medium" ? "LOW – monitor closely, no immediate user impact" :
                    "NONE – operating within all SLO parameters",
        model: "simulation-engine",
        latencyMs: 0,
        isSimulated: true
    };
}

export async function runAnalysis(req: AnalysisRequest): Promise<AnalysisResponse> {
    if (!hasValidKey) {
        return generateFallbackResponse(req);
    }

    const startTime = Date.now();

    try {
        // Create a streaming chat completion — matches the user's Python pattern exactly
        const stream = await nimClient.chat.completions.create({
            model: NVIDIA_MODEL,
            messages: [
                { role: "system", content: buildSystemPrompt() },
                { role: "user", content: buildUserPrompt(req) }
            ],
            temperature: 1,
            top_p: 1,
            max_tokens: 4096,
            stream: true,
        });

        // Accumulate streamed chunks into a full response string
        let fullText = "";
        for await (const chunk of stream) {
            if (!chunk.choices || chunk.choices.length === 0) continue;

            const delta = chunk.choices[0].delta;

            // Support reasoning_content (used by some NIM reasoning models)
            const reasoning = (delta as any).reasoning_content;
            if (reasoning) {
                // Reasoning tokens don't need to be surfaced in the UI response
                continue;
            }

            if (delta.content) {
                fullText += delta.content;
            }
        }

        const latencyMs = Date.now() - startTime;

        // Parse the JSON from the response
        let parsed: any = {};
        try {
            const jsonMatch = fullText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
        } catch {
            parsed = { summary: fullText };
        }

        const validSeverities = ["low", "medium", "high", "critical"];

        return {
            summary: parsed.summary || fullText || "Analysis complete — no structured response returned.",
            severity: validSeverities.includes(parsed.severity?.toLowerCase())
                ? parsed.severity.toLowerCase()
                : "medium",
            recommendations: Array.isArray(parsed.recommendations)
                ? parsed.recommendations.slice(0, 3)
                : ["Review system metrics", "Check Access Logs", "Validate node health"],
            estimatedImpact: parsed.estimatedImpact || "See summary for details",
            model: NVIDIA_MODEL,
            latencyMs,
            isSimulated: false
        };

    } catch (error: any) {
        console.error("NVIDIA NIM API Error:", error?.message);
        const fallback = generateFallbackResponse(req);
        fallback.summary = `⚠️ NIM API Error: ${error?.message}. Falling back to simulation. ` + fallback.summary;
        return fallback;
    }
}
