import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, ShieldAlert, ShieldCheck, Shield, MessageSquare, BarChart3, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useContracts } from "@/hooks/useContracts";
import { getContract } from "@/services/apiService";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentContracts from "@/components/dashboard/RecentContracts";
import RiskChart from "@/components/dashboard/RiskChart";
import { Button } from "@/components/ui/button";
import type { Contract } from "@/types/api";

const features = [
  { label: "Contracts", icon: FileText, path: "/dashboard/contracts", desc: "Upload & manage agreements" },
  { label: "Risk Analysis", icon: Shield, path: "/dashboard/analysis", desc: "Assess and classify risk" },
  { label: "AI Chat", icon: MessageSquare, path: "/dashboard/chat", desc: "Ask contract questions instantly" },
  { label: "Reports", icon: BarChart3, path: "/dashboard/reports", desc: "Generate downloadable summaries" },
];

export default function OverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { contracts, loading, error, refreshContracts } = useContracts();
  const [enrichedContracts, setEnrichedContracts] = useState<Contract[]>([]);
  const [enrichLoading, setEnrichLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const enrich = async () => {
      if (contracts.length === 0) {
        if (active) setEnrichedContracts([]);
        return;
      }

      setEnrichLoading(true);

      const detailed = await Promise.all(
        contracts.map(async (contract) => {
          try {
            const full = await getContract(contract.id);
            const fullAnalysis =
              full && typeof full === "object" && full.analysis && typeof full.analysis === "object"
                ? (full.analysis as Contract["analysis"])
                : contract.analysis;

            return {
              ...contract,
              analysis: fullAnalysis,
            } as Contract;
          } catch {
            return contract;
          }
        })
      );

      if (active) {
        setEnrichedContracts(detailed);
        setEnrichLoading(false);
      }
    };

    enrich();

    return () => {
      active = false;
    };
  }, [contracts]);

  const riskCounts = useMemo(() => {
    return enrichedContracts.reduce(
      (acc, contract) => {
        const c = contract as {
          risk_score?: number | string;
          riskScore?: number | string;
          analysis?: {
            risk_score?: number | string;
            riskScore?: number | string;
          };
        };

        const score = c.risk_score ?? c.riskScore ?? c.analysis?.risk_score ?? c.analysis?.riskScore ?? null;

        if (score === null || score === undefined) return acc;

        const numericScore = Number(score);
        if (Number.isNaN(numericScore)) return acc;
        const normalizedScore = numericScore > 1 ? numericScore / 100 : numericScore;

        if (normalizedScore > 0.7) acc.high += 1;
        else if (normalizedScore > 0.4) acc.medium += 1;
        else acc.low += 1;

        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );
  }, [enrichedContracts]);

  const highRisk = riskCounts.high;
  const mediumRisk = riskCounts.medium;
  const lowRisk = riskCounts.low;

  const chartData = useMemo(
    () => [
      { name: "High Risk", value: highRisk },
      { name: "Medium Risk", value: mediumRisk },
      { name: "Low Risk", value: lowRisk },
    ],
    [highRisk, mediumRisk, lowRisk]
  );

  useEffect(() => {
    if (enrichedContracts.length === 0) return;

    const hasRiskData = enrichedContracts.some((contract) => {
      const c = contract as {
        risk_score?: number | string;
        riskScore?: number | string;
        analysis?: {
          risk_score?: number | string;
          riskScore?: number | string;
        };
      };
      return (
        c.risk_score !== undefined ||
        c.riskScore !== undefined ||
        c.analysis?.risk_score !== undefined ||
        c.analysis?.riskScore !== undefined
      );
    });

    if (!hasRiskData) {
      console.log("Contracts data:", enrichedContracts);
    }
  }, [enrichedContracts]);

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
        <StatsCard label="High Risk Contracts" value={highRisk} icon={ShieldAlert} toneClass="bg-destructive/10" />
        <StatsCard label="Medium Risk Contracts" value={mediumRisk} icon={Shield} toneClass="bg-risk-medium/15" />
        <StatsCard label="Low Risk Contracts" value={lowRisk} icon={ShieldCheck} toneClass="bg-risk-low/15" />
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
          {loading || enrichLoading ? (
            <Card className="rounded-xl border bg-card">
              <CardContent className="p-6 text-sm text-muted-foreground">Loading recent contracts...</CardContent>
            </Card>
          ) : (
            <RecentContracts contracts={enrichedContracts} />
          )}
        </div>
        <div>
          <RiskChart chartData={chartData} />
        </div>
      </section>
    </div>
  );
}
