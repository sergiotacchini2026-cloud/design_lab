import React, { useState, useRef, useCallback } from 'react';
import { Upload, Image as ImageIcon, X, Copy, Check, Loader2, Sparkles, ChevronRight, ChevronLeft, FileText, Wand2, Clock, Trash2 } from 'lucide-react';

// 환경에 따라 API 베이스 URL 자동 결정
// - 로컬 개발: vite.config.js의 proxy가 /api를 백엔드로 보냄
// - 프로덕션: 같은 도메인의 /api 사용
const API_BASE = '/api';

const BRAND_GUIDE = `
Sergio Tacchini Brand DNA Guide

[Core Concept: Court-side Elegance]
세르지오 타키니는 테니스의 기품(Dignity)과 역동성(Activity)이 완벽한 균형을 이루는 웰니스 라이프스타일을 지향합니다.
단순한 스포츠 웨어를 넘어, 신체와 의복 사이의 최적화된 공간감을 통해 브랜드의 헤리티지를 현대적으로 정의합니다.
브랜드 철학: "Space, Not Scale" - 단순히 큰 옷이 아닌, 라이프스타일의 템포에 따른 신체와 의복 사이의 건강한 공간을 디자인.

[DNA Matrix by Line]

ACTIVE 라인 (액티브)
- 핵심 가치: Performance
- 소재 요철: Ultra-Smooth (최소)
- 주요 소재: 고밀도 기능성, 심리스
- 실루엣: Slim Fit
- 플리츠 간격: Narrow (촘촘함)
- 스커트 기장: Short
- Polo: 슬림 실루엣, 레이저 커팅 등 요철을 극도로 제한한 기술적 디자인
- Setup: 요철 없는 매끄러운 원단, 신체 실루엣을 단단하게 잡아주는 기능적 컴프레션 룩
- Skirt: 최상의 활동성을 위한 짧은 기장, 촘촘한 플리츠 간격으로 역동적 무드

ATHLEISURE 라인 (애슬레져)
- 핵심 가치: Wellness
- 소재 요철: Soft & Balanced (중간)
- 주요 소재: 프렌치 테리, 코튼 혼방
- 실루엣: Relaxed Comfort
- 플리츠 간격: Medium (보통)
- 스커트 기장: Midi-Short
- Polo: 몸과 옷 사이의 건강한 공간감을 가진 '릴렉스드 컴포트 핏', 과도한 오버핏 지양

CLASSIC 라인 (클래식)
- 핵심 가치: Heritage
- 소재 요철: Rich Texture (최대)
- 주요 소재: 알파카, 스웨터, 테리
- 실루엣: Semi-Over Fit
- 플리츠 간격: Wide (넓음)
- 스커트 기장: Standard
- Polo: 세미 오버 실루엣, 10-12mm 라운드 버튼 등 정교한 부자재와 니트 소재의 만남
- Setup: 풍부한 조직감의 니트/테리 소재, 우아한 볼륨감과 입체적 헤리티지 요소 강조
- Skirt: 안정적인 기장감, 넓은 플리츠 간격으로 정적인 상태에서도 기품 있는 드레이프
`;

