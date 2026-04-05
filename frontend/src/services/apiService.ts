const API_BASE = "http://127.0.0.1:8000";

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseError = async (res: Response, fallback: string) => {
  try {
    const data = await res.json();
    return data?.detail || fallback;
  } catch {
    return fallback;
  }
};

// ================= AUTH =================

export const registerUser = async (username: string, password: string) => {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Registration failed");
  return data;
};

export const loginUser = async (username: string, password: string) => {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Login failed");

  localStorage.setItem("token", data.access_token);
  return data;
};

export const getMe = async () => {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error(await parseError(res, "Failed to load user"));
  return res.json();
};

// ================= CONTRACTS =================

export const uploadContract = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/contracts`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Upload failed");
  return data;
};

export const listContracts = async () => {
  const res = await fetch(`${API_BASE}/contracts`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch contracts"));
  return res.json();
};

export const getContract = async (contractId: string) => {
  const res = await fetch(`${API_BASE}/contracts/${contractId}`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch contract"));
  return res.json();
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const normalizeChatMessage = (value: unknown) => {
  const record = asRecord(value);
  const createdAt =
    typeof record.created_at === "string"
      ? record.created_at
      : typeof record.timestamp === "string"
      ? record.timestamp
      : new Date().toISOString();

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    contract_id: typeof record.contract_id === "string" ? record.contract_id : undefined,
    user_id: typeof record.user_id === "string" ? record.user_id : undefined,
    role: record.role === "assistant" ? "assistant" : "user",
    content: typeof record.content === "string" ? record.content : "",
    created_at: createdAt,
    timestamp: createdAt,
  } as const;
};

export const normalizeContractAnalysis = (data: unknown) => {
  const root = asRecord(data);
  const nested = asRecord(root.analysis);
  const source = Object.keys(nested).length > 0 ? nested : root;

  const riskScore = Number(source.risk_score ?? 0);
  const normalizedRiskScore = Number.isFinite(riskScore) ? riskScore : 0;
  const riskLevelRaw = String(source.risk_level ?? "").toLowerCase();
  const riskLevel =
    riskLevelRaw === "high" || riskLevelRaw === "medium" || riskLevelRaw === "low"
      ? riskLevelRaw
      : "low";
  const summary = String(source.summary ?? root.summary ?? "");
  const clauses = Array.isArray(source.clauses) ? source.clauses : [];

  return {
    risk_score: normalizedRiskScore,
    risk_level: riskLevel,
    layman_summary: String(source.layman_summary ?? summary),
    summary,
    clauses,
    answer: String(source.answer ?? summary),
    chunks: Array.isArray(source.chunks) ? source.chunks : [],
  };
};

export const analyzeContract = async (contractId: string, query: string) => {
  const res = await fetch(`${API_BASE}/query/v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      contract_id: contractId,
      query,
      top_k: 3,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to get AI response"));
  }

  return res.json(); // { ai_answer: "text", results: [...] }
};

export const runContractAnalysis = async (contractId: string) => {
  const res = await fetch(`${API_BASE}/contracts/${contractId}/analyze`, {
    method: "POST",
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to run contract analysis"));
  }

  return res.json();
};

export const queryContractV2 = async (
  contractId: string,
  query: string,
  options?: { top_k?: number; conversation_id?: string; stream?: boolean }
) => {
  const res = await fetch(`${API_BASE}/query/v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      contract_id: contractId,
      query,
      top_k: options?.top_k ?? 3,
      conversation_id: options?.conversation_id,
      stream: options?.stream ?? false,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Chat query failed");
  return data;
};

export const getChatMessages = async (contractId: string) => {
  const res = await fetch(`${API_BASE}/chat/${contractId}/messages`, {
    headers: authHeaders(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to load chat history");

  const messages = Array.isArray(data?.messages) ? data.messages : [];
  return messages.map(normalizeChatMessage);
};

export const saveChatMessage = async (
  contractId: string,
  payload: { role: "user" | "assistant"; content: string }
) => {
  const res = await fetch(`${API_BASE}/chat/${contractId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to save chat message");
  return normalizeChatMessage(data);
};

export const deleteContract = async (contractId: string) => {
  const res = await fetch(`${API_BASE}/contracts/${contractId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error(await parseError(res, "Delete failed"));
  return true;
};

export const explainClause = async (payload: {
  clause_text: string;
  clause_type: string;
  risk_level: string;
}) => {
  const res = await fetch(`${API_BASE}/explain-clause`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to explain clause");
  return data;
};

export const downloadContractReport = async (contractId: string) => {
  const res = await fetch(`${API_BASE}/report/${contractId}`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error(await parseError(res, "Report download is not available"));
  return res.blob();
};

export interface ClauseExplanationResponse {
  simple_explanation: string;
  example: string;
  risk_reason: string;
  suggestions: string[];
  complexity_level: string;
}
