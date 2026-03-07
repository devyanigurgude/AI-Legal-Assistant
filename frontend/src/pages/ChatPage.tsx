import React from "react";
import RagChat from "@/components/RAG/RagChat";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { useContracts } from "@/hooks/useContracts";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
  const { contracts, loading, error, selectedId, setSelectedId, refreshContracts } = useContracts({
    autoSelectFirst: true,
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-display">AI Chat</h1>
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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : selectedId ? (
        <RagChat contractId={selectedId} />
      ) : (
        <p className="text-muted-foreground text-center py-12">Upload a contract first to start chatting</p>
      )}
    </div>
  );
}
