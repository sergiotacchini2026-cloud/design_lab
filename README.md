# Sergio Tacchini Design Studio

Sergio Tacchini 브랜드 가이드를 반영하여 의류 이미지를 자동으로 재해석하고, Nano Banana(Gemini 2.5 Flash Image) / Imagen 3로 3D 고스트샷 이미지를 생성하는 사내 디자인 도구입니다.

## 구조

```
sergio-tacchini-design/
├── api/
│   ├── claude.js              ← Anthropic API 프록시
│   └── generate-image.js      ← Google AI 이미지 생성 프록시
├── src/
│   ├── App.jsx                ← 메인 React 컴포넌트
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── .env.example
```

## 로컬 개발 환경 설정

### 1) 사전 요구사항
- Node.js 18 이상
- Vercel CLI: `npm i -g vercel`

### 2) 의존성 설치
```bash
npm install
```

### 3) 환경변수 설정
`.env.example`을 복사해서 `.env.local`을 만들고 API 키를 채워주세요.

```bash
cp .env.example .env.local
```

`.env.local` 파일:
```
GOOGLE_API_KEY=AIza...        # https://aistudio.google.com/apikey
ANTHROPIC_API_KEY=sk-ant-...  # https://console.anthropic.com/
```

> **중요**: Google API 키는 Imagen 3 사용을 위해 결제 계정(Billing)이 활성화되어 있어야 합니다.

### 4) 개발 서버 실행 (터미널 2개 필요)

**터미널 1** — API 서버 (Vercel Dev):
```bash
vercel dev
```
처음 실행 시 Vercel 로그인 및 프로젝트 연결을 요구합니다.

**터미널 2** — 프론트엔드 (Vite):
```bash
npm run dev
```

이제 http://localhost:5173 에서 앱이 동작합니다. (Vite가 `/api` 요청을 자동으로 Vercel Dev로 프록시)

## 프로덕션 배포 (Vercel)

### 방법 1: Vercel CLI
```bash
vercel
```
첫 배포 시 안내에 따라 프로젝트를 설정합니다.

### 방법 2: Git 연동 (추천)
1. GitHub/GitLab에 코드 푸시
2. https://vercel.com 에서 "Import Project"
3. 환경변수 추가 (Settings → Environment Variables):
   - `GOOGLE_API_KEY`
   - `ANTHROPIC_API_KEY`
4. Deploy 버튼 클릭

### 환경변수 등록
Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에서 등록:
| Name | Value |
|------|-------|
| `GOOGLE_API_KEY` | Google AI Studio에서 발급 |
| `ANTHROPIC_API_KEY` | Anthropic Console에서 발급 |

## API 엔드포인트

### POST `/api/claude`
Anthropic Messages API 프록시. body는 그대로 전달됩니다.

### POST `/api/generate-image`
Google AI 이미지 생성.

**Request:**
```json
{
  "model": "nanoBanana" | "imagen3",
  "prompt": "3D ghost mannequin product shot of..."
}
```

**Response (성공):**
```json
{
  "success": true,
  "imageDataUrl": "data:image/png;base64,iVBORw0..."
}
```

**Response (실패):**
```json
{
  "error": "에러 메시지"
}
```

## 비용 안내 (참고)

- **Claude Sonnet 4**: 의류 1장당 약 3번 호출 (Step 1/2/3) — 약 $0.02-0.05
- **Nano Banana** (Gemini 2.5 Flash Image): 이미지 1장당 약 $0.04
- **Imagen 3**: 이미지 1장당 약 $0.04

## 보안 주의사항

- API 키는 절대 프론트엔드 코드나 Git에 커밋하지 마세요
- `.env.local`은 `.gitignore`에 포함되어 있습니다
- 사내 사용 시에도 주기적으로 API 키를 로테이션하는 것을 권장합니다

## 커스터마이징

브랜드 가이드를 변경하려면 `src/App.jsx` 상단의 `BRAND_GUIDE` 상수를 수정하세요.
