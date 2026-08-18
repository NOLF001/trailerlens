import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/SettingsView";

export const metadata: Metadata = { title: "설정" };
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API 연동 상태와 데이터 소스, 저장된 데이터를 관리합니다.
        </p>
      </div>
      <SettingsView />
    </div>
  );
}
