import crypto from "crypto";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://camaguee.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "userId missing" });

  const token = await getAccessToken();

  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/Sheet1`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await r.json();
  res.status(200).json(data);
}

async function getAccessToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({
    alg: "RS256",
    typ: "JWT"
  })).toString("base64url");

  const claim = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  })).toString("base64url");

  const data = `${header}.${claim}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data);

  const signature = sign.sign(key.private_key, "base64url");

  const jwt = `${data}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  return (await res.json()).access_token;
}
