import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Contract } from "@/types/api";
import { format, isValid, parseISO } from "date-fns";
import { FileText } from "lucide-react";

interface RecentContractsProps {
  contracts: Contract[];
}

const riskClassMap: Record<string, string> = {
  high: "risk-badge-high",
  medium: "risk-badge-medium",
  low: "risk-badge-low",
};

const formatUploadedAt = (value?: string) => {
  if (!value) return "Unknown date";
  const date = parseISO(value);
  if (!isValid(date)) return "Unknown date";
  return format(date, "MMM d, yyyy");
};

const getRiskLabel = (contract: Contract) => {
  const score = typeof contract.analysis?.risk_score === "number" ? contract.analysis.risk_score : undefined;
  if (typeof score === "number") {
    if (score > 0.7) return "high";
    if (score > 0.4) return "medium";
    return "low";
  }

  const raw = String(contract.analysis?.risk_level ?? contract.risk_classification ?? "low").toLowerCase();
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "low";
};

export default function RecentContracts({ contracts }: RecentContractsProps) {
  const recentContracts = [...contracts]
    .sort((a, b) => {
      const aDate = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
      const bDate = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 5);

  return (
    <Card className="rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200">
      <CardHeader>
        <CardTitle className="text-base font-display flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" />
          Recent Contracts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentContracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contracts uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {recentContracts.map((contract) => {
              const risk = getRiskLabel(contract);
              return (
                <div key={contract.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{contract.filename}</p>
                    <p className="text-xs text-muted-foreground">{formatUploadedAt(contract.uploaded_at)}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${riskClassMap[risk]}`}>{risk}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
