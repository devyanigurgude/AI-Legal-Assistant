import React from "react";
import ContractDetails from "@/components/Contracts/ContractDetails";
import { Loader2, AlertCircle } from "lucide-react";
import { useContracts } from "@/hooks/useContracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AnalysisPage() {
  const { contracts, loading, error, selectedId, setSelectedId, refreshContracts } = useContracts({
    autoSelectFirst: true,
  });
  const hasContracts = contracts.length > 0;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-display">Risk Analysis</h1>
        <p className="text-sm text-muted-foreground">Choose a contract to view or refresh its saved risk analysis.</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="py-5">
          {hasContracts ? (
            <Select value={selectedId ? String(selectedId) : undefined} 
            onValueChange={(value) => setSelectedId(value)}>
              <SelectTrigger className="w-full sm:w-[320px]">
                <SelectValue placeholder="Select contract" />
              </SelectTrigger>
              
              <SelectContent>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={String(contract.id)}>
                    {contract.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Button type="button" variant="outline" className="w-full sm:w-[320px] justify-start" disabled>
              {loading ? "Loading contracts..." : "No contracts available"}
            </Button>
          )}
        </CardContent>
      </Card>

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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : selectedId ? (
        <ContractDetails contractId={selectedId} />
      ) : (
        <p className="text-muted-foreground text-center py-12">Upload a contract first to run analysis</p>
      )}
    </div>
  );
}
