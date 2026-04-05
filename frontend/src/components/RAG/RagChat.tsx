import React, { useState, useRef, useEffect } from "react";
import { analyzeContract, getChatMessages, saveChatMessage } from "@/services/apiService";
import { useChat } from "@/context/ChatContext";
import type { RagMessage } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  contractId: string;
}

export default function RagChat({ contractId }: Props) {
  const { getMessages, addMessage, clearHistory, setMessages } = useChat();
  const messages = getMessages(contractId);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const history = await getChatMessages(contractId);
        if (cancelled) return;
        setMessages(contractId, history);
      } catch {
        if (cancelled) return;
        setMessages(contractId, []);
      } finally {
        if (cancelled) return;
        setHistoryLoading(false);
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [contractId, setMessages]);

  const handleSend = async () => {
    const q = query.trim();
    if (!q || loading || historyLoading) return;
    setQuery("");

    const userMsg: RagMessage = { role: "user", content: q, timestamp: new Date().toISOString() };
    addMessage(contractId, userMsg);
    try {
      await saveChatMessage(contractId, { role: "user", content: q });
    } catch {}

    setLoading(true);
    try {
      const res = await analyzeContract(contractId, q);
      const assistantMsg: RagMessage = {
        role: "assistant",
        content: typeof res?.ai_answer === "string" ? res.ai_answer : "No answer returned.",
        timestamp: new Date().toISOString(),
      };
      addMessage(contractId, assistantMsg);
      try {
        await saveChatMessage(contractId, {
          role: "assistant",
          content: assistantMsg.content,
        });
      } catch {}
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
                <p className="text-muted-foreground text-sm">
                  {historyLoading ? "Loading chat history..." : "Ask questions about your contract"}
                </p>
                {!historyLoading && (
                  <p className="text-xs text-muted-foreground/60 mt-1">e.g. "What are the termination clauses?"</p>
                )}
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
            disabled={loading || historyLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!query.trim() || loading || historyLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
