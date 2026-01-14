import crypto from "crypto";

const SHEETS = {
  annual: "annualOccurrences",
  weekendSub: "weekendSubHolidays",
  usedAnnual: "usedHolidays",
  usedSub: "usedSubHolidays"
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://camaguee.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const body = req.body;
  const { userId, annualOccurrences, weekendSubHolidays, usedHolidays, usedSubHolidays } = body;

  if (!userId) return res.status(400).json({ success: false, error: "userId required" });

  try {
    const token = await getAccessToken();

    // 1. 기존 데이터 모두 삭제 (userId 기준)
    for (const sheetName of Object.values(SHEETS)) {
      await clearUserData(token, sheetName, userId);
    }

    // 2. 새 데이터 전체 추가
    await appendRows(token, SHEETS.annual, userId, annualOccurrences?.map(item => [
      userId,
      item.id,
      item.date,
      item.remaining
    ]) || []);

    await appendRows(token, SHEETS.weekendSub, userId, weekendSubHolidays?.map(item => [
      userId,
      item.date,
      item.weekday
    ]) || []);

    await appendRows(token, SHEETS.usedAnnual, userId, usedHolidays?.map(item => [
      userId,
      item.date,
      item.weekday,
      item.amount
    ]) || []);

    await appendRows(token, SHEETS.usedSub, userId, usedSubHolidays?.map(item => [
      userId,
      item.date,
      item.weekday
    ]) || []);

    res.status(200).json({ success: true, message: "Data saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Save failed" });
  }
}

// userId에 해당하는 모든 행 삭제 (실제로는 전체 읽고 다시 쓰기)
async function clearUserData(token, sheetName, userId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/${sheetName}`;
  const getRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await getRes.json();
  const rows = data.values || [];

  const keepRows = rows.filter((row, index) => index === 0 || row[0] !== userId); // 헤더는 유지

  if (keepRows.length === rows.length) return; // 변화 없으면 스킵

  await fetch(
    `${url}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values: keepRows })
    }
  );
}

// 여러 행을 한 번에 추가
async function appendRows(token, sheetName, userId, rowsData) {
  if (rowsData.length === 0) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/${sheetName}:append?valueInputOption=RAW`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: rowsData })
  });
}

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
