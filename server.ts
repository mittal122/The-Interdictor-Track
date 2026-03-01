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
import pool from "./src/services/db";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-interdictor-key";

// ── Security: Command Whitelist ──────────────────────────────────────
// Only commands in this list (or whose base binary matches) are allowed.
const COMMAND_WHITELIST = [
  'ping',
  'uptime',
  'whoami',
  'hostname',
  'systeminfo',
  'ipconfig',
  'npm run status',
  'node --version',
  'npm --version',
  'dir',
  'echo',
];

async function startServer() {
  const app = express();

  // ── HTTPS / HTTP Server Selection ────────────────────────────────
  let httpServer;
  const certPath = path.resolve('certs/cert.pem');
  const keyPath = path.resolve('certs/key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const sslOptions = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
    httpServer = https.createServer(sslOptions, app);
    console.log('🔒 HTTPS mode: SSL/TLS certificates loaded from certs/');
  } else {
    httpServer = createServer(app);
    console.log('⚠️  HTTP mode: No SSL certificates found in certs/. Run scripts/generate-certs.ps1 to enable HTTPS.');
  }

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = parseInt(process.env.PORT || '3000');

  app.use(express.json());

  // ── Auth endpoint using PostgreSQL ──────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
      return res.json({ token, user: { username: user.username, role: user.role } });
    } catch (err) {
      console.error("Database error during login:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Socket.io middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) return next(new Error("Authentication error"));
      socket.data.user = decoded;
      next();
    });
  });

  const telemetryService = new TelemetryService();
  const alertingWorker = new AlertingWorker();

  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.user.username} (${socket.data.user.role})`);

    // ── Command execution with whitelist enforcement ──────────────
    socket.on("execute_command", (data, callback) => {
      // Role check
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required." });
      }

      const trimmedCommand = data.command.trim();
      const baseCommand = trimmedCommand.split(/\s+/)[0].toLowerCase();

      // Whitelist check: match exact full command OR the base binary name
      const isWhitelisted = COMMAND_WHITELIST.some(
        (cmd) => cmd === trimmedCommand.toLowerCase() || cmd === baseCommand
      );

      if (!isWhitelisted) {
        console.warn(`🚫 BLOCKED command from ${socket.data.user.username}: ${data.command}`);
        return callback({
          status: "error",
          message: `SECURITY BLOCK: Command "${baseCommand}" is not on the approved whitelist. Allowed: ${COMMAND_WHITELIST.join(', ')}`
        });
      }

      console.log(`✅ Command approved from ${socket.data.user.username}: ${data.command}`);

      // Execute real backend command
      exec(data.command, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Command execution error: ${error.message}`);
          callback({ status: "error", message: stderr || error.message });
          return;
        }

        callback({ status: "success", message: stdout || "Command executed silently." });
      });
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.user.username}`);
    });
  });

  // Telemetry broadcast loop
  setInterval(async () => {
    try {
      const telemetryData = await telemetryService.getAggregatedTelemetry();
      io.emit("telemetry_update", telemetryData);

      // Push payload through alerting worker
      alertingWorker.checkThresholds(telemetryData).catch(console.error);
    } catch (error) {
      console.error("Failed to fetch telemetry data:", error);
    }
  }, 1000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  const protocol = fs.existsSync(certPath) ? 'https' : 'http';
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${protocol}://localhost:${PORT}`);
  });
}

startServer();