// Claude API 호출 헬퍼 (백엔드 프록시 경유)
async function callClaude(body) {
  const response = await fetch(`${API_BASE}/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || err.error || `Claude API 오류 (${response.status})`);
  }
  return response.json();
}

// ============= localStorage 기반 History 관리 =============
const HISTORY_KEY = 'sergio_tacchini_history';

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('History 로드 실패:', e);
    return [];
  }
}

function saveToHistory(item) {
  try {
    const history = loadHistory();
    // 같은 id가 있으면 업데이트, 없으면 추가
    const idx = history.findIndex(h => h.id === item.id);
    // 저장용으로 큰 데이터 정리 (file 객체는 제외, previewUrl은 base64로 변환되어 있어야 함)
    const sanitized = {
      id: item.id,
      name: item.name,
      mediaType: item.mediaType,
      base64: item.base64,
      step1: item.step1,
      step2: item.step2,
      step3: item.step3,
      generatedImages: item.generatedImages || {},
      savedAt: Date.now(),
    };
    if (idx >= 0) {
      history[idx] = sanitized;
    } else {
      history.unshift(sanitized);
    }
    // 최대 50개까지만 보관 (용량 관리)
    const trimmed = history.slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('History 저장 실패:', e);
    // localStorage 용량 초과 시 가장 오래된 항목 삭제하고 재시도
    if (e.name === 'QuotaExceededError') {
      try {
        const history = loadHistory();
        const trimmed = history.slice(0, 20);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      } catch {}
    }
  }
}

function deleteFromHistory(id) {
  try {
    const history = loadHistory();
    const filtered = history.filter(h => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('History 삭제 실패:', e);
  }
}

// =========================================================

export default function ClothingDesignGenerator() {
  const [view, setView] = useState('main'); // 'main' | 'history' | 'detail'
  const [detailItem, setDetailItem] = useState(null);
  const [items, setItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // History 화면 진입 시 목록 로드
  React.useEffect(() => {
    if (view === 'history') {
      setHistoryItems(loadHistory());
    }
  }, [view]);

  const handleFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));

    const newItems = await Promise.all(imageFiles.map(async (file) => {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const previewUrl = URL.createObjectURL(file);
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file, previewUrl, base64,
        mediaType: file.type, name: file.name,
        status: 'pending',
        step1: null, step2: null, step3: null,
        error: null, currentStep: 0,
        generating: {}, generatedImages: {}, genError: {},
      };
    }));

    setItems(prev => [...prev, ...newItems]);
    newItems.forEach(item => processItem(item));
  }, []);

  const processItem = async (item) => {
    try {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'processing', currentStep: 1 } : it));

      // === Step 1: 의류 분석 ===
      const step1Data = await callClaude({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: item.mediaType, data: item.base64 } },
            { type: "text", text: `당신은 의류 디자인 전문가입니다. 이 의류 이미지를 분석해서 다음 항목을 한국어 JSON으로만 응답하세요. 다른 설명 없이 JSON만 출력. 코드 블록(\`\`\`)도 사용하지 마세요.

{
  "category": "카테고리 (예: 폴로, 셋업, 스커트, 자켓 등)",
  "style": "전반적 스타일 한 줄 묘사",
  "silhouette": "실루엣 (슬림/릴렉스/오버 등 핏 묘사)",
  "material": "소재 추정 및 요철감 묘사",
  "sewing": "봉재 특징 (스티치, 마감 등)",
  "details": "디테일 요소 (버튼, 카라, 패턴, 로고 위치 등)",
  "color": "주요 컬러"
}` }
          ]
        }]
      });
      const step1Text = step1Data.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
      const step1Json = JSON.parse(step1Text.replace(/^```json\s*|\s*```$/g, ''));

      setItems(prev => prev.map(it => it.id === item.id ? { ...it, step1: step1Json, currentStep: 2 } : it));

      // === Step 2: 브랜드 가이드 반영 ===
      const step2Data = await callClaude({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `다음은 Sergio Tacchini 브랜드 가이드입니다:

${BRAND_GUIDE}

다음은 분석된 의류 정보입니다:
${JSON.stringify(step1Json, null, 2)}

이 의류를 Sergio Tacchini 브랜드 DNA에 맞게 재해석해주세요. 다음 JSON 형식으로만 응답하세요. 코드 블록(\`\`\`) 없이 JSON만 출력.

{
  "recommendedLine": "Active 또는 Athleisure 또는 Classic 중 하나",
  "lineReason": "이 라인을 선택한 이유 (1-2문장)",
  "redesign": {
    "style": "브랜드 적용 후 스타일",
    "silhouette": "브랜드 적용 후 실루엣 (Slim Fit / Relaxed Comfort / Semi-Over Fit 명시)",
    "material": "브랜드 적용 후 소재 (요철감 레벨 명시)",
    "sewing": "브랜드 적용 후 봉재",
    "details": "브랜드 적용 후 디테일 (단추 사이즈, 카라 형태 등 구체적으로)",
    "color": "브랜드 적용 후 컬러"
  },
  "designPoints": ["핵심 변경 포인트 1", "포인트 2", "포인트 3"]
}`
        }]
      });
      const step2Text = step2Data.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
      const step2Json = JSON.parse(step2Text.replace(/^```json\s*|\s*```$/g, ''));

      setItems(prev => prev.map(it => it.id === item.id ? { ...it, step2: step2Json, currentStep: 3 } : it));

      // === Step 3: 이미지 생성 프롬프트 ===
      const step3Data = await callClaude({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `다음은 Sergio Tacchini 브랜드에 맞춰 재해석된 의류 디자인입니다:

원본 디자인 (Step 1):
${JSON.stringify(step1Json, null, 2)}

브랜드 적용 디자인 (Step 2):
카테고리: ${step1Json.category}
라인: ${step2Json.recommendedLine}
${JSON.stringify(step2Json.redesign, null, 2)}

==== Harness Prompting 가이드 (반드시 준수) ====

[가이드 1] 원본 디자인 보존 비율
- 원본 디자인의 핵심 요소를 30~50% 유지해야 합니다.
- 원본의 카테고리, 기본 형태, 주요 디테일(카라 형태, 봉제 라인, 패턴 등) 중 일부는 그대로 살리세요.
- 100% 새로운 디자인이 아닌, 원본을 브랜드 톤으로 재해석한 결과여야 합니다.
- 프롬프트에 "preserving the original [구체적 요소] from the reference" 같은 문구를 명시적으로 포함시키세요.

[가이드 2] 정면 앞/뒤 뷰 동시 생성
- 의류의 **정면(front view)과 후면(back view)을 한 이미지 안에 나란히** 배치하도록 명시하세요.
- 프롬프트에 "front view and back view side by side, both ghost mannequin shots" 같은 문구를 포함시키세요.
- 두 뷰 모두 동일한 흰 배경, 동일한 조명 조건, 동일한 의류로 명확히 표현되어야 합니다.

================================================

위 가이드를 모두 반영하여, 두 가지 모델용 영문 프롬프트를 만들어주세요. JSON으로만 응답. 코드 블록(\`\`\`) 없이.

1) "nanoBanana": Nano Banana (Gemini 2.5 Flash Image)용. "3D ghost mannequin product shot showing both front view and back view side by side of a [garment]..." 형식으로 시작. 자연어 풍부한 묘사. 80-120 단어. 흰 배경, 부드러운 스튜디오 조명, 의류만 공중에 떠있는 형태, 원본 보존 요소 명시, 앞뒤 뷰 명시.

2) "imagen3": Imagen 4용. 키워드 콤마 연결형. 50-70 단어. "front view back view, ghost mannequin, dual view" 등의 핵심 키워드 포함.

{
  "nanoBanana": "...",
  "imagen3": "..."
}`
        }]
      });
      const step3Text = step3Data.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
      const step3Json = JSON.parse(step3Text.replace(/^```json\s*|\s*```$/g, ''));

      setItems(prev => prev.map(it => it.id === item.id ? { ...it, step3: step3Json, status: 'done', currentStep: 4 } : it));

      // History에 자동 저장 (Step 3 완료 시점)
      saveToHistory({
        ...item,
        step1: step1Json,
        step2: step2Json,
        step3: step3Json,
      });

    } catch (err) {
      console.error(err);
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'error', error: err.message } : it));
    }
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const generateImage = async (itemId, model) => {
    const item = items.find(it => it.id === itemId);
    if (!item || !item.step3) return;
    const prompt = model === 'nanoBanana' ? item.step3.nanoBanana : item.step3.imagen3;

    setItems(prev => prev.map(it => it.id === itemId ? {
      ...it,
      generating: { ...(it.generating || {}), [model]: true },
      genError: { ...(it.genError || {}), [model]: null }
    } : it));

    // 클라이언트 timeout: 환경별로 다르게 설정
    // - 로컬: 90초 (백엔드는 3분이지만 사용자 대기시간 고려)
    // - 클라우드 배포: 60초 (Vercel 무료 플랜 함수 한계와 동일)
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const CLIENT_TIMEOUT_MS = isLocalhost ? 90000 : 60000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `이미지 생성 실패 (${response.status})`);
      }

      setItems(prev => {
        const updated = prev.map(it => it.id === itemId ? {
          ...it,
          generatedImages: { ...(it.generatedImages || {}), [model]: data.imageDataUrl },
          generating: { ...(it.generating || {}), [model]: false }
        } : it);
        // 업데이트된 item을 history에도 반영
        const updatedItem = updated.find(it => it.id === itemId);
        if (updatedItem) saveToHistory(updatedItem);
        return updated;
      });

    } catch (err) {
      clearTimeout(timeoutId);
      console.error(err);

      // Timeout (AbortError) 케이스 친절한 메시지
      let errorMessage = err.message;
      if (err.name === 'AbortError') {
        const isLocalhost = typeof window !== 'undefined' && 
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
        if (isLocalhost) {
          errorMessage = '⏱ 응답 시간 초과 (90초)\n\n[원인]\nGoogle 이미지 생성 모델 서버가 응답을 보내지 않아 자동 중단했습니다. 다음 중 하나일 가능성이 큽니다:\n• Google 서버의 일시적 과부하/지연\n• 복잡한 디자인 요구사항으로 모델이 처리에 더 오랜 시간 소요\n• 네트워크 일시 단절\n\n[조치 방법]\n1) "다시 시도" 버튼 클릭 (대부분 일시적 문제라 재시도 시 성공)\n2) 반복 실패 시 다른 모델(예: Imagen 3)로 시도\n3) 5~10분 후 재시도';
        } else {
          errorMessage = '⏱ 응답 시간 초과 (Vercel 무료 플랜 60초 한계)\n\n[원인]\nVercel 무료 플랜은 서버 함수가 60초 안에 응답해야 하는데, Google 이미지 생성이 60초를 넘어 자동 중단됐습니다. 코드 문제가 아니라 인프라 제약입니다.\n\n[근본적 해결책 - 운영팀 작업]\n1) Vercel Pro 플랜 업그레이드 ($20/월, 실행 시간 300초까지)\n2) 다른 호스팅으로 이전 (AWS Lambda 15분, Cloud Run 60분 등)\n3) 비동기 작업 큐 도입\n\n[임시 대응]\n1) "다시 시도" 버튼 클릭 (60초 안에 응답할 수도)\n2) 다른 모델로 시도 (Imagen 4가 보통 더 빠름)';
        }
      }

      setItems(prev => prev.map(it => it.id === itemId ? {
        ...it,
        generating: { ...(it.generating || {}), [model]: false },
        genError: { ...(it.genError || {}), [model]: errorMessage }
      } : it));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF7', fontFamily: "'Noto Sans KR', system-ui, sans-serif", color: '#1a1a1a' }}>
      <header style={{ borderBottom: '1px solid #E5E3DC', background: '#fff' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ cursor: 'pointer' }} onClick={() => { setView('main'); setDetailItem(null); }}>
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, letterSpacing: -0.5, lineHeight: 1 }}>SERGIO TACCHINI</div>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: 2, marginTop: 4, textTransform: 'uppercase' }}>Design Studio · Court-side Elegance</div>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <button
              onClick={() => { setView('main'); setDetailItem(null); }}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                color: view === 'main' ? '#1a1a1a' : '#888',
                cursor: 'pointer',
                padding: '4px 0',
                borderBottom: view === 'main' ? '2px solid #1a1a1a' : '2px solid transparent',
                fontFamily: 'inherit',
                letterSpacing: 0.3,
              }}
            >
              Studio
            </button>
            <button
              onClick={() => { setView('history'); setDetailItem(null); }}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                color: (view === 'history' || view === 'detail') ? '#1a1a1a' : '#888',
                cursor: 'pointer',
                padding: '4px 0',
                borderBottom: (view === 'history' || view === 'detail') ? '2px solid #1a1a1a' : '2px solid transparent',
                fontFamily: 'inherit',
                letterSpacing: 0.3,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Clock size={13} />
              History
            </button>
            <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginLeft: 8 }}>"Space, Not Scale"</div>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {view === 'main' && (
          <MainView
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            handleDrop={handleDrop}
            handleFiles={handleFiles}
            fileInputRef={fileInputRef}
            items={items}
            removeItem={removeItem}
            generateImage={generateImage}
          />
        )}
        {view === 'history' && (
          <HistoryView
            historyItems={historyItems}
            onSelect={(item) => { setDetailItem(item); setView('detail'); }}
            onDelete={(id) => {
              deleteFromHistory(id);
              setHistoryItems(loadHistory());
            }}
          />
        )}
        {view === 'detail' && detailItem && (
          <DetailView
            item={detailItem}
            onBack={() => { setView('history'); setDetailItem(null); }}
          />
        )}
      </main>
    </div>
  );
}

