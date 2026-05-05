// Vercel Serverless Function — handles /api/auth/login
// Uses client-side compatible auth (no bcrypt, no DB — demo mode only)

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-interdictor-key";

// Demo users (same as client-side fallback)
const DEMO_USERS = [
  { username: "admin", password: "admin", role: "admin" },
  { username: "viewer", password: "viewer", role: "viewer" },
];

function createToken(payload) {
  // Simple base64 JWT-like token (Vercel doesn't have jsonwebtoken without full install)
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
    })
  );
  const signature = btoa(JWT_SECRET.slice(0, 10));
  return `${header}.${body}.${signature}`;
}

export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Parse body — Vercel auto-parses JSON for serverless functions
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  // Check demo users
  const user = DEMO_USERS.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const token = createToken({ username: user.username, role: user.role });

  return res.status(200).json({
    token,
    user: { username: user.username, role: user.role },
  });
}
