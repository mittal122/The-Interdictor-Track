import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { exec } from "child_process";
import dotenv from "dotenv";
import { TelemetryService } from "./src/services/telemetryService";
import { AlertingWorker } from "./src/services/alertingWorker";
import { runAnalysis } from "./src/services/nimAnalystService";
import { AwsIntegrationService } from "./src/services/awsIntegrationService";
import { PerRequestCredentials } from "./src/services/awsIntegrationService";
import { getFullAccountInfrastructure } from "./src/services/awsInfrastructureEngine";
import pool from "./src/services/db";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-interdictor-key";

const COMMAND_WHITELIST = [
  'ping', 'uptime', 'whoami', 'hostname', 'systeminfo',
  'ipconfig', 'npm run status', 'node --version', 'npm --version', 'dir', 'echo',
];

async function startServer() {
  const app = express();

  // ── HTTPS / HTTP Server Selection ────────────────────────────────────────
  let httpServer;
  const certPath = path.resolve('certs/cert.pem');
  const keyPath = path.resolve('certs/key.pem');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    httpServer = https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app);
    console.log('🔒 HTTPS mode: SSL/TLS certificates loaded from certs/');
  } else {
    httpServer = createServer(app);
    console.log('⚠️  HTTP mode: No SSL certs found. Run scripts/generate-certs.ps1 to enable HTTPS.');
  }

  const io = new Server(httpServer, { cors: { origin: "*", methods: ["GET", "POST"] } });
  const PORT = parseInt(process.env.PORT || '3000');

  app.use(express.json());

  // ── SECURITY: Credential Masking Middleware ───────────────────────────────
  // Registered AFTER the validate endpoint (see below) intentionally.
  // All other routes use masked headers, so credentials never appear in logs.
  const credentialHeaders = ['x-cloud-access-key', 'x-cloud-secret-key'];

  // ── /api/cloud/validate — registered BEFORE the masking middleware ────────
  // This must be first so the raw header values are readable.
  const awsValidatorService = new AwsIntegrationService();
  app.get("/api/cloud/validate", async (req, res) => {
    const rawKey = req.headers['x-cloud-access-key'] as string;
    const rawSecret = req.headers['x-cloud-secret-key'] as string;
    const region = (req.headers['x-cloud-region'] as string) || 'us-east-1';

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
      jwt.verify(authHeader.slice(7), JWT_SECRET);

      if (!rawKey || !rawSecret) {
        return res.status(400).json({ message: "Cloud credentials missing from request headers." });
      }

      await awsValidatorService.validateCredentials({
        awsAccessKeyId: rawKey,
        awsSecretKey: rawSecret,
        awsRegion: region,
      });

      return res.json({ valid: true, region });
    } catch (err: any) {
      if (err.name === "JsonWebTokenError") return res.status(401).json({ message: "Invalid token" });
      return res.status(400).json({ message: err.message || "Credential validation failed" });
    }
  });

  // NOW register the masking middleware (all routes below this point get masked headers)
  app.use((req, _res, next) => {
    for (const h of credentialHeaders) {
      if (req.headers[h]) req.headers[h] = '[REDACTED]';
    }
    next();
  });

  // ── Auth endpoint ─────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ message: "Invalid credentials" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Invalid credentials" });

      const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
      return res.json({ token, user: { username: user.username, role: user.role } });
    } catch (err) {
      console.error("DB login error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── NVIDIA NIM AI Analyst ─────────────────────────────────────────────────
  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
      jwt.verify(authHeader.slice(7), JWT_SECRET);
      const analysis = await runAnalysis(req.body);
      return res.json(analysis);
    } catch (err: any) {
      if (err.name === "JsonWebTokenError") return res.status(401).json({ message: "Invalid token" });
      console.error("AI Analyst error:", err);
      return res.status(500).json({ message: "Analysis service error" });
    }
  });

  // ── Socket.IO Authentication Middleware ───────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) return next(new Error("Authentication error"));
      socket.data.user = decoded;

      // Store cloud credentials per-socket if provided (Live Mode)
      const creds = socket.handshake.auth.cloudCredentials;
      if (creds?.awsAccessKeyId && creds?.awsSecretKey) {
        socket.data.cloudCredentials = creds as PerRequestCredentials;
        console.log(`[LIVE] Socket authenticated with AWS credentials (region: ${creds.awsRegion || 'us-east-1'})`);
      } else {
        socket.data.cloudCredentials = null;
        console.log(`[DEMO] Socket authenticated without cloud credentials`);
      }
      next();
    });
  });

  const telemetryService = new TelemetryService();
  const alertingWorker = new AlertingWorker();

  // ── Per-socket telemetry intervals (Live Mode only) ───────────────────────
  // Each connecting Live Mode socket gets its own 2-second real-data interval.
  // Demo sockets are NOT added here — they use the frontend's local generator.
  const socketIntervals = new Map<string, ReturnType<typeof setInterval>>();

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.user.username} (${socket.data.user.role})`);

    const userCreds: PerRequestCredentials | null = socket.data.cloudCredentials;

    if (userCreds) {
      // ── LIVE MODE: emit personalized AWS telemetry to this socket only ──
      const emitLive = async () => {
        try {
          const data = await telemetryService.getAggregatedTelemetry(userCreds);
          socket.emit("telemetry_update", data);
          alertingWorker.checkThresholds(data).catch(console.error);
        } catch (err) {
          console.error("[LIVE] Telemetry error for", socket.data.user.username, err);
        }
      };

      emitLive(); // send immediately on connect
      const interval = setInterval(emitLive, 2000);
      socketIntervals.set(socket.id, interval);
    }
    // No else block — Demo sockets use frontend-generated data, no server emission needed.

    // ── Command execution ─────────────────────────────────────────────────
    socket.on("execute_command", (data, callback) => {
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required." });
      }
      const trimmedCommand = data.command.trim();
      const baseCommand = trimmedCommand.split(/\s+/)[0].toLowerCase();
      const isWhitelisted = COMMAND_WHITELIST.some(
        cmd => cmd === trimmedCommand.toLowerCase() || cmd === baseCommand
      );
      if (!isWhitelisted) {
        console.warn(`🚫 BLOCKED command from ${socket.data.user.username}: ${data.command}`);
        return callback({
          status: "error",
          message: `SECURITY BLOCK: "${baseCommand}" is not whitelisted. Allowed: ${COMMAND_WHITELIST.join(', ')}`
        });
      }
      exec(data.command, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) return callback({ status: "error", message: stderr || error.message });
        callback({ status: "success", message: stdout || "Command executed silently." });
      });
    });

    // ── AWS EC2 Active Management ─────────────────────────────────────────
    socket.on("launch_ec2_node", async (data, callback) => {
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required to create AWS instances." });
      }
      if (!userCreds) {
        return callback({ status: "error", message: "Live Mode required. Connect with full AWS Credentials first." });
      }

      try {
        await awsValidatorService.launchEc2Instance(userCreds, data.region || "us-east-1");
        callback({ status: "success", message: `Successfully requested new EC2 instance in ${data.region}` });

        // Force an immediate telemetry refresh to show the new 'pending' node
        const freshData = await telemetryService.getAggregatedTelemetry(userCreds);
        socket.emit("telemetry_update", freshData);
      } catch (err: any) {
        console.error("EC2 Launch Error:", err);
        callback({ status: "error", message: `Launch Failed: ${err.message}` });
      }
    });

    socket.on("terminate_ec2_node", async (data, callback) => {
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required to terminate AWS instances." });
      }
      if (!userCreds) {
        return callback({ status: "error", message: "Live Mode required. Connect with full AWS Credentials first." });
      }
      if (!data.instanceId || !data.region) {
        return callback({ status: "error", message: "Region and InstanceId required." });
      }

      try {
        await awsValidatorService.terminateEc2Instance(userCreds, data.region, data.instanceId);
        callback({ status: "success", message: `Termination signal sent for ${data.instanceId}` });

        // Force an immediate telemetry refresh to show the node moving to 'shutting-down'
        const freshData = await telemetryService.getAggregatedTelemetry(userCreds);
        socket.emit("telemetry_update", freshData);
      } catch (err: any) {
        console.error("EC2 Terminate Error:", err);
        callback({ status: "error", message: `Termination Failed: ${err.message}` });
      }
    });

    // ── On-Demand Paid AWS APIs ─────────────────────────────────────────
    socket.on("fetch_billing_data", async (callback) => {
      if (!userCreds) return callback({ status: "error", message: "Live Mode required." });
      try {
        const cost = await telemetryService.fetchBillingData(userCreds);
        callback({ status: "success", data: cost });
      } catch (err: any) {
        console.error("Billing Fetch Error:", err);
        callback({ status: "error", message: err.message });
      }
    });

    socket.on("fetch_cpu_data", async (callback) => {
      if (!userCreds) return callback({ status: "error", message: "Live Mode required." });
      try {
        const compute = await telemetryService.fetchComputeMetrics(userCreds);
        callback({ status: "success", data: compute.cpu });
      } catch (err: any) {
        console.error("CPU Fetch Error:", err);
        callback({ status: "error", message: err.message });
      }
    });

    // ── EC2 Stop / Start ──────────────────────────────────────────────────
    socket.on("stop_ec2_node", async (data, callback) => {
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required." });
      }
      if (!userCreds) {
        return callback({ status: "error", message: "Live Mode required." });
      }
      if (!data.instanceId || !data.region) {
        return callback({ status: "error", message: "Region and InstanceId required." });
      }
      try {
        await awsValidatorService.stopEc2Instance(userCreds, data.region, data.instanceId);
        callback({ status: "success", message: `Stop signal sent for ${data.instanceId}` });
        const freshData = await telemetryService.getAggregatedTelemetry(userCreds);
        socket.emit("telemetry_update", freshData);
      } catch (err: any) {
        console.error("EC2 Stop Error:", err);
        callback({ status: "error", message: `Stop Failed: ${err.message}` });
      }
    });

    socket.on("start_ec2_node", async (data, callback) => {
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required." });
      }
      if (!userCreds) {
        return callback({ status: "error", message: "Live Mode required." });
      }
      if (!data.instanceId || !data.region) {
        return callback({ status: "error", message: "Region and InstanceId required." });
      }
      try {
        await awsValidatorService.startEc2Instance(userCreds, data.region, data.instanceId);
        callback({ status: "success", message: `Start signal sent for ${data.instanceId}` });
        const freshData = await telemetryService.getAggregatedTelemetry(userCreds);
        socket.emit("telemetry_update", freshData);
      } catch (err: any) {
        console.error("EC2 Start Error:", err);
        callback({ status: "error", message: `Start Failed: ${err.message}` });
      }
    });
    // ── Full Account Infrastructure Map ────────────────────────────────────
    socket.on("fetch_full_account_map", async (callback) => {
      if (!userCreds) return callback({ status: "error", message: "Live Mode required." });
      try {
        console.log("[INFRA] Full account scan requested...");
        const infraMap = await getFullAccountInfrastructure(userCreds);
        if (!infraMap) return callback({ status: "error", message: "Failed to scan infrastructure." });
        callback({ status: "success", data: infraMap });
      } catch (err: any) {
        console.error("Infrastructure Scan Error:", err);
        callback({ status: "error", message: err.message });
      }
    });

    // ── Delete Orphaned Resources ─────────────────────────────────────────
    socket.on("delete_infrastructure_resource", async (data, callback) => {
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required to delete resources." });
      }
      if (!userCreds) {
        return callback({ status: "error", message: "Live Mode required." });
      }
      if (!data.id || !data.type || !data.region) {
        return callback({ status: "error", message: "Region, Type, and ID required to delete." });
      }

      console.log(`[INFRA] Deleting ${data.type} resource: ${data.id} in ${data.region}`);

      try {
        if (data.type === "ebs") {
          await awsValidatorService.deleteEbsVolume(userCreds, data.region, data.meta.volumeId);
        } else if (data.type === "sg") {
          await awsValidatorService.deleteSecurityGroup(userCreds, data.region, data.meta.sgId);
        } else if (data.type === "eip") {
          await awsValidatorService.releaseElasticIp(userCreds, data.region, data.meta.allocationId);
        } else {
          return callback({ status: "error", message: `Deletion not supported for type: ${data.type}` });
        }

        callback({ status: "success", message: `Successfully deleted ${data.id}` });

        // Refresh telemetry if needed
        const freshData = await telemetryService.getAggregatedTelemetry(userCreds);
        socket.emit("telemetry_update", freshData);
      } catch (err: any) {
        console.error("Resource Deletion Error:", err);
        callback({ status: "error", message: `Delete Failed: ${err.message}` });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.user.username}`);
      const interval = socketIntervals.get(socket.id);
      if (interval) {
        clearInterval(interval);
        socketIntervals.delete(socket.id);
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  const protocol = fs.existsSync(certPath) ? 'https' : 'http';
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🟢 Interdictor Command Center`);
    console.log(`   Server: ${protocol}://localhost:${PORT}`);
    console.log(`   Mode:   Demo (frontend-gen) + Live (per-socket AWS)\n`);
  });
}

startServer();
