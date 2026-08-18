import type { Metadata } from "next";
import { AnalysisView } from "@/components/analysis/AnalysisView";

export const metadata: Metadata = { title: "분석 보고서" };

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AnalysisView id={id} />;
}
