import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";

export default function UploadWidget() {
  const navigate = useNavigate();

  return (
    <Card className="rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200">
      <CardHeader>
        <CardTitle className="text-base font-display">Upload New Contract</CardTitle>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-accent/50 bg-secondary/30 hover:bg-secondary/50 transition-all duration-200 p-6 text-center"
          onClick={() => navigate("/dashboard/contracts")}
        >
          <UploadCloud className="h-8 w-8 mx-auto text-accent mb-2" />
          <p className="text-sm font-medium">Drag & Drop PDF</p>
          <p className="text-xs text-muted-foreground mt-1">or click to open upload page</p>
        </button>
        <Button className="w-full mt-4" variant="outline" onClick={() => navigate("/dashboard/contracts")}>
          Go To Contracts
        </Button>
      </CardContent>
    </Card>
  );
}
