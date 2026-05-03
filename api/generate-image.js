// Vercel Serverless Function: Google AI 이미지 생성 프록시
// POST /api/generate-image
// Body: { model: "nanoBanana" | "imagen3", prompt: string }

// fetch with extended timeout (default Node.js fetch is 30s, we need ~3min for image gen)
async function fetchWithTimeout(url, options, timeoutMs = 180000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Google API 에러를 사용자 친화적 메시지로 변환
function buildFriendlyError(googleError, status) {
  const rawMessage = googleError?.message || '';
  const errorCode = googleError?.code || status;

  // Quota 초과 (429)
  if (status === 429 || rawMessage.includes('quota') || rawMessage.includes('Quota')) {
    return '🚫 사용 한도 초과\n\n[원인]\nGoogle AI의 일일/분당 사용 한도를 초과했거나, 무료 티어 한도(0회)가 적용된 상태입니다.\n\n[조치 방법]\n1) Google Cloud Console에서 결제(Billing) 활성화 확인: https://console.cloud.google.com/billing\n2) 결제 활성화는 했지만 5~10분 후 다시 시도 (반영 시간 필요)\n3) 짧은 시간에 너무 많이 호출했다면 1분 후 재시도';
  }

  // 인증/키 오류 (401, 403)
  if (status === 401 || status === 403 || rawMessage.includes('API key') || rawMessage.includes('PERMISSION_DENIED')) {
    return '🔑 인증 실패\n\n[원인]\nGoogle API 키가 유효하지 않거나, 해당 모델에 대한 권한이 없습니다.\n\n[조치 방법]\n1) .env 파일의 GOOGLE_API_KEY가 올바른지 확인\n2) https://aistudio.google.com/apikey 에서 키 상태 확인 (활성화/만료 여부)\n3) 키가 속한 프로젝트에 결제가 연결되어 있는지 확인\n4) 키 변경 후 백엔드 서버 재시작 (Ctrl+C → vercel dev)';
  }

  // 모델 없음 (404)
  if (status === 404 || rawMessage.includes('not found') || rawMessage.includes('NOT_FOUND')) {
    return '🔍 모델을 찾을 수 없음\n\n[원인]\n요청한 이미지 생성 모델이 더 이상 사용 불가능하거나 이름이 변경되었습니다.\n\n[조치 방법]\n1) 다른 모델로 시도 (Nano Banana ↔ Imagen 3)\n2) 개발자에게 모델 이름 업데이트 요청\n\n[기술 상세]\n' + rawMessage;
  }

  // 잘못된 요청 (400)
  if (status === 400 || rawMessage.includes('INVALID_ARGUMENT')) {
    return '⚠️ 요청 형식 오류\n\n[원인]\n프롬프트에 모델이 처리할 수 없는 내용이 포함되어 있거나, 안전성 필터에 걸렸을 수 있습니다.\n\n[조치 방법]\n1) "다시 시도" 버튼 클릭 (프롬프트가 자동으로 재생성됨)\n2) 다른 모델로 시도\n\n[기술 상세]\n' + rawMessage;
  }

  // 서버 오류 (500, 503)
  if (status >= 500) {
    return '🛠 Google 서버 일시 오류\n\n[원인]\nGoogle 이미지 생성 서버에 일시적 문제가 발생했습니다. 우리 코드의 문제가 아닙니다.\n\n[조치 방법]\n1) "다시 시도" 버튼 클릭 (보통 재시도하면 성공)\n2) 반복 실패 시 5~10분 후 재시도\n3) Google 상태 페이지 확인: https://status.cloud.google.com';
  }

  // 기타 - 원본 메시지 그대로
  return `❓ 알 수 없는 오류 (HTTP ${status})\n\n[기술 상세]\n${rawMessage || '응답에 에러 메시지가 없습니다.'}\n\n[조치 방법]\n"다시 시도" 버튼을 눌러보세요. 반복 발생 시 다른 모델로 시도해보세요.`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { model, prompt } = req.body || {};
  if (!model || !prompt) {
    return res.status(400).json({ error: 'model과 prompt가 필요합니다.' });
  }

  try {
    let imageData = null;
    let mimeType = 'image/png';

    if (model === 'nanoBanana') {
      // === Gemini 2.5 Flash Image (Nano Banana) ===
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }, 180000); // 3분

      const data = await response.json();
      if (!response.ok || data.error) {
        return res.status(response.status || 500).json({
          error: buildFriendlyError(data.error, response.status),
          details: data,
        });
      }

      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p) => p.inlineData?.data);
      if (!imagePart) {
        return res.status(500).json({
          error: '🖼 이미지 생성 결과 없음\n\n[원인]\n모델이 이미지 대신 텍스트만 응답했습니다. 안전성 필터에 의해 차단되었거나, 프롬프트가 이미지 생성에 부적합했을 수 있습니다.\n\n[조치 방법]\n1) "다시 시도" 버튼 클릭\n2) 다른 모델로 시도',
          rawResponse: data,
        });
      }
      imageData = imagePart.inlineData.data;
      mimeType = imagePart.inlineData.mimeType || 'image/png';

    } else if (model === 'imagen3') {
      // === Imagen 4 (latest) ===
      const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '3:4',
          },
        }),
      }, 180000); // 3분

      const data = await response.json();
      if (!response.ok || data.error) {
        return res.status(response.status || 500).json({
          error: buildFriendlyError(data.error, response.status),
          details: data,
        });
      }

      const prediction = data.predictions?.[0];
      if (!prediction?.bytesBase64Encoded) {
        return res.status(500).json({
          error: '🖼 이미지 생성 결과 없음\n\n[원인]\n모델이 이미지를 반환하지 않았습니다. 안전성 필터 또는 프롬프트 문제일 수 있습니다.\n\n[조치 방법]\n1) "다시 시도" 버튼 클릭\n2) 다른 모델로 시도',
          rawResponse: data,
        });
      }
      imageData = prediction.bytesBase64Encoded;
      mimeType = prediction.mimeType || 'image/png';

    } else {
      return res.status(400).json({ error: `지원하지 않는 모델: ${model}` });
    }

    return res.status(200).json({
      success: true,
      imageDataUrl: `data:${mimeType};base64,${imageData}`,
    });

  } catch (err) {
    console.error('Image generation error:', err);
    
    // Timeout 에러는 더 친절한 메시지로
    if (err.name === 'AbortError' || err.message?.includes('timeout')) {
      const isCloudDeployment = !!process.env.VERCEL_ENV; // Vercel 클라우드 배포 여부
      
      let message;
      if (isCloudDeployment) {
        message = '⏱ 이미지 생성 시간 초과 (Vercel 무료 플랜 60초 한계)\n\n[원인]\nVercel 무료 플랜은 서버 함수가 60초 안에 응답해야 합니다. 그런데 Google 이미지 생성은 보통 30~90초 걸려서, 일부 요청이 60초 한계에 걸려 자동 중단됩니다. 이는 우리 코드 문제가 아니라 인프라 제약입니다.\n\n[근본적 해결책 - 운영팀 작업]\n1) Vercel Pro 플랜 업그레이드 ($20/월, 함수 실행 시간 300초까지 가능)\n2) 다른 호스팅으로 이전 (AWS Lambda 15분, Cloud Run 60분 등)\n3) 비동기 작업 큐 도입 (이미지 생성을 백그라운드에서 처리)\n\n[임시 대응 - 사용자]\n1) "다시 시도" 버튼 클릭 (운이 좋으면 60초 안에 응답할 수도)\n2) 다른 모델로 시도 (Imagen 4가 보통 더 빠름)';
      } else {
        message = '⏱ 이미지 생성 시간 초과 (3분)\n\n[원인]\nGoogle 이미지 생성 서버가 3분 이내에 응답을 완료하지 못했습니다. 일시적 서버 과부하 또는 네트워크 지연으로 추정됩니다.\n\n[조치 방법]\n1) "다시 시도" 버튼 클릭\n2) 반복 발생 시 다른 모델로 시도\n3) 잠시 후(5~10분) 재시도';
      }
      
      return res.status(504).json({ error: message });
    }
    
    return res.status(500).json({
      error: err.message || '이미지 생성 중 알 수 없는 오류',
    });
  }
}
