# TrailerLens production image (PostgreSQL flavor)
FROM node:22-alpine AS base
# package.json의 packageManager 값에 맞춰 pnpm을 받습니다.
# 프롬프트를 끄지 않으면 비대화형 빌드에서 corepack이 멈춥니다.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
# pnpm 실행 파일 자체를 base 레이어에 미리 받아둡니다. 아래 deps/build/runner는
# 전부 이 base에서 갈라져 나가는데, 여기서 안 받아두면 세 스테이지 각각
# 컨테이너를 처음 시작할 때(런타임 포함!) pnpm이 "이 버전이 캐시에 없네" 하며
# 다시 받으려 하고, 그 김에 lockfile 정합성까지 재검증하면서 devDependencies를
# 포함한 전체 그래프를 네트워크로 다시 훑는 경우가 있었습니다. Render 무료
# 플랜은 런타임도 512MB라 컨테이너가 뜨자마자 그걸로 OOM이 났습니다.
RUN corepack prepare pnpm@11.21.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
COPY prisma ./prisma
COPY scripts ./scripts
# --prod: eslint/playwright/vitest 같은 개발 전용 도구를 빌드 이미지에서
# 뺍니다. Render 무료 플랜(512MB)에서 pnpm install이 이 도구들까지 한꺼번에
# 받다가 메모리 부족으로 죽었던 원인입니다. next build에 필요한 typescript,
# tailwindcss, prisma 등은 package.json의 "dependencies"로 옮겨뒀습니다.
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build against the PostgreSQL schema
RUN node scripts/make-postgres-schema.mjs \
  && node_modules/.bin/prisma generate --schema prisma/schema.postgres.prisma \
  && node_modules/.bin/next build

FROM base AS runner
ENV NODE_ENV=production
# yt-dlp는 유튜브 '가장 많이 다시 본 구간'(열광 지점의 핵심 근거)을 가져오는 데
# 필요합니다. 없으면 앱은 뜨지만 히트맵이 비어 열광 지점이 댓글 근거만 남습니다.
# alpine 저장소에 없을 때를 대비해 musl용 정적 바이너리로 대체합니다.
RUN apk add --no-cache yt-dlp \
  || ( apk add --no-cache ca-certificates \
       && wget -qO /usr/local/bin/yt-dlp \
            https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_musllinux \
       && chmod +x /usr/local/bin/yt-dlp )
RUN yt-dlp --version
COPY --from=build /app ./
EXPOSE 3000
# pnpm을 거치지 않고 node_modules/.bin의 실제 바이너리를 직접 실행합니다.
# "pnpm prisma ..."처럼 pnpm 경유로 실행하면 매번 lockfile/스토어 상태를
# 검증하는데, 그 과정에서 네트워크로 전체 의존성 그래프를 다시 훑는 게
# 런타임 OOM의 원인이었습니다. 바이너리를 직접 부르면 이 과정이 아예 없습니다.
CMD ["sh", "-c", "node_modules/.bin/prisma db push --schema prisma/schema.postgres.prisma --skip-generate && node_modules/.bin/next start"]
