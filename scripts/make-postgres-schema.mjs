// Generates prisma/schema.postgres.prisma from the canonical SQLite schema.
// Keeps the two flavors from drifting apart: single source of truth.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");

const out = src
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace(
    /^\/\/ TrailerLens Prisma schema[^\n]*\n/,
    "// GENERATED FILE — do not edit. Run `pnpm db:pg:schema` to regenerate.\n",
  );

writeFileSync(join(root, "prisma", "schema.postgres.prisma"), out);
console.log("Wrote prisma/schema.postgres.prisma");
