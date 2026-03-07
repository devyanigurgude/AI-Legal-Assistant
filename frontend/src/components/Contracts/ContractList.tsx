import React from "react";
import { deleteContract } from "@/services/apiService";
import type { Contract } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Loader2 } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";

interface Props {
  contracts: Contract[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

export default function ContractList({ contracts, loading, selectedId, onSelect, onRefresh }: Props) {
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState("");
  const formatUploadedAt = (value?: string) => {
    if (!value) return "Unknown date";
    const d = parseISO(value);
    if (!isValid(d)) return "Unknown date";
    return format(d, "MMM d, yyyy");
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteError("");
    setDeleting(id);
    try {
      await deleteContract(id);
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setDeleteError(message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-accent" />
          Your Contracts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {deleteError && <p className="text-sm text-destructive mb-3">{deleteError}</p>}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contracts.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No contracts uploaded yet</p>
        ) : (
          <div className="space-y-2">
            {contracts.map((c) => (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedId === c.id ? "bg-accent/10 border border-accent/30" : "bg-secondary/50 hover:bg-secondary"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{c.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatUploadedAt(c.uploaded_at)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDelete(c.id, e)}
                  disabled={deleting === c.id}
                >
                  {deleting === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
