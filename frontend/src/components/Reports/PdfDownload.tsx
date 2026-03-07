import React, { useState } from "react";
import { downloadContractReport } from "@/services/apiService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileBarChart } from "lucide-react";

interface Props {
  contractId: string;
}

export default function PdfDownload({ contractId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    setLoading(true);
    setError("");
    try {
      const blob = await downloadContractReport(contractId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contract-report-${contractId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <FileBarChart className="h-5 w-5 text-accent" />
          Download Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Generate and download a comprehensive PDF report of the contract analysis.
        </p>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        <Button onClick={handleDownload} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Download PDF Report
        </Button>
      </CardContent>
    </Card>
  );
}
