export interface Contract {
  id: string;
  filename: string;
  uploaded_at?: string;
  summary?: string;
  risk_classification?: string;
  suggested_improvements?: string;
  analysis?: Partial<ContractAnalysis>;
}

export interface Clause {
  id: string;
  type: string;
  text: string;
  risk_level: "high" | "medium" | "low";
}

export interface ClauseExplanationRequest {
  clause_text: string;
  clause_type: string;
  risk_level: string;
}

export interface ClauseExplanationResponse {
  simple_explanation: string;
  example: string;
  risk_reason: string;
  suggestions: string[];
  complexity_level: string;
}

export interface ContractAnalysis {
  risk_score: number;
  risk_level: "high" | "medium" | "low";
  layman_summary: string;
  clauses: Clause[];
}

export interface RagChunk {
  text: string;
  score: number;
  page?: number;
}

export interface RagMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  chunks?: RagChunk[];
}

export interface User {
  name?: string;
  email?: string;
}
