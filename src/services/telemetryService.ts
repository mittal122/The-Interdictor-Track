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
  storageArrays?: any[] | null;
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

  async fetchGlobalHealth(credentials?: PerRequestCredentials | null, nodes?: any[] | null): Promise<number> {
    if (credentials && nodes !== undefined && nodes !== null) {
      if (nodes.length === 0) return 100; // 100% health if no nodes
      const runningCount = nodes.filter(n => n.status === 'running').length;
      return (runningCount / nodes.length) * 100;
    }
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=global_health_percentage`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.data?.result?.length > 0) return parseFloat(data.data.result[0].value[1]);
      throw new Error('No data');
    } catch { return this.simulateHealth(); }
  }

  async fetchNetworkLatency(credentials?: PerRequestCredentials | null): Promise<number> {
    if (credentials) {
      const liveLatency = await this.awsService.measureNetworkLatency(credentials);
      if (liveLatency !== null) return liveLatency;
    }
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=network_latency_ms`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.data?.result?.length > 0) return parseFloat(data.data.result[0].value[1]);
      throw new Error('No data');
    } catch { return this.simulateLatency(); }
  }

  async fetchActiveAnomalies(credentials?: PerRequestCredentials | null): Promise<Anomaly[]> {
    if (credentials) {
      // Create a fake anomaly array just the right size of the GuardDuty count for the overview dashboard metric
      const count = await this.awsService.getGuardDutyAnomalies(credentials) || 0;
      return Array.from({ length: count }, (_, i) => ({
        id: `AWS-GD-${Date.now().toString(36).toUpperCase()}-${i}`,
        lat: 0, lng: 0, severity: 'HIGH'
      }));
    }
    try {
      const res = await fetch(`${process.env.CLOUDWATCH_URL || 'http://localhost:8080'}/api/v1/anomalies/active`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.anomalies?.length > 0) return data.anomalies;
      throw new Error('No data');
    } catch { return this.simulateAnomalies(); }
  }

  async fetchServerLoad(credentials?: PerRequestCredentials | null, nodes?: any[] | null): Promise<{ region: string; load: number }[]> {
    if (credentials && nodes !== undefined && nodes !== null) {
      if (nodes.length === 0) return [];
      // Group by region to calculate percentage representation of running nodes
      const runningNodes = nodes.filter(n => n.status === 'running');
      if (runningNodes.length === 0) return [];

      const regionCounts = runningNodes.reduce((acc, node) => {
        acc[node.region] = (acc[node.region] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return Object.entries(regionCounts).map(([region, count]) => ({
        region,
        load: (count as number / runningNodes.length) * 100
      }));
    }
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=regional_server_load`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.data?.result?.length > 0)
        return data.data.result.map((r: any) => ({ region: r.metric.region, load: parseFloat(r.value[1]) }));
      throw new Error('No data');
    } catch { return this.simulateServerLoad(); }
  }

  async fetchComputeMetrics(credentials?: PerRequestCredentials | null): Promise<{ cpu: number; memory: number }> {
    if (credentials) {
      const cpu = await this.awsService.getCloudWatchCpu(credentials) || 0;
      // AWS SDK Memory metrics are notoriously complex, requiring CloudWatch Agent. Simulating memory relative to CPU
      const memory = cpu > 0 ? Math.min(cpu + (Math.random() * 20 - 10), 100) : 0;
      return { cpu, memory };
    }
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
    const computeNodes = await this.awsService.getComputeNodes(credentials);
    const billingData = await this.awsService.getBillingData(credentials);
    const storageArrays = await this.awsService.getStorageVolumes(credentials);

    const [health, latency, anomalies, load, compute] = await Promise.all([
      this.fetchGlobalHealth(credentials, computeNodes),
      this.fetchNetworkLatency(credentials),
      this.fetchActiveAnomalies(credentials),
      this.fetchServerLoad(credentials, computeNodes),
      this.fetchComputeMetrics(credentials),
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
      storageArrays,
    };
  }
}
