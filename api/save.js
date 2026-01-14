import crypto from "crypto";

const SHEETS = {
  annual: "annualOccurrences",
  weekendSub: "weekendSubHolidays",
  usedAnnual: "usedHolidays",
  usedSub: "usedSubHolidays"
};

export default async function handler(req, res) {
  // CORS 헤더 설정 (매 요청마다 반드시 설정)
  res.setHeader("Access-Control-Allow-Origin", "https://camaguee.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS preflight 요청 처리 (CORS 에러의 핵심 해결)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const { userId, annualOccurrences = [], weekendSubHolidays = [], usedHolidays = [], usedSubHolidays = [] } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: "userId required" });
  }

  try {
    const token = await getAccessToken();

    // 1. 해당 userId의 기존 데이터 모두 삭제 (각 시트별)
    await clearUserData(token, SHEETS.annual, userId);
    await clearUserData(token, SHEETS.weekendSub, userId);
    await clearUserData(token, SHEETS.usedAnnual, userId);
    await clearUserData(token, SHEETS.usedSub, userId);

    // 2. 새 데이터 추가
    await appendRows(token, SHEETS.annual, annualOccurrences.map(item => [
      userId,
      item.id ?? "",
      item.date ?? "",
      Number(item.remaining) || 0
    ]));

    await appendRows(token, SHEETS.weekendSub, weekendSubHolidays.map(item => [
      userId,
      item.date ?? "",
      item.weekday ?? ""
    ]));

    await appendRows(token, SHEETS.usedAnnual, usedHolidays.map(item => [
      userId,
      item.date ?? "",
      item.weekday ?? "",
      Number(item.amount) || 0
    ]));

    await appendRows(token, SHEETS.usedSub, usedSubHolidays.map(item => [
      userId,
      item.date ?? "",
      item.weekday ?? ""
    ]));

    res.status(200).json({ success: true, message: "저장 완료" });

  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ success: false, error: "저장 중 오류 발생" });
  }
}

// 해당 userId 행들 삭제 (헤더는 유지)
async function clearUserData(token, sheetName, userId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/${sheetName}`;
  
  const getRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!getRes.ok) {
    console.error(`Read failed for ${sheetName}: ${getRes.status}`);
    return;
  }

  const data = await getRes.json();
  const rows = data.values || [];

  // 헤더 유지 + userId가 다른 행만 남김
  const keepRows = rows.filter((row, index) => {
    if (index === 0) return true; // 헤더 행
    return row[0] !== userId;
  });

  // 변경된 내용으로 덮어쓰기
  const putRes = await fetch(
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

  if (!putRes.ok) {
    console.error(`Clear PUT failed for ${sheetName}: ${putRes.status}`);
  }
}

// 행들 추가
async function appendRows(token, sheetName, rowsData) {
  if (rowsData.length === 0) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/${sheetName}:append?valueInputOption=RAW`;
  
  const appendRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: rowsData })
  });

  if (!appendRes.ok) {
    console.error(`Append failed for ${sheetName}: ${appendRes.status}`);
  }
}

// Access Token 생성 함수
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

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("Failed to obtain access token");
  }
  return tokenData.access_token;
}
