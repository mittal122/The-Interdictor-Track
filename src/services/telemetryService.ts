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
}

export class TelemetryService {
  private prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  private cloudwatchUrl = process.env.CLOUDWATCH_URL || 'http://localhost:8080';

  async fetchGlobalHealth(): Promise<number> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=global_health_percentage`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return parseFloat(data.data.result[0].value[1]);
    } catch (error) {
      // Fallback to 0 if the live API is unreachable
      return 0;
    }
  }

  async fetchNetworkLatency(): Promise<number> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=network_latency_ms`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return parseFloat(data.data.result[0].value[1]);
    } catch (error) {
      return 0;
    }
  }

  async fetchActiveAnomalies(): Promise<Anomaly[]> {
    try {
      const res = await fetch(`${this.cloudwatchUrl}/api/v1/anomalies/active`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.anomalies;
    } catch (error) {
      return [];
    }
  }

  async fetchServerLoad(): Promise<{ region: string; load: number }[]> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=regional_server_load`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.data.result.map((r: any) => ({
        region: r.metric.region,
        load: parseFloat(r.value[1])
      }));
    } catch (error) {
      return [
        { region: "US-East", load: 0 },
        { region: "US-West", load: 0 },
        { region: "EU-Central", load: 0 },
        { region: "AP-South", load: 0 },
        { region: "AP-East", load: 0 },
      ];
    }
  }

  async fetchComputeMetrics(): Promise<{ cpu: number; memory: number }> {
    try {
      const res = await fetch(`${this.prometheusUrl}/api/v1/query?query=compute_metrics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        cpu: parseFloat(data.data.result.find((r: any) => r.metric.type === 'cpu').value[1]),
        memory: parseFloat(data.data.result.find((r: any) => r.metric.type === 'memory').value[1]),
      };
    } catch (error) {
      return { cpu: 0, memory: 0 };
    }
  }

  async getAggregatedTelemetry(): Promise<TelemetryData> {
    const [health, latency, anomalies, load, compute] = await Promise.all([
      this.fetchGlobalHealth(),
      this.fetchNetworkLatency(),
      this.fetchActiveAnomalies(),
      this.fetchServerLoad(),
      this.fetchComputeMetrics(),
    ]);

    return {
      timestamp: Date.now(),
      globalHealth: health,
      networkLatency: latency,
      anomalies: anomalies,
      serverLoad: load,
      cpuUsage: compute.cpu,
      memoryUsage: compute.memory,
    };
  }
}
