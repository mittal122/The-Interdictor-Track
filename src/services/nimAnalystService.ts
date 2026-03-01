import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-8b-instruct";

let nimClient: OpenAI | null = null;

if (NVIDIA_API_KEY && !NVIDIA_API_KEY.includes("nvapi-your-key-here")) {
    nimClient = new OpenAI({
        apiKey: NVIDIA_API_KEY,
        baseURL: "https://integrate.api.nvidia.com/v1",
    });
    console.log(`🤖 NVIDIA NIM Active: Using model \`${NVIDIA_MODEL}\``);
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

Format your response as valid JSON with keys: summary, severity, recommendations (array of 3), estimatedImpact`;
}

function buildUserPrompt(req: AnalysisRequest): string {
    const { telemetrySnapshot, analysisType, customContext } = req;
    const healthStatus = telemetrySnapshot.globalHealth < 75 ? "DEGRADED" :
        telemetrySnapshot.globalHealth < 90 ? "WARNING" : "HEALTHY";

    return `ANALYSIS TYPE: ${analysisType.toUpperCase()}
TELEMETRY SNAPSHOT (real-time):
- Global Health: ${telemetrySnapshot.globalHealth.toFixed(1)}% [${healthStatus}]
- Network Latency: ${telemetrySnapshot.networkLatency.toFixed(0)}ms ${telemetrySnapshot.networkLatency > 100 ? "⚠️ HIGH" : "✅"}
- CPU Load: ${telemetrySnapshot.cpuUsage.toFixed(1)}% ${telemetrySnapshot.cpuUsage > 80 ? "⚠️ HIGH" : "✅"}
- Memory Utilization: ${telemetrySnapshot.memoryUsage.toFixed(1)}%
- Active Anomalies: ${telemetrySnapshot.activeAnomalies}
- Offline Nodes: ${telemetrySnapshot.offlineNodes} / ${telemetrySnapshot.totalNodes} total
${telemetrySnapshot.serverLoad ? `- Highest Region Load: ${Math.max(...telemetrySnapshot.serverLoad.map(r => r.load)).toFixed(0)}% (${telemetrySnapshot.serverLoad.sort((a, b) => b.load - a.load)[0]?.region})` : ""}
${customContext ? `\nADDITIONAL CONTEXT: ${customContext}` : ""}

Generate a JSON incident analysis for this snapshot. Return ONLY raw JSON, no markdown.`;
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
        summary: `[SIMULATION MODE] Current system status shows ${issueStr}. Global health at ${telemetrySnapshot.globalHealth.toFixed(1)}% with ${telemetrySnapshot.activeAnomalies} active anomalies. Add NVIDIA_NIM_API_KEY to .env for real AI-powered analysis.`,
        severity,
        recommendations: [
            issues.length > 0 ? `Investigate root cause of ${issues[0]} immediately` : "Monitor telemetry for any anomaly spikes",
            `Review Access Logs for unauthorized activity patterns over the last 24 hours`,
            `Validate system health across all ${telemetrySnapshot.totalNodes} nodes — ensure redundancies are active`
        ],
        estimatedImpact: severity === "critical" ? "HIGH – SLA breach risk in < 15 minutes" :
            severity === "high" ? "MEDIUM – potential degradation for 5-10% of users" :
                severity === "medium" ? "LOW – monitoring recommended, no immediate action" :
                    "NONE – all systems within operational parameters",
        model: "simulation-engine",
        latencyMs: 0,
        isSimulated: true
    };
}

export async function runAnalysis(req: AnalysisRequest): Promise<AnalysisResponse> {
    const startTime = Date.now();

    if (!nimClient) {
        return generateFallbackResponse(req);
    }

    try {
        const completion = await nimClient.chat.completions.create({
            model: NVIDIA_MODEL,
            messages: [
                { role: "system", content: buildSystemPrompt() },
                { role: "user", content: buildUserPrompt(req) }
            ],
            max_tokens: 512,
            temperature: 0.3,
        });

        const rawText = completion.choices[0]?.message?.content || "{}";
        const latencyMs = Date.now() - startTime;

        // Parse JSON from response
        let parsed: any = {};
        try {
            // Strip markdown fences if model included them
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
        } catch {
            parsed = { summary: rawText };
        }

        return {
            summary: parsed.summary || rawText,
            severity: (["low", "medium", "high", "critical"].includes(parsed.severity?.toLowerCase()))
                ? parsed.severity.toLowerCase()
                : "medium",
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : ["Review system metrics", "Check Access Logs", "Validate node health"],
            estimatedImpact: parsed.estimatedImpact || "Analysis complete",
            model: NVIDIA_MODEL,
            latencyMs,
            isSimulated: false
        };

    } catch (error: any) {
        console.error("NVIDIA NIM API Error:", error?.message);
        const fallback = generateFallbackResponse(req);
        fallback.summary = `⚠️ NIM API Error: ${error?.message}. ${fallback.summary}`;
        return fallback;
    }
}