// ============= Main View (기존 업로드/처리 화면) =============
function MainView({ isDragging, setIsDragging, handleDrop, handleFiles, fileInputRef, items, removeItem, generateImage }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: '2.5rem', flexWrap: 'wrap' }}>
        {[{ num: '01', label: '의류 이미지 분석' }, { num: '02', label: '브랜드 가이드 반영' }, { num: '03', label: '디자인 시안 생성' }].map((s, i, arr) => (
          <React.Fragment key={s.num}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#fff', border: '1px solid #E5E3DC', borderRadius: 999 }}>
              <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 14, color: '#999' }}>{s.num}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
            </div>
            {i < arr.length - 1 && <ChevronRight size={14} color="#ccc" />}
          </React.Fragment>
        ))}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? '#1a1a1a' : '#D4D2C8'}`,
          background: isDragging ? '#F0EFE8' : '#fff',
          borderRadius: 16, padding: '3rem 2rem', textAlign: 'center',
          transition: 'all 0.2s ease', marginBottom: '2rem',
        }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#F0EFE8', marginBottom: 16 }}>
          <Upload size={20} color="#666" />
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>샘플 이미지를 드래그하거나 업로드하세요</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>여러 장 동시 업로드 가능 · PNG, JPG, WEBP</div>
        <button onClick={() => fileInputRef.current?.click()} style={{ padding: '10px 24px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', letterSpacing: 0.3 }}>파일 선택</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#F5F3EC', borderRadius: 8, marginBottom: '2rem', fontSize: 12, color: '#666' }}>
        <FileText size={14} />
        <span>적용 중인 브랜드 가이드: <strong style={{ color: '#1a1a1a', fontWeight: 500 }}>Sergio Tacchini Brand DNA Guide</strong> · Active / Athleisure / Classic 라인</span>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#aaa', fontSize: 13 }}>
          <ImageIcon size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <div>업로드된 이미지가 여기에 표시됩니다</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {items.map(item => <ItemCard key={item.id} item={item} onRemove={removeItem} onGenerateImage={generateImage} />)}
        </div>
      )}
    </>
  );
}

// ============= History View =============
function HistoryView({ historyItems, onSelect, onDelete }) {
  if (historyItems.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 2rem', color: '#aaa' }}>
        <Clock size={36} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
        <div style={{ fontSize: 16, fontWeight: 500, color: '#666', marginBottom: 8 }}>저장된 작업 내역이 없습니다</div>
        <div style={{ fontSize: 13, color: '#aaa' }}>의류 이미지를 업로드하고 Step 03까지 완료하면 자동으로 저장됩니다</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 24, fontWeight: 400, letterSpacing: -0.3 }}>History</h2>
        <span style={{ fontSize: 12, color: '#888' }}>총 {historyItems.length}개 · 최신순</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {historyItems.map(item => (
          <HistoryCard key={item.id} item={item} onSelect={() => onSelect(item)} onDelete={() => onDelete(item.id)} />
        ))}
      </div>
    </div>
  );
}

function HistoryCard({ item, onSelect, onDelete }) {
  const originalSrc = `data:${item.mediaType};base64,${item.base64}`;
  const nanoBananaImg = item.generatedImages?.nanoBanana;
  const imagen3Img = item.generatedImages?.imagen3;

  const formatDate = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div
      onClick={onSelect}
      style={{
        background: '#fff',
        border: '1px solid #E5E3DC',
        borderRadius: 12,
        padding: '1rem 1.25rem',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1a1a1a'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E3DC'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* 원본 썸네일 */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Original</div>
        <div style={{ width: 80, height: 100, background: '#FAFAF7', borderRadius: 6, overflow: 'hidden', border: '1px solid #F0EFE8' }}>
          <img src={originalSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      {/* 화살표 */}
      <ChevronRight size={16} color="#ccc" style={{ flexShrink: 0 }} />

      {/* 결과 이미지 2개 */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        <ResultThumb label="Nano Banana" src={nanoBananaImg} accent="#FAEEDA" textColor="#854F0B" />
        <ResultThumb label="Imagen 3" src={imagen3Img} accent="#E6F1FB" textColor="#0C447C" />
      </div>

      {/* 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          {item.step2?.recommendedLine && <SmallLineBadge line={item.step2.recommendedLine} />}
          <span style={{ fontSize: 11, color: '#888' }}>{item.step1?.category}</span>
        </div>
        <div style={{ fontSize: 11, color: '#aaa' }}>{formatDate(item.savedAt)}</div>
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm('이 작업을 삭제하시겠습니까?')) onDelete();
        }}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, color: '#bbb', display: 'flex', flexShrink: 0 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#791F1F'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ResultThumb({ label, src, accent, textColor }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: textColor, letterSpacing: 0.8, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{
        width: 80, height: 100,
        background: src ? '#FAFAF7' : accent,
        borderRadius: 6, overflow: 'hidden',
        border: '1px solid #F0EFE8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {src ? (
          <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 9, color: textColor, opacity: 0.6, textAlign: 'center', padding: '0 4px', lineHeight: 1.3 }}>미생성</span>
        )}
      </div>
    </div>
  );
}

function SmallLineBadge({ line }) {
  const config = {
    Active: { bg: '#1a1a1a', color: '#fff' },
    Athleisure: { bg: '#5DCAA5', color: '#04342C' },
    Classic: { bg: '#FAEEDA', color: '#854F0B' },
  };
  const c = config[line] || config.Athleisure;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', background: c.bg, color: c.color, borderRadius: 4, fontSize: 10, fontWeight: 500, letterSpacing: 0.5 }}>
      {line.toUpperCase()}
    </span>
  );
}

// ============= Detail View =============
function DetailView({ item, onBack }) {
  // ItemCard에서 사용하는 형식으로 변환
  const previewUrl = `data:${item.mediaType};base64,${item.base64}`;
  const detailItem = {
    ...item,
    previewUrl,
    status: 'done',
    currentStep: 4,
    generating: {},
    genError: {},
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none',
          fontSize: 13, color: '#666', cursor: 'pointer',
          padding: '6px 0', marginBottom: '1.5rem',
          fontFamily: 'inherit',
        }}
      >
        <ChevronLeft size={16} /> History로 돌아가기
      </button>

      {/* 읽기 전용 ItemCard - 이미지 재생성은 비활성화 */}
      <ItemCard
        item={detailItem}
        onRemove={() => {}}
        onGenerateImage={() => {
          alert('History 화면에서는 이미지를 재생성할 수 없습니다. Studio 화면에서 새로 시도해주세요.');
        }}
        readOnly
      />
    </div>
  );
}

function ItemCard({ item, onRemove, onGenerateImage, readOnly }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E3DC', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #F0EFE8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#888' }}>{item.name}</div>
          <StatusBadge status={item.status} currentStep={item.currentStep} />
        </div>
        {!readOnly && (
          <button onClick={() => onRemove(item.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#999', display: 'flex' }}>
            <X size={16} />
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0 }}>
        <div style={{ padding: '1.5rem', borderRight: '1px solid #F0EFE8', background: '#FAFAF7' }}>
          <div style={{ aspectRatio: '3/4', background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E3DC' }}>
            <img src={item.previewUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          {item.step2?.recommendedLine && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: '#888', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Recommended Line</div>
              <LineBadge line={item.step2.recommendedLine} />
              {item.step2.lineReason && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>"{item.step2.lineReason}"</div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '1.5rem 1.75rem' }}>
          {item.status === 'error' && (
            <div style={{ padding: 12, background: '#FCEBEB', color: '#791F1F', borderRadius: 8, fontSize: 13 }}>오류: {item.error}</div>
          )}
          {item.status === 'processing' && !item.step1 && <ProcessingState step={item.currentStep} />}
          {item.step1 && (
            <Section title="Step 01 — 원본 의류 분석" stepNum="01">
              <AttributeGrid data={item.step1} />
            </Section>
          )}
          {item.step1 && item.currentStep === 2 && !item.step2 && <ProcessingState step={2} compact />}
          {item.step2 && (
            <Section title="Step 02 — 브랜드 가이드 반영 후" stepNum="02" highlight>
              <AttributeGrid data={item.step2.redesign} compareWith={item.step1} />
              {item.step2.designPoints && (
                <div style={{ marginTop: 16, padding: 14, background: '#F5F3EC', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>핵심 변경 포인트</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: '#333' }}>
                    {item.step2.designPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
            </Section>
          )}
          {item.step2 && item.currentStep === 3 && !item.step3 && <ProcessingState step={3} compact />}
          {item.step3 && (
            <Section title="Step 03 — 3D 고스트샷 생성" stepNum="03" rightAction={<HarnessPromptingButton />}>
              <ImageGenSection item={item} model="nanoBanana" modelLabel="Nano Banana" modelSublabel="Gemini 2.5 Flash Image · 자연어 묘사형" accent="#FAEEDA" textColor="#854F0B" onGenerate={() => onGenerateImage(item.id, 'nanoBanana')} />
              <ImageGenSection item={item} model="imagen3" modelLabel="Imagen 3" modelSublabel="Google · 키워드 중심형" accent="#E6F1FB" textColor="#0C447C" onGenerate={() => onGenerateImage(item.id, 'imagen3')} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneratingState({ modelLabel, accent, textColor }) {
  const [elapsed, setElapsed] = useState(0);

  // 환경별 timeout 시간 (클라이언트 generateImage와 동일하게)
  const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const TIMEOUT_SEC = isLocalhost ? 90 : 60;

  React.useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 단계별 메시지 (timeout의 비율로 계산)
  const warningThreshold = Math.floor(TIMEOUT_SEC * 0.33);  // 30%
  const dangerThreshold = Math.floor(TIMEOUT_SEC * 0.66);   // 66%
  const criticalThreshold = Math.floor(TIMEOUT_SEC * 0.88); // 88%

  let statusMessage = `${modelLabel}로 이미지 생성 중...`;
  let subMessage = '보통 10~30초 소요됩니다';
  let urgencyColor = textColor;

  if (elapsed >= warningThreshold && elapsed < dangerThreshold) {
    subMessage = '평소보다 시간이 걸리고 있어요. 잠시만 더 기다려주세요...';
  } else if (elapsed >= dangerThreshold && elapsed < criticalThreshold) {
    subMessage = '응답이 지연되고 있습니다. 곧 자동 중단될 수 있습니다.';
    urgencyColor = '#A32D2D';
  } else if (elapsed >= criticalThreshold) {
    subMessage = '곧 타임아웃됩니다. 자동 중단되면 다시 시도해주세요.';
    urgencyColor = '#791F1F';
  }

  const progressPercent = Math.min((elapsed / TIMEOUT_SEC) * 100, 100);

  return (
    <div style={{ padding: '1.5rem 1.25rem', background: accent, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: textColor }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: textColor }}>{statusMessage}</span>
        <span style={{ fontSize: 12, color: textColor, opacity: 0.6, fontFamily: "'SF Mono', Consolas, monospace" }}>
          {elapsed}s / {TIMEOUT_SEC}s
        </span>
      </div>
      <div style={{ fontSize: 11, color: urgencyColor, opacity: elapsed >= dangerThreshold ? 1 : 0.7, textAlign: 'center', marginBottom: 12, lineHeight: 1.5 }}>
        {subMessage}
      </div>
      <div style={{ width: '100%', height: 4, background: '#fff', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            background: elapsed >= dangerThreshold ? '#A32D2D' : textColor,
            transition: 'width 1s linear, background 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function ImageGenSection({ item, model, modelLabel, modelSublabel, accent, textColor, onGenerate }) {
  const [copied, setCopied] = useState(false);
  const prompt = item.step3?.[model];
  const generatedImage = item.generatedImages?.[model];
  const isGenerating = item.generating?.[model];
  const error = item.genError?.[model];

  const copy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadImage = () => {
    const a = document.createElement('a');
    a.href = generatedImage;
    a.download = `${item.name.split('.')[0]}_${model}_ghostshot.png`;
    a.click();
  };

  return (
    <div style={{ marginBottom: 16, border: '1px solid #E5E3DC', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: textColor, letterSpacing: 0.3 }}>
            <Sparkles size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: '-1px' }} />{modelLabel}
          </div>
          <div style={{ fontSize: 10, color: textColor, opacity: 0.7, marginTop: 2 }}>{modelSublabel}</div>
        </div>
        <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#fff', border: '1px solid', borderColor: textColor + '33', borderRadius: 6, fontSize: 11, color: textColor, cursor: 'pointer', fontWeight: 500 }}>
          {copied ? <><Check size={11} /> 복사됨</> : <><Copy size={11} /> 프롬프트 복사</>}
        </button>
      </div>
      <div style={{ padding: '12px 16px', background: '#FAFAF7', fontSize: 12, lineHeight: 1.6, color: '#444', fontFamily: "'SF Mono', Consolas, monospace", borderBottom: '1px solid #F0EFE8' }}>{prompt}</div>
      <div style={{ padding: 16, background: '#fff' }}>
        {!generatedImage && !isGenerating && !error && (
          <button onClick={onGenerate} style={{ width: '100%', padding: '14px', background: textColor, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: 0.3 }}>
            <Wand2 size={14} />{modelLabel}로 이미지 생성
          </button>
        )}
        {isGenerating && (
          <GeneratingState modelLabel={modelLabel} accent={accent} textColor={textColor} />
        )}
        {error && (
          <div style={{ padding: '16px 18px', background: '#FCEBEB', color: '#791F1F', borderRadius: 8, fontSize: 12, border: '1px solid #F4C0BD' }}>
            <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13, color: '#791F1F' }}>이미지 생성 실패</div>
            <div style={{ fontSize: 12, color: '#5C1717', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{error}</div>
            <button onClick={onGenerate} style={{ marginTop: 12, padding: '8px 16px', background: '#791F1F', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>다시 시도</button>
          </div>
        )}
        {generatedImage && (
          <div>
            <div style={{ background: '#FAFAF7', borderRadius: 8, padding: 12, border: '1px solid #F0EFE8' }}>
              <img src={generatedImage} alt={`${modelLabel} generated`} style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={downloadImage} style={{ flex: 1, padding: '8px 12px', background: '#fff', border: '1px solid #E5E3DC', borderRadius: 6, fontSize: 12, color: '#1a1a1a', cursor: 'pointer', fontWeight: 500 }}>다운로드</button>
              <button onClick={onGenerate} style={{ flex: 1, padding: '8px 12px', background: '#fff', border: '1px solid #E5E3DC', borderRadius: 6, fontSize: 12, color: '#1a1a1a', cursor: 'pointer', fontWeight: 500 }}>다시 생성</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, currentStep }) {
  if (status === 'pending') return <Badge color="#888" bg="#F0EFE8">대기 중</Badge>;
  if (status === 'processing') return <Badge color="#534AB7" bg="#EEEDFE"><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />처리 중 · Step {currentStep}</Badge>;
  if (status === 'done') return <Badge color="#0F6E56" bg="#E1F5EE"><Check size={11} />완료</Badge>;
  if (status === 'error') return <Badge color="#791F1F" bg="#FCEBEB">오류</Badge>;
  return null;
}

function Badge({ children, color, bg }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: bg, color, borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
      {children}
    </span>
  );
}

function LineBadge({ line }) {
  const config = {
    Active: { bg: '#1a1a1a', color: '#fff', label: 'ACTIVE', sub: 'Performance' },
    Athleisure: { bg: '#5DCAA5', color: '#04342C', label: 'ATHLEISURE', sub: 'Wellness' },
    Classic: { bg: '#FAEEDA', color: '#854F0B', label: 'CLASSIC', sub: 'Heritage' },
  };
  const c = config[line] || config.Athleisure;
  return (
    <div style={{ display: 'inline-block', padding: '8px 14px', background: c.bg, color: c.color, borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: 1.5 }}>{c.label}</div>
      <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: 0.5 }}>{c.sub}</div>
    </div>
  );
}

function Section({ title, stepNum, children, highlight, rightAction }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 8, borderBottom: highlight ? '1px solid #1a1a1a' : '1px solid #E5E3DC' }}>
        <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18, color: '#999' }}>{stepNum}</span>
        <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0.3, flex: 1 }}>{title}</span>
        {rightAction && <div>{rightAction}</div>}
      </div>
      {children}
    </div>
  );
}

function HarnessPromptingButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: '#1a1a1a',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0.3,
          cursor: 'help',
        }}
      >
        <span style={{ fontSize: 10 }}>⚙</span>
        Harness prompting
      </button>
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            padding: '14px 16px',
            background: '#1a1a1a',
            color: '#fff',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 10, color: '#FAEEDA', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 }}>
            Active Prompting Guides
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 500, marginBottom: 3, color: '#fff' }}>1. 원본 디자인 보존</div>
            <div style={{ color: '#ccc', fontSize: 11.5 }}>
              원본 디자인의 핵심 요소를 30~50% 유지. 카테고리, 기본 형태, 주요 디테일 일부는 살려서 브랜드 톤으로 재해석.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 3, color: '#fff' }}>2. 정면 앞/뒤 뷰</div>
            <div style={{ color: '#ccc', fontSize: 11.5 }}>
              한 이미지 안에 정면(front view)과 후면(back view)을 나란히 배치. 동일한 배경/조명 조건.
            </div>
          </div>
          {/* Tooltip arrow */}
          <div
            style={{
              position: 'absolute',
              top: -6,
              right: 24,
              width: 12,
              height: 12,
              background: '#1a1a1a',
              transform: 'rotate(45deg)',
            }}
          />
        </div>
      )}
    </div>
  );
}

function AttributeGrid({ data, compareWith }) {
  const labels = { category: '카테고리', style: '스타일', silhouette: '실루엣', material: '소재', sewing: '봉재', details: '디테일', color: '컬러' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {Object.keys(labels).filter(k => data[k]).map(key => {
        const original = compareWith?.[key];
        const changed = original && original !== data[key];
        return (
          <div key={key} style={{ padding: 12, background: changed ? '#FAEEDA' : '#FAFAF7', border: '1px solid', borderColor: changed ? '#EF9F27' : '#F0EFE8', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: changed ? '#854F0B' : '#888', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, fontWeight: 500 }}>
              {labels[key]}{changed && <span style={{ marginLeft: 6, fontSize: 9 }}>● 변경</span>}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#1a1a1a' }}>{data[key]}</div>
            {changed && <div style={{ fontSize: 11, color: '#999', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #E5C893', textDecoration: 'line-through' }}>{original}</div>}
          </div>
        );
      })}
    </div>
  );
}

function ProcessingState({ step, compact }) {
  const labels = { 1: '의류 이미지 분석 중...', 2: '브랜드 가이드 매칭 중...', 3: '이미지 생성 프롬프트 작성 중...' };
  return (
    <div style={{ padding: compact ? '12px 16px' : '2rem', textAlign: 'center', color: '#888', fontSize: 13, background: '#FAFAF7', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />{labels[step]}
    </div>
  );
}
