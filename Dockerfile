# TrailerLens production image (PostgreSQL flavor)
FROM node:22-alpine AS base
# package.json의 packageManager 값에 맞춰 pnpm을 받습니다.
# 프롬프트를 끄지 않으면 비대화형 빌드에서 corepack이 멈춥니다.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build against the PostgreSQL schema
RUN node scripts/make-postgres-schema.mjs \
  && pnpm prisma generate --schema prisma/schema.postgres.prisma \
  && pnpm next build

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
CMD ["sh", "-c", "pnpm prisma db push --schema prisma/schema.postgres.prisma --skip-generate && pnpm next start"]
