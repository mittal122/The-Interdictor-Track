import { TelemetryData } from './telemetryService';
import dotenv from "dotenv";

dotenv.config();

export class AlertingWorker {
    private webhookUrl = process.env.SLACK_WEBHOOK_URL;
    private lastAlerted: Record<string, number> = {};
    private ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cool-down per alert type

    public async checkThresholds(data: TelemetryData) {
        const alerts: string[] = [];

        // Condition 1: Global Health
        if (data.globalHealth < 75) {
            alerts.push(`🚨 *CRITICAL*: Global Health dropped to ${data.globalHealth.toFixed(1)}%`);
        }

        // Condition 2: High Network Latency
        if (data.networkLatency > 150) {
            alerts.push(`⚠️ *WARNING*: Network Latency spike detected: ${data.networkLatency.toFixed(0)}ms`);
        }

        // Condition 3: Node Down
        if (data.computeNodes) {
            const offlineNodes = data.computeNodes.filter((n: any) => n.status === 'offline');
            if (offlineNodes.length > 0) {
                const nodeNames = offlineNodes.map((n: any) => n.id).join(", ");
                alerts.push(`📉 *ALERT*: ${offlineNodes.length} Compute Node(s) went OFFLINE: ${nodeNames}`);
            }
        }

        for (const alertMsg of alerts) {
            // Group identical alert conditions by prefix to debounce
            const alertKey = alertMsg.split(':')[0];
            const now = Date.now();

            if (!this.lastAlerted[alertKey] || now - this.lastAlerted[alertKey] > this.ALERT_COOLDOWN_MS) {
                this.lastAlerted[alertKey] = now;
                await this.sendSlackAlert(alertMsg);
            }
        }
    }

    private async sendSlackAlert(text: string) {
        if (!this.webhookUrl || this.webhookUrl.includes("YOUR/WEBHOOK/URL")) {
            console.log(`\x1b[33m[Slack Simulation]\x1b[0m ${text}`);
            return;
        }

        try {
            const res = await fetch(this.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: text,
                    username: "Interdictor Command Center",
                    icon_emoji: ":rotating_light:"
                })
            });
            if (res.ok) {
                console.log(`\x1b[32m[Slack Sent]\x1b[0m ${text}`);
            } else {
                console.error("Slack API rejected webhook payload:", res.status);
            }
        } catch (error) {
            console.error("Failed to send Slack alert:", error);
        }
    }
}
