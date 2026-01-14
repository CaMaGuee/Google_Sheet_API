import crypto from "crypto";

export default async function handler(req, res) {
  // CORS 설정 (항상 맨 위에)
  res.setHeader("Access-Control-Allow-Origin", "https://camaguee.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // preflight 요청 처리
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const appsScriptUrl = "https://script.google.com/macros/s/AKfycbzbPz4sh9Hyamq4PvAnOzd1Q6n4o8rFKfbOeljmAE2UDwKoe3i2b7OV1P2gZqxhcbCA0Q/exec";

    console.log("[Vercel] Apps Script로 전송 시작");
    console.log("[Vercel] 보낼 데이터:", req.body);

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {})   // 빈 객체 방지
    });

    const result = await response.json();

    console.log("[Vercel] Apps Script 응답:", result);

    res.status(response.status || 200).json(result);

  } catch (err) {
    console.error("[Vercel Save Error]:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message || "서버 내부 오류" 
    });
  }
}



