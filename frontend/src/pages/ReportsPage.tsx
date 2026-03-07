import React, { useState, useEffect } from "react";
import { getContract, normalizeContractAnalysis } from "@/services/apiService";
import type { ContractAnalysis } from "@/types/api";
import PdfDownload from "@/components/Reports/PdfDownload";
import LaymanSummary from "@/components/Reports/LaymanSummary";
import RiskSummary from "@/components/Risk/RiskSummary";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { useContracts } from "@/hooks/useContracts";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  const { contracts, loading, error, selectedId, setSelectedId, refreshContracts } = useContracts({
    autoSelectFirst: true,
  });
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    if (!selectedId) {
      setAnalysis(null);
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError("");
    getContract(selectedId)
      .then((data) => setAnalysis(normalizeContractAnalysis(data)))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load report data.";
        setAnalysis(null);
        setAnalysisError(message);
      })
      .finally(() => setAnalysisLoading(false));
  }, [selectedId]);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-display">Reports</h1>
        {!loading && contracts.length > 0 && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select contract" />
            </SelectTrigger>
            <SelectContent>
              {contracts.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.filename}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
      {analysisError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {analysisError}
        </div>
      )}

      {loading || analysisLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : selectedId ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {analysis && <RiskSummary score={analysis.risk_score} level={analysis.risk_level} />}
            {analysis && <LaymanSummary summary={analysis.layman_summary} />}
          </div>
          <PdfDownload contractId={selectedId} />
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-12">Upload a contract first to view reports</p>
      )}
    </div>
  );
}
