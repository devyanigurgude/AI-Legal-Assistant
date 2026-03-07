import React, { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, ShieldAlert, ShieldCheck, Shield, MessageSquare, BarChart3, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useContracts } from "@/hooks/useContracts";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentContracts from "@/components/dashboard/RecentContracts";
import RiskChart from "@/components/dashboard/RiskChart";
import { Button } from "@/components/ui/button";

const features = [
  { label: "Contracts", icon: FileText, path: "/dashboard/contracts", desc: "Upload & manage agreements" },
  { label: "Risk Analysis", icon: Shield, path: "/dashboard/analysis", desc: "Assess and classify risk" },
  { label: "AI Chat", icon: MessageSquare, path: "/dashboard/chat", desc: "Ask contract questions instantly" },
  { label: "Reports", icon: BarChart3, path: "/dashboard/reports", desc: "Generate downloadable summaries" },
];

const getRiskLevel = (contract: { analysis?: { risk_level?: string; risk_score?: number }; risk_classification?: string; risk_score?: number }) => {
  const score = typeof contract.analysis?.risk_score === "number" ? contract.analysis.risk_score : typeof contract.risk_score === "number" ? contract.risk_score : undefined;

  if (typeof score === "number") {
    if (score > 0.7) return "high";
    if (score > 0.4) return "medium";
    return "low";
  }

  const raw = String(contract.analysis?.risk_level ?? contract.risk_classification ?? "").toLowerCase();
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "";
};

export default function OverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { contracts, loading, error, refreshContracts } = useContracts();

  const highRiskCount = contracts.filter((contract) => getRiskLevel(contract) === "high").length;
  const mediumRiskCount = contracts.filter((contract) => getRiskLevel(contract) === "medium").length;
  const lowRiskCount = contracts.filter((contract) => getRiskLevel(contract) === "low").length;

  useEffect(() => {
    if (contracts.length === 0) return;

    const hasRiskData = contracts.some((contract) => {
      const hasScore =
        typeof contract.analysis?.risk_score === "number" ||
        typeof (contract as { risk_score?: number }).risk_score === "number";
      const hasRiskLabel = Boolean(contract.analysis?.risk_level ?? contract.risk_classification);
      return hasScore || hasRiskLabel;
    });

    if (!hasRiskData) {
      console.log("Dashboard risk data missing. Contract object sample:", contracts[0]);
    }
  }, [contracts]);

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-display">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
        <p className="text-muted-foreground mt-1">Manage your contracts and run AI-powered analysis.</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={refreshContracts}>
            Retry
          </Button>
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard label="Total Contracts" value={contracts.length} icon={FileText} />
        <StatsCard label="High Risk Contracts" value={highRiskCount} icon={ShieldAlert} toneClass="bg-destructive/10" />
        <StatsCard label="Medium Risk Contracts" value={mediumRiskCount} icon={Shield} toneClass="bg-risk-medium/15" />
        <StatsCard label="Low Risk Contracts" value={lowRiskCount} icon={ShieldCheck} toneClass="bg-risk-low/15" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {features.map((feature) => (
          <Card
            key={feature.label}
            className="rounded-xl border bg-card shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
            onClick={() => navigate(feature.path)}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-11 w-11 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                <feature.icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-semibold text-sm">{feature.label}</p>
                <p className="text-xs text-muted-foreground">{feature.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {loading ? (
            <Card className="rounded-xl border bg-card">
              <CardContent className="p-6 text-sm text-muted-foreground">Loading recent contracts...</CardContent>
            </Card>
          ) : (
            <RecentContracts contracts={contracts} />
          )}
        </div>
        <div>
          <RiskChart high={highRiskCount} medium={mediumRiskCount} low={lowRiskCount} />
        </div>
      </section>
    </div>
  );
}
