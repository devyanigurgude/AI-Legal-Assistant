import React, { useCallback, useEffect, useState } from "react";
import { analyzeContract, getContract, normalizeContractAnalysis } from "@/services/apiService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, FileSearch } from "lucide-react";
import RiskSummary from "@/components/Risk/RiskSummary";
import ClauseClassification from "@/components/Risk/ClauseClassification";
import LaymanSummary from "@/components/Reports/LaymanSummary";
import type { Clause } from "@/types/api";

interface Props {
  contractId: string;
}

export default function ContractDetails({ contractId }: Props) {
  const [analysis, setAnalysis] = useState<{
    risk_score: number;
    risk_level: "high" | "medium" | "low";
    layman_summary: string;
    clauses: Clause[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getContract(contractId);
      const stored = data?.analysis;
      const hasMeaningfulStoredAnalysis =
        !!stored &&
        typeof stored === "object" &&
        ((typeof stored?.summary === "string" && stored.summary.trim().length > 0) ||
          (Array.isArray(stored?.clauses) && stored.clauses.length > 0) ||
          (typeof stored?.risk_score === "number" && stored.risk_score > 0));
      setAnalysis(hasMeaningfulStoredAnalysis ? normalizeContractAnalysis(data) : null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch contract analysis.";
      setAnalysis(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError("");
    try {
      const data = await analyzeContract(contractId, "full_contract_analysis");
      setAnalysis(normalizeContractAnalysis(data));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      setError(message);
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-12 text-center">
          <FileSearch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No analysis available for this contract</p>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          <Button onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Run Analysis
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Contract Analysis</h2>
        <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Re-analyze
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <RiskSummary score={analysis.risk_score} level={analysis.risk_level} />
      <LaymanSummary summary={analysis.layman_summary} />
      <ClauseClassification clauses={analysis.clauses} />
    </div>
  );
}
