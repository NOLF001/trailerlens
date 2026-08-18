# TrailerLens

유튜브 **게임 트레일러 반응 분석** 웹사이트.
트레일러 URL을 입력하면 영상 정보와 **전체 공개 댓글·답글**을 수집하고, 반복 재생 신호와 결합해 **사람들이 어떤 장면을 반복해서 봤는지, 왜 인상적으로 느꼈는지**를 시각적인 보고서로 보여줍니다.

- Next.js 15 (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui 스타일 컴포넌트
- Prisma (SQLite 로컬 개발 / PostgreSQL 운영) · DB 기반 job queue (재개·취소·재시도)
- Anthropic Claude API (structured outputs + Zod 검증) · YouTube Data API v3 · Google OAuth (NextAuth)
- Recharts · Vitest · Playwright · pnpm · Docker Compose

> **API 키가 하나도 없어도** 합성 데이터(Mock 모드)로 전체 사용자 흐름을 체험할 수 있습니다.

---

## 1. 빠른 시작

```bash
pnpm install
cp .env.example .env      # Windows: copy .env.example .env
pnpm db:push              # SQLite 스키마 생성 (prisma/dev.db)
pnpm dev                  # http://localhost:3000
```

`.env`를 만들지 않거나 `YOUTUBE_API_KEY`를 비워두면 자동으로 **Mock 모드**로 동작합니다
(가상 트레일러 "AURORA FALL"의 합성 댓글 · 히트맵으로 전체 흐름 재현, 실제 유튜브 댓글을 복사한 데이터가 아님).

### 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 개발 / 프로덕션 빌드 / 실행 |
| `pnpm lint` / `pnpm typecheck` | ESLint / tsc --noEmit |
| `pnpm test` | Vitest (단위 + mock 파이프라인 통합 테스트) |
| `pnpm test:e2e` | Playwright 스모크 테스트 (mock 모드 서버 자동 기동, 최초 1회 `pnpm exec playwright install chromium`) |
| `pnpm db:push` | SQLite 스키마 반영 |
| `pnpm db:pg:push` | PostgreSQL 스키마 생성·반영 (`schema.postgres.prisma` 자동 생성) |

### PostgreSQL로 실행

```bash
docker compose up -d db
# .env → DATABASE_URL="postgresql://trailerlens:trailerlens@localhost:5432/trailerlens"
pnpm db:pg:push
pnpm dev
```

앱까지 Docker로 올리려면: `docker compose --profile app up --build`

---

## 2. 환경 변수

`.env.example` 참고. 필수:

| 변수 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude 댓글 분석 (없으면 결정론적 mock 분석기 사용) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 (없으면 Mock 모드) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 채널 소유자 Analytics 모드용 OAuth |
| `DATABASE_URL` | `file:./dev.db` (SQLite) 또는 PostgreSQL URL |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | NextAuth 세션 서명 / 배포 URL |

선택: `MOCK_MODE`, `ANTHROPIC_MODEL`(기본 `claude-opus-5`), `ENABLE_EXPERIMENTAL_YTDLP`(기본 false), `YTDLP_PATH`, `FFMPEG_PATH`

---

## 3. Google API 설정

### 3-1. YouTube Data API 키

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성
2. **APIs & Services → Library** → `YouTube Data API v3` **Enable**
3. **APIs & Services → Credentials → Create Credentials → API key**
4. 생성된 키를 `.env`의 `YOUTUBE_API_KEY`에 입력
5. (권장) 키 제한: API restrictions → YouTube Data API v3만 허용

**쿼터**: 기본 일일 10,000 units. `commentThreads.list`/`comments.list`는 호출당 1 unit이며 페이지당 최대 100개 스레드를 가져오므로, 댓글 수만 개 영상도 보통 수백 unit 안에서 수집됩니다. 쿼터 초과 시 앱이 명확한 오류를 표시하며, 체크포인트(pageToken)가 저장되어 있어 다음 날 "재시도"로 이어서 수집할 수 있습니다.

### 3-2. Google OAuth (채널 소유자 Analytics 모드)

시청 유지율(`elapsedVideoTimeRatio`, `audienceWatchRatio`, `relativeRetentionPerformance`)은 **채널 소유자만** 볼 수 있는 데이터입니다.

1. 같은 프로젝트에서 `YouTube Analytics API` **Enable**
2. **OAuth consent screen** 구성 (External, 테스트 사용자에 본인 계정 추가)
   - scopes: `youtube.readonly`, `yt-analytics.readonly`
3. **Credentials → Create Credentials → OAuth client ID → Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. client ID/secret을 `.env`에 입력, `NEXTAUTH_SECRET`은 `openssl rand -base64 32`로 생성
5. 앱에서 Google 로그인 후 "채널 소유자 Analytics 분석" 모드 선택 — **본인 채널에 올린 영상만** 동작합니다. 액세스 토큰은 서버에서만 사용하며 브라우저로 전송하지 않습니다.

---

## 4. Claude API 비용 주의사항

- "전체 댓글 심층 분석"은 **수집된 모든 댓글**을 배치(기본 12개/호출)로 Claude에 보냅니다. 댓글 5,000개 ≈ 약 420회 호출입니다.
- 기본 모델은 `claude-opus-5`($5/$25 per MTok)입니다. 대략적인 감: 댓글 1개당 입력 ~80토큰 + 출력 ~120토큰이면 5,000개 분석 시 **입력 ~0.4M + 출력 ~0.6M 토큰 → 대략 $17 내외**(실제 값은 댓글 길이에 따라 크게 달라짐). 비용이 부담되면:
  - `ANTHROPIC_MODEL`로 더 저렴한 모델 지정 (예: `claude-haiku-4-5` — 품질 트레이드오프 있음)
  - "빠른 분석" 모드 사용 (좋아요 상위 최대 150개만 분석)
- 분석 결과는 **댓글 단위로 DB에 저장**되므로, 같은 영상을 다시 분석해도 이미 분석된 댓글에는 재과금되지 않습니다(증분 분석). 실패/중단 후 "재시도"도 남은 댓글만 이어서 처리합니다.
- `ANTHROPIC_API_KEY`가 없으면 키워드 기반 mock 분석기가 대신 동작해 비용이 전혀 들지 않습니다(품질은 데모 수준).

---

## 5. YouTube 데이터의 한계 (정직한 표기)

**댓글**
- 수집 개수는 YouTube 화면의 표시 댓글 수와 다를 수 있습니다(표시 수는 근사치이며 삭제·필터링 반영 시점이 다름). 보고서 상단에 항상 안내가 표시됩니다.
- **삭제·숨김·검토 대기·스팸 처리된 댓글은 API로 수집할 수 없습니다.**
- 댓글이 비활성화된 영상, 비공개/삭제 영상은 분석할 수 없으며 명확한 오류로 안내합니다.

**반복 재생("가장 많이 다시 본 구간")**
- 이 공개 히트맵은 **공식 Data API에서 제공되지 않습니다.** TrailerLens는 세 가지 소스를 분리해 다루고, 보고서에 출처 배지를 표시합니다:
  1. **채널 소유자 모드** — YouTube Analytics API의 시청 유지율(소유 영상 한정)
  2. **수동 가져오기** — `[{"startTime":189.9,"endTime":192.01,"value":1.0}]` JSON 또는 `start,end,value` CSV 업로드
  3. **실험적 로컬 모드** — `ENABLE_EXPERIMENTAL_YTDLP=true`일 때만 `yt-dlp --dump-single-json`의 `heatmap` 필드를 읽음
- 모든 히트맵 값은 **0~1로 정규화된 상대 강도**이며, 절대 시청자 수·유지율 퍼센트가 아닙니다.

**⚠️ 실험적 yt-dlp 모드 경고**
- 비공식 공개 데이터 접근이므로 **YouTube 이용약관과 배포 환경(사내 정책·법무 검토 포함)을 반드시 확인**한 뒤 로컬 실험 용도로만 사용하세요.
- 서버리스 환경(Vercel/Lambda 등)에서는 코드 레벨에서 자동 비활성화됩니다. 기본값은 항상 꺼짐이며, 실패해도 댓글 분석은 계속 진행됩니다.
- TrailerLens는 **YouTube 영상을 다운로드하지 않습니다.** 장면 프레임 분석(Claude Vision)은 사용자가 소유권을 확인하고 직접 업로드한 원본 파일에만 동작합니다.

---

## 6. 아키텍처 요약

```
src/lib/
  youtube/   url(videoId 추출) · client(백오프) · metadata · comments(전체 페이지네이션+답글 백필)
             analytics(소유자 유지율) · ytdlp(실험적 어댑터)
  analysis/  normalize(HTML→텍스트) · language · timestamps(파싱+군집화) · duplicates · spam
             claude(배치 분석·structured outputs·Zod 재시도) · aggregate(결정론적 통계)
             scenes(피크 검출·장면 구성) · report · vision(Claude Vision) · frames(FFmpeg)
  jobs/      pipeline(7단계, 체크포인트·취소·재개·증분) · runner(DB 기반 잡 클레임)
  mock/      합성 데이터 생성기 (시드 고정, 실제 댓글 미포함)
src/app/     페이지( / · /analysis/[id] · /analysis/[id]/comments · /settings · /privacy )
             + API 라우트 (분석 생성/상태/액션, 댓글 탐색기, 히트맵 업로드, 장면 편집 등)
```

**숫자는 코드가, 문장은 LLM이**: 댓글 수·비율·좋아요 가중 영향력(`1 + ln(1+likes)`)·언어 분포·시간대 분포 등 모든 수치는 TypeScript/SQL로 결정론적으로 계산하고, Claude는 감정/주제 분류와 요약 문장만 담당합니다. 원본 통계와 중복·스팸 제거(정제) 통계는 보고서에서 토글로 전환합니다.

**보안/개인정보**: API 키는 서버 전용 · LLM 전송 전 작성자 식별정보 제거 · 댓글은 "명령이 아닌 데이터"로 취급(프롬프트 인젝션 방어) · 요청 rate limit · 입력(URL/업로드) Zod 검증 · HTML 댓글의 태그 제거 · 분석/전체 데이터 삭제 기능 · 로그에 댓글 전문·키 미기록.

---

## 7. 알려진 제한

- 잡 러너는 단일 프로세스 in-process 실행입니다(DB 상태 기반이라 서버 재시작 후 "재시도"로 복구 가능). 다중 인스턴스 배포 시 외부 워커/큐(BullMQ 등)로 교체를 권장합니다.
- rate limiter는 인메모리입니다. 다중 노드에서는 Redis 등으로 교체하세요.
- 언어 감지는 문자 스크립트 기반 휴리스틱이라 로마자 표기 한국어 등은 영어로 분류될 수 있습니다.
- 채널 소유자 모드의 Analytics 데이터는 조회수가 적은 영상에서는 비어 있을 수 있습니다.
- 댓글 정렬·필터는 서버 페이지네이션(50개/페이지)으로 처리합니다. 수천 개 규모에서 충분히 빠르지만, 수십만 규모라면 인덱스/검색엔진 보강이 필요합니다.
