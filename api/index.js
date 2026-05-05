// Vercel Serverless catch-all — handles unmatched /api/* routes
// Returns proper JSON 404 instead of index.html

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return res.status(404).json({
    message: "API endpoint not available in static deployment. Use the full backend (server.ts) for live features.",
    hint: "Authentication uses client-side fallback on Vercel. Dashboard runs in demo mode."
  });
}
