// 로컬 SQLite에 모아둔 데이터를 배포본(PostgreSQL)으로 옮깁니다.
// 재수집 없이 배포된 사이트에서 바로 같은 결과를 볼 수 있게 하려는 용도입니다.
//
// 두 DB의 테이블 구조는 같고 provider만 다르므로, 같은 스크립트를 두 번 씁니다.
//
//   1) 로컬에서 내보내기 (SQLite 클라이언트 상태)
//        pnpm db:generate
//        node scripts/transfer-data.mjs export
//
//   2) 클라이언트를 PostgreSQL용으로 바꾼 뒤 넣기
//        pnpm db:pg:schema
//        pnpm prisma generate --schema prisma/schema.postgres.prisma
//        DATABASE_URL="<Render External Database URL>" node scripts/transfer-data.mjs import
//
//   3) 로컬 개발로 되돌리기
//        pnpm db:generate
//
// import는 이미 있는 행은 건너뜁니다(skipDuplicates). 여러 번 돌려도 중복이
// 생기지 않지만, 이미 들어간 행의 내용을 갱신하지도 않습니다.

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const mode = process.argv[2];
// 절대 경로도 그대로 받도록 resolve를 씁니다.
const file = path.resolve(process.cwd(), process.argv[3] ?? "data-export.json");

if (mode !== "export" && mode !== "import") {
  console.error("사용법: node scripts/transfer-data.mjs <export|import> [파일경로]");
  process.exit(1);
}

// 내보내는 순서 = 넣는 순서. 외래키 때문에 Video → Analysis 순서를 지켜야 합니다.
const TABLES = ["video", "comment", "analysis", "heatmapSegment", "sceneCluster"];

const prisma = new PrismaClient();

/** BigInt와 Date는 JSON에 그대로 담기지 않아 표시를 남겨 직렬화합니다. */
function serialize(value) {
  if (typeof value === "bigint") return { __bigint: value.toString() };
  if (value instanceof Date) return { __date: value.toISOString() };
  return value;
}

function revive(value) {
  if (value && typeof value === "object") {
    if ("__bigint" in value) return BigInt(value.__bigint);
    if ("__date" in value) return new Date(value.__date);
  }
  return value;
}

function mapRow(row, fn) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = fn(v);
  return out;
}

try {
  if (mode === "export") {
    const payload = { exportedAt: new Date().toISOString(), tables: {} };
    for (const table of TABLES) {
      const rows = await prisma[table].findMany();
      payload.tables[table] = rows.map((r) => mapRow(r, serialize));
      console.log(`  ${table.padEnd(16)} ${rows.length.toLocaleString()}행`);
    }
    fs.writeFileSync(file, JSON.stringify(payload));
    const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
    console.log(`\n내보내기 완료: ${file} (${mb} MB)`);
  } else {
    if (!fs.existsSync(file)) {
      console.error(`파일이 없습니다: ${file}. 먼저 export를 실행하세요.`);
      process.exit(1);
    }
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`불러오는 중: ${file} (내보낸 시각 ${payload.exportedAt})`);

    for (const table of TABLES) {
      const rows = (payload.tables[table] ?? []).map((r) => mapRow(r, revive));
      if (rows.length === 0) {
        console.log(`  ${table.padEnd(16)} 0행 (건너뜀)`);
        continue;
      }
      // 대량 insert는 청크로 나눠야 파라미터 한도에 걸리지 않습니다.
      const CHUNK = 500;
      let done = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await prisma[table].createMany({ data: chunk, skipDuplicates: true });
        done += chunk.length;
        process.stdout.write(`\r  ${table.padEnd(16)} ${done.toLocaleString()}/${rows.length.toLocaleString()}행`);
      }
      console.log("");
    }
    console.log("\n넣기 완료.");
  }
} finally {
  await prisma.$disconnect();
}
