import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  score?: number; // 0-100
  level?: "high" | "medium" | "low" | string | null;
}

const levelConfig = {
  high: { label: "High Risk", badgeClass: "risk-badge-high", color: "text-risk-high" },
  medium: { label: "Medium Risk", badgeClass: "risk-badge-medium", color: "text-risk-medium" },
  low: { label: "Low Risk", badgeClass: "risk-badge-low", color: "text-risk-low" },
};

export default function RiskSummary({ score, level }: Props) {
  const safeLevel = (level ?? "").toLowerCase();
  const config =
    levelConfig[safeLevel as keyof typeof levelConfig] ?? levelConfig.low;
  const safeScore = typeof score === "number" && Number.isFinite(score) ? score : 0;

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" />
          Risk Assessment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className={`text-4xl font-bold font-display ${config.color}`}>{safeScore}</div>
          <div>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${config.badgeClass}`}>
              {config.label}
            </span>
            <p className="text-sm text-muted-foreground mt-1">Overall risk score out of 100</p>
          </div>
        </div>
        <Progress value={safeScore} className="h-2" />
      </CardContent>
    </Card>
  );
}
