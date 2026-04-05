import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { RagMessage } from "@/types/api";

interface ChatState {
  /** Map of contractId → messages */
  history: Record<string, RagMessage[]>;
}

interface ChatContextValue extends ChatState {
  addMessage: (contractId: string, message: RagMessage) => void;
  clearHistory: (contractId: string) => void;
  getMessages: (contractId: string) => RagMessage[];
  setMessages: (contractId: string, messages: RagMessage[]) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<Record<string, RagMessage[]>>({});

  const addMessage = useCallback((contractId: string, message: RagMessage) => {
    setHistory((prev) => ({
      ...prev,
      [contractId]: [...(prev[contractId] || []), message],
    }));
  }, []);

  const setMessages = useCallback((contractId: string, messages: RagMessage[]) => {
    setHistory((prev) => ({
      ...prev,
      [contractId]: messages,
    }));
  }, []);

  const clearHistory = useCallback((contractId: string) => {
    setHistory((prev) => {
      const next = { ...prev };
      delete next[contractId];
      return next;
    });
  }, []);

  const getMessages = useCallback(
    (contractId: string) => history[contractId] || [],
    [history]
  );

  return (
    <ChatContext.Provider value={{ history, addMessage, clearHistory, getMessages, setMessages }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
