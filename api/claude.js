// Vercel Serverless Function: Anthropic Claude API 프록시
// POST /api/claude

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  if (!apiKey.startsWith('sk-ant-')) {
    return res.status(500).json({
      error: `API 키 형식이 올바르지 않습니다. "sk-ant-"로 시작해야 합니다. (현재: "${apiKey.substring(0, 10)}...")`,
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Anthropic returned non-JSON response:', responseText.substring(0, 500));
      return res.status(response.status || 500).json({
        error: {
          type: 'non_json_response',
          message: `Anthropic API 비정상 응답 (HTTP ${response.status}). 응답: ${responseText.substring(0, 200)}`,
        },
      });
    }

    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Claude API error:', err);
    return res.status(500).json({ error: { message: err.message } });
  }
}
