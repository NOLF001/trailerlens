import type { Metadata } from "next";

export const metadata: Metadata = { title: "데이터 처리 안내" };

export default function PrivacyPage() {
  return (
    <article className="prose-invert mx-auto max-w-3xl space-y-6 leading-relaxed">
      <div>
        <h1 className="text-xl font-bold">데이터 처리 안내</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          TrailerLens가 어떤 데이터를 어떻게 다루는지 설명합니다.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">수집하는 데이터</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>YouTube Data API가 제공하는 공개 영상 메타데이터(제목, 조회수 등)</li>
          <li>공개 댓글과 답글(작성자 표시 이름, 내용, 좋아요 수, 작성 시각)</li>
          <li>
            채널 소유자 모드에서만: 소유자 본인이 Google 로그인으로 허용한 YouTube
            Analytics 시청 유지율 데이터
          </li>
          <li>삭제·숨김·검토 대기·스팸 처리된 댓글은 수집할 수 없습니다</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">LLM(Claude)으로 보내는 데이터</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            댓글 <strong>내용, 좋아요 수, 답글 여부만</strong> 전송하며 작성자
            이름과 채널 ID 등 식별 정보는 전송 전에 제거합니다.
          </li>
          <li>
            댓글 내용은 분석 대상 데이터로만 취급되며, 댓글 안의 지시문을 따르지
            않도록 시스템 프롬프트에 명시되어 있습니다(프롬프트 인젝션 방어).
          </li>
          <li>보고서 요약은 개인이 아닌 집단 수준으로만 작성됩니다.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">저장과 삭제</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>수집 데이터는 운영자가 관리하는 데이터베이스에 저장됩니다.</li>
          <li>
            각 분석 페이지의 삭제 버튼 또는 설정의 &lsquo;모든 분석 데이터
            삭제&rsquo;로 언제든 제거할 수 있습니다.
          </li>
          <li>API 키는 서버 환경 변수로만 관리되며 브라우저로 전송되지 않습니다.</li>
          <li>로그에는 댓글 전문이나 API 키를 기록하지 않습니다.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">반복 재생 데이터에 대한 정직한 표기</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            YouTube의 공개 &lsquo;가장 많이 다시 본 구간&rsquo; 데이터는 공식 Data
            API로 제공되지 않습니다.
          </li>
          <li>
            보고서의 모든 히트맵 값은 <strong>정규화된 상대 강도(0~1)</strong>이며,
            시청자 수나 유지율 퍼센트가 아닙니다. 출처(공식 Analytics / 수동 입력 /
            비공식 공개 히트맵 / 데모)를 배지로 구분해 표시합니다.
          </li>
          <li>YouTube 영상을 임의로 다운로드하는 기능은 제공하지 않습니다.</li>
        </ul>
      </section>
    </article>
  );
}
