import React from "react";
import { explainClause } from "@/services/api";
import type { Clause, ClauseExplanationResponse } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, Tag } from "lucide-react";

interface Props {
  clauses?: Clause[] | null;
}

const riskBadge = {
  high: "risk-badge-high",
  medium: "risk-badge-medium",
  low: "risk-badge-low",
};

export default function ClauseClassification({ clauses }: Props) {
  const safeClauses = Array.isArray(clauses) ? clauses : [];
  const [isExplainOpen, setIsExplainOpen] = React.useState(false);
  const [selectedClause, setSelectedClause] = React.useState<Clause | null>(null);
  const [explanation, setExplanation] = React.useState<ClauseExplanationResponse | null>(null);
  const [loadingExplanation, setLoadingExplanation] = React.useState(false);
  const [explainError, setExplainError] = React.useState("");
  const requestIdRef = React.useRef(0);

  const resetExplainState = React.useCallback(() => {
    requestIdRef.current += 1;
    setSelectedClause(null);
    setExplanation(null);
    setExplainError("");
    setLoadingExplanation(false);
  }, []);

  const handleOpenChange = (open: boolean) => {
    setIsExplainOpen(open);
    if (!open) resetExplainState();
  };

  const handleExplain = async (clause: Clause) => {
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    setSelectedClause(clause);
    setExplanation(null);
    setExplainError("");
    setLoadingExplanation(true);
    setIsExplainOpen(true);

    try {
      const data = await explainClause({
        clause_text: clause?.text ?? "",
        clause_type: clause?.type ?? "Uncategorized",
        risk_level: clause?.risk_level ?? "low",
      });

      if (requestIdRef.current === currentRequestId) {
        setExplanation(data);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Could not fetch explanation. Please try again.";
      if (requestIdRef.current === currentRequestId) {
        setExplainError(errorMessage);
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingExplanation(false);
      }
    }
  };

  return (
    <>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Tag className="h-5 w-5 text-accent" />
            Clause Classification
          </CardTitle>
        </CardHeader>
        <CardContent>
          {safeClauses?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No clauses identified</p>
          ) : (
            <div className="space-y-3">
              {safeClauses.map((clause, index) => (
                <div
                  key={clause?.id ?? index}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleExplain(clause)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleExplain(clause);
                    }
                  }}
                  className="p-3 rounded-lg bg-secondary/50 border border-border hover:border-accent/50 hover:bg-secondary cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {clause?.type ?? "Uncategorized"}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          riskBadge[clause?.risk_level as keyof typeof riskBadge] ?? riskBadge.low
                        }`}
                      >
                        {clause?.risk_level ?? "low"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExplain(clause);
                      }}
                    >
                      Explain
                    </Button>
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{clause?.text ?? "No clause text available"}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isExplainOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Clause Explanation
            </DialogTitle>
            <DialogDescription>
              {selectedClause ? `Type: ${selectedClause.type || "Uncategorized"}` : "Loading selected clause..."}
            </DialogDescription>
          </DialogHeader>

          {loadingExplanation ? (
            <div className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Generating explanation...
            </div>
          ) : explainError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {explainError}
            </div>
          ) : explanation ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  Complexity: {explanation.complexity_level || "unknown"}
                </Badge>
              </div>

              <section className="space-y-1">
                <h4 className="text-sm font-semibold">Simple Explanation</h4>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {explanation.simple_explanation || "No explanation available."}
                </p>
              </section>

              <section className="space-y-1">
                <h4 className="text-sm font-semibold">Example</h4>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {explanation.example || "No example available."}
                </p>
              </section>

              <section
                className={`space-y-1 rounded-md border p-3 ${
                  (selectedClause?.risk_level || "").toLowerCase() === "high"
                    ? "border-destructive/50 bg-destructive/10"
                    : "border-border bg-secondary/30"
                }`}
              >
                <h4 className="text-sm font-semibold">Risk Reason</h4>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {explanation.risk_reason || "No risk reason available."}
                </p>
              </section>

              <section className="space-y-1">
                <h4 className="text-sm font-semibold">Suggestions</h4>
                {Array.isArray(explanation.suggestions) && explanation.suggestions.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/85">
                    {explanation.suggestions.map((suggestion, index) => (
                      <li key={`${selectedClause?.id || "clause"}-suggestion-${index}`}>{suggestion}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No suggestions available.</p>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
