// Vercel Serverless Function — handles /api/auth/register
// On Vercel there's no persistent DB, so registration is client-side only.
// This endpoint returns a helpful message directing the user to client-side registration.

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  return res.status(501).json({
    message: "Registration is handled client-side on Vercel deployments. Your account is stored in browser localStorage.",
  });
}
