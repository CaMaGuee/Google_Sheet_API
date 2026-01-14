// ... (기존 import, CORS, OPTIONS 등은 그대로)

// userId에 해당하는 행들만 삭제하고 헤더는 유지
async function clearUserData(token, sheetName, userId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/${sheetName}`;
  
  const getRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!getRes.ok) {
    console.error(`Failed to read ${sheetName}`);
    return;
  }

  const data = await getRes.json();
  const rows = data.values || [];

  // 헤더는 유지, userId가 일치하는 행만 필터링해서 제외
  const keepRows = rows.filter((row, index) => {
    if (index === 0) return true; // 헤더 행은 항상 유지
    return row[0] !== userId;
  });

  // 변화가 없을 때는 스킵해도 되지만, 안전하게 항상 PUT
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

// 여러 행 append (기존과 동일)
async function appendRows(token, sheetName, rowsData) {
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

export default async function handler(req, res) {
  // ... CORS, OPTIONS, method 체크 등 기존 코드 유지

  const { userId, annualOccurrences = [], weekendSubHolidays = [], usedHolidays = [], usedSubHolidays = [] } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: "userId required" });
  }

  try {
    const token = await getAccessToken();

    // 1. 모든 시트에서 해당 userId 데이터 완전 삭제
    await clearUserData(token, SHEETS.annual, userId);
    await clearUserData(token, SHEETS.weekendSub, userId);
    await clearUserData(token, SHEETS.usedAnnual, userId);
    await clearUserData(token, SHEETS.usedSub, userId);

    // 2. 새 데이터만 추가
    await appendRows(token, SHEETS.annual, annualOccurrences.map(item => [
      userId,
      item.id ?? "",          // id가 없으면 빈 문자열
      item.date ?? "",
      item.remaining ?? 0
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
      item.amount ?? 0
    ]));

    await appendRows(token, SHEETS.usedSub, usedSubHolidays.map(item => [
      userId,
      item.date ?? "",
      item.weekday ?? ""
    ]));

    res.status(200).json({ success: true, message: "저장 완료 (기존 데이터 삭제 후 재저장)" });

  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ success: false, error: "저장 중 오류 발생" });
  }
}
