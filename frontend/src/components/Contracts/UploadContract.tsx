import React, { useState, useCallback } from "react";
import { uploadContract } from "@/services/apiService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileUp, CheckCircle2 } from "lucide-react";

interface Props {
  onUploaded?: () => void;
}

export default function UploadContract({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (f.type !== "application/pdf") {
      setError("Only PDF files are accepted");
      return;
    }
    if (f.size === 0) {
      setError("The selected file is empty.");
      return;
    }
    setFile(f);
    setError("");
    setSuccess(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      await uploadContract(file);
      setSuccess(true);
      setFile(null);
      onUploaded?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Upload className="h-5 w-5 text-accent" />
          Upload Contract
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input id="file-input" type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileUp className="h-8 w-8 text-accent" />
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">Drag & drop a PDF or click to browse</p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 mt-3 text-sm text-risk-low">
            <CheckCircle2 className="h-4 w-4" />
            Contract uploaded successfully
          </div>
        )}

        <Button className="w-full mt-4" disabled={!file || loading} onClick={handleUpload}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Upload
        </Button>
      </CardContent>
    </Card>
  );
}
