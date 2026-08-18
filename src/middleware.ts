// 외부 공개용 접근 잠금.
//
// SITE_PASSWORD가 설정되어 있으면 모든 페이지와 API에 HTTP Basic 인증을 겁니다.
// 값이 비어 있으면 아무것도 하지 않으므로 로컬 개발에는 영향이 없습니다.
//
// 터널(cloudflared 등)로 내 PC를 인터넷에 노출할 때는 반드시 설정하세요.
// 이 앱에는 자체 로그인이 없어서, 이 잠금이 유일한 접근 통제입니다.

import { NextResponse, type NextRequest } from "next/server";

const REALM = 'Basic realm="TrailerLens", charset="UTF-8"';

/** 길이 차이로 정답을 유추당하지 않도록 전체를 비교합니다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  // 비밀번호에 콜론이 들어갈 수 있으므로 첫 콜론에서만 자릅니다.
  const separator = decoded.indexOf(":");
  const supplied = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (!safeEqual(supplied, password)) return unauthorized();

  return NextResponse.next();
}

export const config = {
  // 정적 자산은 제외해야 401 화면 자체가 정상적으로 그려집니다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
