import React, { useState, useRef, useEffect } from "react";
import { analyzeContract } from "@/services/apiService";
import { useChat } from "@/context/ChatContext";
import type { RagMessage, RagChunk } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Trash2, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  contractId: string;
}

function ChunkList({ chunks }: { chunks?: RagChunk[] | null }) {
  const [open, setOpen] = useState(false);
  const safeChunks = Array.isArray(chunks) ? chunks : [];
  if (!safeChunks.length) return null;

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-accent flex items-center gap-1 hover:underline">
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        {safeChunks.length} source chunk{safeChunks.length > 1 ? "s" : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {safeChunks.map((c, i) => (
            <div key={i} className="text-xs bg-secondary/50 p-2 rounded border border-border">
              <span className="text-muted-foreground">
                Score: {typeof c?.score === "number" ? c.score.toFixed(3) : "0.000"}
                {c?.page ? ` | Page ${c.page}` : ""}
              </span>
              <p className="mt-1 text-foreground/80">{(c?.text ?? "").slice(0, 200)}...</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RagChat({ contractId }: Props) {
  const { getMessages, addMessage, clearHistory } = useChat();
  const messages = getMessages(contractId);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setQuery("");

    const userMsg: RagMessage = { role: "user", content: q, timestamp: new Date().toISOString() };
    addMessage(contractId, userMsg);

    setLoading(true);
    try {
      const res = await analyzeContract(contractId, q);
      const assistantMsg: RagMessage = {
        role: "assistant",
        content: typeof res?.ai_answer === "string" ? res.ai_answer : "No answer returned.",
        chunks: Array.isArray(res?.results) ? res.results : [],
        timestamp: new Date().toISOString(),
      };
      addMessage(contractId, assistantMsg);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to get response";
      const errMsg: RagMessage = {
        role: "assistant",
        content: `Error: ${message}`,
        timestamp: new Date().toISOString(),
      };
      addMessage(contractId, errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-card flex flex-col h-[600px]">
      <CardHeader className="shrink-0 flex-row items-center justify-between">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-accent" />
          Contract AI Chat
        </CardTitle>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => clearHistory(contractId)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 pb-4">
        <ScrollArea className="flex-1 pr-3">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full py-16 text-center">
              <div>
                <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Ask questions about your contract</p>
                <p className="text-xs text-muted-foreground/60 mt-1">e.g. "What are the termination clauses?"</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.chunks && <ChunkList chunks={msg.chunks} />}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-xl px-4 py-3 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse-dot" />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse-dot [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse-dot [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        <form
          className="flex gap-2 mt-3 pt-3 border-t"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about this contract..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!query.trim() || loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
