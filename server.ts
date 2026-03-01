import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { exec } from "child_process";
import { TelemetryService } from "./src/services/telemetryService";
import db from "./src/services/db";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-interdictor-key";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json());

  // Auth endpoint using SQLite Database
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    
    try {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const match = bcrypt.compareSync(password, user.password);
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

  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.user.username} (${socket.data.user.role})`);

    // Real Command execution handler using child_process
    socket.on("execute_command", (data, callback) => {
      if (socket.data.user.role !== "admin") {
        return callback({ status: "error", message: "Unauthorized: Admin role required." });
      }

      console.log(`Command received from ${socket.data.user.username}: ${data.command}`);
      
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
