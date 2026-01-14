import crypto from "crypto";

const SHEETS = {
  annual: "annualOccurrences",
  weekendSub: "weekendSubHolidays",
  usedAnnual: "usedHolidays",
  usedSub: "usedSubHolidays"
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://camaguee.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const token = await getAccessToken();

    const result = {
      annualOccurrences: [],
      weekendSubHolidays: [],
      usedHolidays: [],
      usedSubHolidays: []
    };

    // 각 시트별로 데이터 가져오기
    for (const [key, sheetName] of Object.entries(SHEETS)) {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/${sheetName}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) continue; // 시트가 없어도 에러 안 나게

      const data = await response.json();
      const rows = data.values || [];

      // 헤더 행 제외 (첫 번째 행이 헤더라고 가정)
      const userRows = rows.slice(1).filter(row => row[0] === userId);

      if (key === "annual") {
        result.annualOccurrences = userRows.map(row => ({
          id: Number(row[1]),
          date: row[2],
          remaining: Number(row[3])
        }));
      } else if (key === "weekendSub") {
        result.weekendSubHolidays = userRows.map(row => ({
          date: row[1],
          weekday: row[2]
        }));
      } else if (key === "usedAnnual") {
        result.usedHolidays = userRows.map(row => ({
          date: row[1],
          weekday: row[2],
          amount: Number(row[3])
        }));
      } else if (key === "usedSub") {
        result.usedSubHolidays = userRows.map(row => ({
          date: row[1],
          weekday: row[2]
        }));
      }
    }

    res.status(200).json(result);  // 프론트에서 rows[0]으로 접근하도록
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load data" });
  }
}

// getAccessToken 함수는 이전과 동일 (생략)
async function getAccessToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
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

  const tokenData = await res.json();
  if (!tokenData.access_token) throw new Error("Failed to get access token");
  return tokenData.access_token;
}

