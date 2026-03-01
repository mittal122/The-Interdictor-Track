import { AwsIntegrationService, PerRequestCredentials } from './awsIntegrationService';

export interface Anomaly {
  id: string;
  lat: number;
  lng: number;
  severity: string;
}

export interface TelemetryData {
  timestamp: number;
  globalHealth: number;
  networkLatency: number;
  anomalies: Anomaly[];
  serverLoad: { region: string; load: number }[];
  cpuUsage: number;
  memoryUsage: number;
  computeNodes?: any[] | null;
  billingData?: number | null;
}

export class TelemetryService {
  private prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  private awsService = new AwsIntegrationService();

  private simulateHealth(): number { return 85 + Math.random() * 15; }
  private simulateLatency(): number { return 15 + Math.random() * 60; }
  private simulateServerLoad() {
    return [
      { region: "US-East", load: 40 + Math.random() * 50 },
      { region: "US-West", load: 30 + Math.random() * 55 },
      { region: "EU-Central", load: 35 + Math.random() * 45 },
      { region: "AP-South", load: 25 + Math.random() * 60 },
      { region: "AP-East", load: 20 + Math.random() * 50 },
    ];
  }
  private simulateCompute() {
    return { cpu: 20 + Math.random() * 60, memory: 30 + Math.random() * 50 };
  }
  private simulateAnomalies(): Anomaly[] {
    const count = Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0;
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return Array.from({ length: count }, (_, i) => ({
      id: `ANM-${Date.now().toString(36).toUpperCase()}-${i}`,
      lat: (Math.random() * 140) - 70,
      lng: (Math.random() * 340) - 170,
      severity: severities[Math.floor(Math.random() * severities.length)],
    }));
  }

  async fetchGlobalHealth(): Promise<number> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=global_health_percentage`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.data?.result?.length > 0) return parseFloat(data.data.result[0].value[1]);
      throw new Error('No data');
    } catch { return this.simulateHealth(); }
  }

  async fetchNetworkLatency(): Promise<number> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=network_latency_ms`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.data?.result?.length > 0) return parseFloat(data.data.result[0].value[1]);
      throw new Error('No data');
    } catch { return this.simulateLatency(); }
  }

  async fetchActiveAnomalies(): Promise<Anomaly[]> {
    try {
      const res = await fetch(`${process.env.CLOUDWATCH_URL || 'http://localhost:8080'}/api/v1/anomalies/active`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.anomalies?.length > 0) return data.anomalies;
      throw new Error('No data');
    } catch { return this.simulateAnomalies(); }
  }

  async fetchServerLoad(): Promise<{ region: string; load: number }[]> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=regional_server_load`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.data?.result?.length > 0)
        return data.data.result.map((r: any) => ({ region: r.metric.region, load: parseFloat(r.value[1]) }));
      throw new Error('No data');
    } catch { return this.simulateServerLoad(); }
  }

  async fetchComputeMetrics(): Promise<{ cpu: number; memory: number }> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=compute_metrics`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.data?.result?.length >= 2) {
        return {
          cpu: parseFloat(data.data.result.find((r: any) => r.metric.type === 'cpu').value[1]),
          memory: parseFloat(data.data.result.find((r: any) => r.metric.type === 'memory').value[1]),
        };
      }
      throw new Error('No data');
    } catch { return this.simulateCompute(); }
  }

  /**
   * Aggregate all telemetry.
   * @param credentials  Per-request AWS keys from the Live Mode socket.
   *                     If null, falls back to .env or simulation.
   */
  async getAggregatedTelemetry(credentials?: PerRequestCredentials | null): Promise<TelemetryData> {
    const [health, latency, anomalies, load, compute, computeNodes, billingData] = await Promise.all([
      this.fetchGlobalHealth(),
      this.fetchNetworkLatency(),
      this.fetchActiveAnomalies(),
      this.fetchServerLoad(),
      this.fetchComputeMetrics(),
      this.awsService.getComputeNodes(credentials),
      this.awsService.getBillingData(credentials),
    ]);

    return {
      timestamp: Date.now(),
      globalHealth: health,
      networkLatency: latency,
      anomalies,
      serverLoad: load,
      cpuUsage: compute.cpu,
      memoryUsage: compute.memory,
      computeNodes,
      billingData,
    };
  }
}
