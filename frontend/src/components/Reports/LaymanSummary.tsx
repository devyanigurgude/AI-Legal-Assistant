import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

interface Props {
  summary: string;
}

function cleanInlineMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSummary(summary: string) {
  return summary
    .replace(/\r\n/g, "\n")
    .replace(/(?<=\S)\s+\*\s+/g, "\n* ")
    .replace(/(?<=\S)\s+-\s+/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type SummaryBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; title?: string; items: string[] };

function buildBlocks(summary: string): SummaryBlock[] {
  const normalized = normalizeSummary(summary);
  if (!normalized) return [];

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: SummaryBlock[] = [];
  let currentList: { title?: string; items: string[] } | null = null;

  const flushList = () => {
    if (currentList && currentList.items.length > 0) {
      blocks.push({ type: "list", title: currentList.title, items: currentList.items });
    }
    currentList = null;
  };

  for (const rawLine of lines) {
    const bulletMatch = rawLine.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      const cleaned = cleanInlineMarkdown(bulletMatch[1] ?? "");
      const sectionMatch = cleaned.match(/^(.+?):\s*(.+)$/);

      if (sectionMatch) {
        const title = cleanInlineMarkdown(sectionMatch[1] ?? "");
        const value = cleanInlineMarkdown(sectionMatch[2] ?? "");
        flushList();
        currentList = { title, items: value ? [value] : [] };
        continue;
      }

      if (!currentList) {
        currentList = { items: [] };
      }
      if (cleaned) {
        currentList.items.push(cleaned);
      }
      continue;
    }

    flushList();
    const cleaned = cleanInlineMarkdown(rawLine);
    if (cleaned) {
      blocks.push({ type: "paragraph", text: cleaned });
    }
  }

  flushList();
  return blocks;
}

export default function LaymanSummary({ summary }: Props) {
  const blocks = buildBlocks(summary);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-accent" />
          Plain English Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blocks.length === 0 ? (
          <p className="text-sm leading-relaxed text-foreground/85">{summary}</p>
        ) : (
          <div className="space-y-4 text-sm text-foreground/85">
            {blocks.map((block, index) =>
              block.type === "paragraph" ? (
                <p key={`${block.type}-${index}`} className="leading-relaxed">
                  {block.text}
                </p>
              ) : (
                <section key={`${block.type}-${index}`} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  {block.title ? <h3 className="mb-2 font-medium text-foreground">{block.title}</h3> : null}
                  <ul className="space-y-2">
                    {block.items.map((item, itemIndex) => (
                      <li key={`${index}-${itemIndex}`} className="flex gap-2 leading-relaxed">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
