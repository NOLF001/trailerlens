// 외부 공개 시 되돌릴 수 없는 동작을 잠그는 스위치.
//
// PUBLIC_DEMO=true 이면 데이터 삭제 계열 API가 전부 거부됩니다.
// 접근 비밀번호(SITE_PASSWORD)를 아는 사람이라도 남의 수집 데이터를 날리지
// 못하게 하는 두 번째 방어선입니다. 로컬에서는 설정하지 않으면 그대로 동작합니다.

import { NextResponse } from "next/server";

export function isPublicDemo(): boolean {
  const v = process.env.PUBLIC_DEMO;
  return v === "true" || v === "1";
}

/**
 * 공개 모드에서 막아야 하는 동작이면 응답을 돌려주고, 아니면 null을 돌려줍니다.
 * 라우트 맨 앞에서 `const blocked = blockIfPublicDemo(); if (blocked) return blocked;`
 * 형태로 씁니다.
 */
export function blockIfPublicDemo(
  message = "공개 모드에서는 데이터를 삭제할 수 없습니다.",
): NextResponse | null {
  if (!isPublicDemo()) return null;
  return NextResponse.json({ error: message }, { status: 403 });
}
