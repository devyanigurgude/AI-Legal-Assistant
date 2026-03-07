import React from "react";
import UploadContract from "@/components/Contracts/UploadContract";
import ContractList from "@/components/Contracts/ContractList";
import ContractDetails from "@/components/Contracts/ContractDetails";
import { useContracts } from "@/hooks/useContracts";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function ContractsPage() {
  const { contracts, loading, error, selectedId, setSelectedId, refreshContracts } = useContracts();

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-display">Contracts</h1>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <UploadContract onUploaded={refreshContracts} />
          <ContractList
            contracts={contracts}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRefresh={refreshContracts}
          />
        </div>
        <div className="lg:col-span-2">
          {selectedId ? (
            <ContractDetails contractId={selectedId} />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Select a contract to view its analysis
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
