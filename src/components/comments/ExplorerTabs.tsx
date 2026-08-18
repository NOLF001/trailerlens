"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryBrowser } from "@/components/comments/CategoryBrowser";
import { CommentExplorer } from "@/components/comments/CommentExplorer";

export function ExplorerTabs({ analysisId }: { analysisId: string }) {
  const [tab, setTab] = useState("category");
  const [presetTopic, setPresetTopic] = useState("");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="댓글 보기 방식">
        <TabsTrigger value="category">카테고리별 보기</TabsTrigger>
        <TabsTrigger value="list">전체 목록·필터</TabsTrigger>
      </TabsList>
      <TabsContent value="category">
        <CategoryBrowser
          analysisId={analysisId}
          onOpenTopic={(topic) => {
            setPresetTopic(topic);
            setTab("list");
          }}
        />
      </TabsContent>
      <TabsContent value="list">
        <CommentExplorer
          key={presetTopic || "all"}
          analysisId={analysisId}
          initialTopic={presetTopic}
        />
      </TabsContent>
    </Tabs>
  );
}
