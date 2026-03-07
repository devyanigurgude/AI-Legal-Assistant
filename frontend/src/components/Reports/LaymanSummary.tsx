import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

interface Props {
  summary: string;
}

export default function LaymanSummary({ summary }: Props) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-accent" />
          Plain English Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-foreground/85">{summary}</p>
      </CardContent>
    </Card>
  );
}
