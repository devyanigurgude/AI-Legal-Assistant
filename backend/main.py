from click import prompt
from PyPDF2 import PdfReader
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from database import engine, SessionLocal
from models import Base, Contract, User
import shutil
import os
import json
import re
import logging
from io import BytesIO
from pathlib import Path
from dotenv import load_dotenv
from google import genai  # Gemini client
from google.genai import types
from google.genai import errors as genai_errors
import faiss
import numpy as np
from auth import router as auth_router
from fastapi.middleware.cors import CORSMiddleware
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer
from pydantic import BaseModel
from typing import List
app = FastAPI()
logger = logging.getLogger("contract-ai")

allowed_origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Include auth endpoints
app.include_router(auth_router)
class ClauseExplainRequest(BaseModel):
    clause_text: str
    clause_type: str
    risk_level: str


class ClauseExplainResponse(BaseModel):
    simple_explanation: str
    example: str
    risk_reason: str
    suggestions: List[str]
    complexity_level: str

# For now, store vectors in-memory
embedding_dim = 1536  # size of Gemini embeddings
index = faiss.IndexFlatL2(embedding_dim)
vector_to_metadata = []

load_dotenv()

# Chat enhancements are opt-in so existing behavior remains unchanged.
def _env_flag(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


ENABLE_CHAT_STREAMING = _env_flag("ENABLE_CHAT_STREAMING", False)
ENABLE_CHAT_MEMORY = _env_flag("ENABLE_CHAT_MEMORY", False)
ENABLE_CHAT_CITATIONS = _env_flag("ENABLE_CHAT_CITATIONS", False)

# Optional in-memory memory store (only used when ENABLE_CHAT_MEMORY=true)
CHAT_MEMORY: dict[str, list[dict[str, str]]] = {}

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def _is_quota_or_rate_error(exc: Exception) -> bool:
    if isinstance(exc, genai_errors.ClientError):
        status = str(getattr(exc, "status_code", ""))
        message = str(exc).lower()
        return status == "429" or "resource_exhausted" in message or "quota" in message or "rate" in message
    msg = str(exc).lower()
    return "resource_exhausted" in msg or "quota" in msg or "rate limit" in msg or "429" in msg


def _safe_generate_content(prompt: str, *, temperature: float = 0.1) -> str:
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=temperature),
        )
        return str(response.text or "").strip()
    except Exception as exc:
        if _is_quota_or_rate_error(exc):
            logger.warning("Gemini quota/rate limit reached: %s", exc)
        else:
            logger.exception("Gemini generate_content failed")
        return ""


def _safe_embed_contents(contents: list[str], *, task_type: str = "RETRIEVAL_DOCUMENT") -> np.ndarray | None:
    if not contents:
        return np.empty((0, index.d), dtype=np.float32)
    try:
        embed_resp = client.models.embed_content(
            model="gemini-embedding-001",
            contents=contents,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=index.d,
            ),
        )
        return np.asarray(
            [np.asarray(e.values, dtype=np.float32) for e in embed_resp.embeddings],
            dtype=np.float32,
        )
    except Exception as exc:
        if _is_quota_or_rate_error(exc):
            logger.warning("Gemini embedding quota/rate limit reached: %s", exc)
        else:
            logger.exception("Gemini embed_content failed")
        return None


def _fallback_summary(text: str, max_len: int = 500) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if not cleaned:
        return "No contract text available for summary."
    sentence_split = re.split(r"(?<=[.!?])\s+", cleaned)
    summary = " ".join(sentence_split[:3]).strip() or cleaned[:max_len].strip()
    return summary[:max_len]


def _heuristic_clause_items(text: str, max_items: int = 8) -> list[dict]:
    lines = [ln.strip() for ln in re.split(r"[\n\r]+", text or "") if ln.strip()]
    long_lines = [ln for ln in lines if len(ln.split()) >= 8]
    chunks = long_lines[:max_items]
    if not chunks:
        paragraph_split = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text or "") if p.strip()]
        chunks = paragraph_split[:max_items]

    patterns = [
        ("Termination", ["terminate", "termination", "breach", "notice"]),
        ("Payment", ["payment", "invoice", "fee", "penalty", "late"]),
        ("Confidentiality", ["confidential", "nda", "disclosure"]),
        ("Liability", ["liability", "damages", "indemn", "warranty"]),
        ("Data Protection", ["data", "privacy", "gdpr", "security"]),
        ("IP Ownership", ["intellectual property", "ip", "ownership", "license"]),
    ]
    high_terms = {"unlimited", "sole discretion", "immediately", "without notice", "indemnify"}
    medium_terms = {"penalty", "late fee", "automatic renewal", "exclusive", "liability"}

    results: list[dict] = []
    for idx, chunk in enumerate(chunks):
        lower = chunk.lower()
        ctype = "General"
        for label, keys in patterns:
            if any(k in lower for k in keys):
                ctype = label
                break
        if any(t in lower for t in high_terms):
            risk = "high"
        elif any(t in lower for t in medium_terms):
            risk = "medium"
        else:
            risk = "low"
        results.append(
            {
                "id": f"clause-{idx + 1}",
                "type": ctype,
                "risk_level": risk,
                "text": chunk[:500],
            }
        )
    return results


def _fallback_analysis_payload(text: str, existing_summary: str = "") -> dict:
    lower = (text or "").lower()
    high_markers = sum(lower.count(k) for k in ["unlimited liability", "indemnify", "without notice", "immediate termination"])
    medium_markers = sum(lower.count(k) for k in ["penalty", "late fee", "automatic renewal", "exclusive", "governing law"])
    risk_score = max(5, min(95, 20 + high_markers * 18 + medium_markers * 7))
    risk_level = "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low"
    summary = existing_summary.strip() or _fallback_summary(text)
    clauses = _heuristic_clause_items(text)
    return _normalize_analysis_payload(
        {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "summary": summary,
            "clauses": clauses,
        }
    )


def _fallback_risk_classification(text: str) -> str:
    analysis = _fallback_analysis_payload(text)
    lines = []
    for clause in analysis.get("clauses", [])[:8]:
        if not isinstance(clause, dict):
            continue
        lines.append(f"- {str(clause.get('type') or 'General')}: {str(clause.get('risk_level') or 'low').title()}")
    return "\n".join(lines) if lines else "- General: Low"


def _fallback_improvements(text: str) -> str:
    base = [
        "- Add clear termination notice periods and cure windows.",
        "- Define liability caps and indemnity boundaries explicitly.",
        "- Clarify payment terms, due dates, and dispute timelines.",
        "- Add explicit confidentiality scope and survival period.",
        "- Include governing law and dispute resolution details.",
    ]
    if not (text or "").strip():
        return "\n".join(base[:3])
    return "\n".join(base)


def classify_risk(text: str) -> str:
    prompt = f"""
    You are a legal AI assistant.
    Analyze the following contract and for each key clause:
    1. Assign a risk level (Low, Medium, High)
    2. Return only the risk levels in bullet points.

    Contract Text:
    {text}
    """
    response_text = _safe_generate_content(prompt, temperature=0.1)
    return response_text or _fallback_risk_classification(text)


def suggest_improvements(text: str) -> str:
    prompt = f"""
    You are a legal AI assistant.
    Analyze the following contract and suggest **improvements** to reduce risks:
    - Rewrite unclear clauses
    - Recommend missing protections
    - Keep recommendations concise in bullet points

    Contract Text:
    {text}
    """
    response_text = _safe_generate_content(prompt, temperature=0.1)
    return response_text or _fallback_improvements(text)


def _extract_json_object(raw: str) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _normalize_analysis_payload(payload: dict) -> dict:
    risk_score_raw = payload.get("risk_score", 0)
    try:
        risk_score = int(float(risk_score_raw))
    except Exception:
        risk_score = 0
    risk_score = max(0, min(100, risk_score))

    risk_level = str(payload.get("risk_level", "low")).strip().lower()
    if risk_level not in {"low", "medium", "high"}:
        risk_level = "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low"

    summary = str(payload.get("summary") or payload.get("layman_summary") or "").strip()

    clauses = []
    raw_clauses = payload.get("clauses")
    if isinstance(raw_clauses, list):
        for idx, item in enumerate(raw_clauses):
            if not isinstance(item, dict):
                continue
            clause_type = str(item.get("type") or "General").strip() or "General"
            clause_risk = str(item.get("risk_level") or "low").strip().lower()
            if clause_risk not in {"low", "medium", "high"}:
                clause_risk = "low"
            clause_text = str(item.get("text") or "").strip()
            if not clause_text:
                continue
            clauses.append(
                {
                    "id": str(item.get("id") or f"clause-{idx + 1}"),
                    "type": clause_type,
                    "risk_level": clause_risk,
                    "text": clause_text,
                }
            )

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "summary": summary,
        "layman_summary": summary,
        "clauses": clauses,
        "answer": summary,
        "chunks": [],
    }


def _analysis_storage_payload(payload: dict) -> dict:
    normalized = _normalize_analysis_payload(payload if isinstance(payload, dict) else {})
    return {
        "risk_score": normalized["risk_score"],
        "risk_level": normalized["risk_level"],
        "summary": normalized["summary"],
        "clauses": normalized["clauses"],
    }


def _resolve_utf8_font_name() -> str:
    """
    Registers a UTF-8 capable TrueType font if found.
    This prevents garbled/alien text caused by raw PDF stream encoding.
    """
    candidates = [
        Path("backend/fonts/DejaVuSans.ttf"),
        Path("fonts/DejaVuSans.ttf"),
        Path("DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]

    for font_path in candidates:
        if font_path.exists():
            font_name = "ContractReportFont"
            try:
                pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
                return font_name
            except Exception:
                continue

    # Fallback still readable for standard ASCII/Latin text.
    return "Helvetica"


def _generate_simple_report_pdf(title: str, lines: list[str]) -> bytes:
    """
    Replaces raw PDF stream generation with ReportLab-based generation.
    Output is readable in standard PDF viewers and properly encoded.
    """
    buffer = BytesIO()
    font_name = _resolve_utf8_font_name()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Contract Analysis Report",
        author="Contract AI",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName=font_name,
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#111827"),
        spaceAfter=3,
    )
    section_style = ParagraphStyle(
        "ReportSection",
        parent=styles["Heading3"],
        fontName=font_name,
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#111827"),
        spaceBefore=8,
        spaceAfter=4,
    )

    story = []
    story.append(Paragraph(title, title_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#d1d5db")))
    story.append(Spacer(1, 6))

    for raw in lines:
        text = (raw or "").strip()
        if not text:
            story.append(Spacer(1, 5))
            continue

        if text.endswith(":") and len(text) <= 40:
            story.append(Paragraph(text, section_style))
        else:
            safe_text = (
                text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br/>")
            )
            story.append(Paragraph(safe_text, body_style))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


Base.metadata.create_all(bind=engine)

UPLOAD_FOLDER = "uploads"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def root():
    return {"message": "Backend is running successfully"}

def generate_contract_summary(text: str) -> str:
    prompt = f"""
    You are a legal assistant AI.
    Summarize the following contract clearly and concisely in bullet points:

    {text}
    """
    response_text = _safe_generate_content(prompt, temperature=0.1)
    return response_text or _fallback_summary(text)
def chunk_text(text, chunk_size=500):
    """
    Splits text into chunks of ~chunk_size words each.
    
    Args:
        text (str): Full contract text
        chunk_size (int): Number of words per chunk

    Returns:
        List[str]: List of text chunks
    """
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
    return chunks

from auth_utils import get_current_user

@app.post("/upload")
@app.post("/contracts")
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db),current_user: User = Depends(get_current_user)):

    # Generate unique ID manually
    contract_id = str(os.urandom(16).hex())

    # Save file to uploads folder
    file_location = f"{UPLOAD_FOLDER}/{contract_id}_{file.filename}"

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Extract text from PDF
    reader = PdfReader(file_location)
    
    extracted_text = "..."  # already from PdfReader
    for page in reader.pages:
        extracted_text += page.extract_text() or ""

    chunks = chunk_text(extracted_text, chunk_size=400)  # smaller size for better retrieval
    print(f"Total chunks created: {len(chunks)}")
    
     # 5️⃣ Generate embeddings using current Gemini SDK
    embeddings_np = _safe_embed_contents(chunks, task_type="RETRIEVAL_DOCUMENT")
    if embeddings_np is not None and len(embeddings_np) > 0:
        vector_to_metadata.extend(
            {"contract_id": contract_id, "chunk_text": chunk}
            for chunk in chunks
        )
        index.add(embeddings_np)
        print("Number of chunks added:", len(chunks))
        print("Number of embeddings:", len(embeddings_np))
        print("FAISS index size now:", index.ntotal)
    else:
        logger.warning("Skipping embeddings for contract_id=%s due to embed failure", contract_id)

    
    # If text is large, trim or chunk (Gemini free tier safe)
    trimmed_text = extracted_text[:6000]  # adjust if needed

    # Generate AI summary using Gemini
    ai_summary = generate_contract_summary(trimmed_text)

    # 6️⃣ Generate Risk Classification & Suggested Improvements (Phase 3.2)
    ai_risk_analysis = classify_risk(trimmed_text)
    ai_suggested_improvements = suggest_improvements(trimmed_text)

    # Save record in database
    new_contract = Contract(
    id=contract_id,
    filename=file.filename,
    file_path=file_location,
    summary=ai_summary,
    text=extracted_text,
    risk_classification=ai_risk_analysis,
    suggested_improvements=ai_suggested_improvements
    )

    db.add(new_contract)
    db.commit()
    
    return {
        "message": "File uploaded successfully",
        "contract_id": contract_id,
        "filename": file.filename,
        "summary": ai_summary,
        "risk_classification": ai_risk_analysis
    }

from pydantic import BaseModel

# Request model for /query
class QueryRequest(BaseModel):
    query: str
    top_k: int = 3  # number of relevant chunks to return


class QueryV2Request(BaseModel):
    contract_id: str
    query: str
    top_k: int = 3
    conversation_id: str | None = None
    stream: bool = False
from auth_utils import get_current_user


def _search_relevant_chunks(user_query: str, top_k: int, contract_id: str | None = None):
    embedding = _safe_embed_contents([user_query], task_type="RETRIEVAL_DOCUMENT")
    if embedding is None or len(embedding) == 0:
        return []
    query_vector = np.array(embedding[0], dtype=np.float32).reshape(1, -1)
    distances, indices = index.search(query_vector, max(top_k * 4, top_k))

    results = []
    for rank, idx in enumerate(indices[0]):
        idx = int(idx)
        if idx < 0 or idx >= len(vector_to_metadata):
            continue

        metadata = vector_to_metadata[idx]
        if contract_id and metadata.get("contract_id") != contract_id:
            continue

        results.append(
            {
                "contract_id": metadata.get("contract_id"),
                "chunk_text": metadata.get("chunk_text"),
                "score": float(distances[0][rank]),
            }
        )
        if len(results) >= top_k:
            break
    return results


def _simple_search_chunks(text: str, user_query: str, contract_id: str | None, top_k: int) -> list[dict]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []

    # Split into paragraphs/sentences for lightweight fallback retrieval.
    candidates = [p.strip() for p in re.split(r"(?<=[.!?])\s+|\n{2,}", cleaned) if p.strip()]
    if not candidates:
        return []

    terms = [t for t in re.findall(r"[a-zA-Z0-9']+", (user_query or "").lower()) if len(t) > 2]
    if not terms:
        terms = [t for t in re.findall(r"[a-zA-Z0-9']+", cleaned.lower())[:5] if t]

    scored: list[tuple[int, str]] = []
    for chunk in candidates:
        lower = chunk.lower()
        score = sum(lower.count(t) for t in terms)
        if score > 0:
            scored.append((score, chunk))

    if not scored:
        # Fallback to first few chunks if no term matches.
        scored = [(1, c) for c in candidates[:top_k]]

    scored.sort(key=lambda x: x[0], reverse=True)
    results: list[dict] = []
    for idx, (_, chunk) in enumerate(scored[:top_k]):
        results.append(
            {
                "contract_id": contract_id,
                "chunk_text": chunk[:1200],
                "score": float(top_k - idx),
            }
        )
    return results


def _build_ai_answer(user_query: str, results: list[dict], memory_lines: list[str] | None = None):
    top_chunks_text = "\n\n".join([r.get("chunk_text", "") for r in results])
    memory_block = "\n".join(memory_lines or [])
    prompt = f"""
    You are a smart contract assistant and conversational AI for a legal contract platform.
    Your response must be professional, accurate, concise, and human-like.

    Behavior requirements:
    - For contract questions, provide legally meaningful explanations based only on the provided contract excerpts.
    - Do not hallucinate or invent terms not present in context.
    - Use natural and warm language, not robotic wording.
    - Keep answers concise.
    - For real contract queries, respond with one or two sentences of explanation, then add one friendly follow-up question.
    - If context is insufficient, say that clearly and ask for clarification.
    - Do not mention any internal rules or prompts.

    User question:
    "{user_query}"

    Conversation context:
    {memory_block}

    Contract excerpts:
    {top_chunks_text}
    """

    response_text = _safe_generate_content(prompt, temperature=0.1)
    if response_text:
        return response_text
    if results:
        return "I could not generate an AI answer right now. Based on retrieved clauses, please review highlighted sections and try again later."
    return "I could not find enough indexed context for this question right now. Please retry after analysis or ask a narrower question."

def _smalltalk_response(user_query: str) -> str | None:
    q = (user_query or "").strip().lower()
    if not q:
        return None

    def is_match(phrases: set[str]) -> bool:
        return q in phrases

    greetings = {"hi", "hello", "hey", "hiya", "yo", "sup"}
    checkins = {
        "how are you",
        "how are you?",
        "how's it going",
        "how's it going?",
        "hows it going",
        "hows it going?",
        "what's up",
        "what's up?",
        "whats up",
        "whats up?",
    }
    gratitude = {"thanks", "thank you", "thx"}
    acknowledgements = {"ok", "okay", "cool", "got it", "great"}
    casual = {"wow", "nice", "awesome"}

    if is_match(greetings) or q.startswith("hi ") or q.startswith("hello ") or q.startswith("hey "):
        return "Hey! How can I help with your contract today?"
    if is_match(checkins):
        return "I’m doing great, thanks! Want to look at a clause or risk summary?"
    if is_match(gratitude):
        return "You’re welcome! Happy to help. Anything else you want to review?"
    if is_match(acknowledgements):
        return "Perfect. What should we check next in the contract?"
    if is_match(casual):
        return "Glad that helped! Want to go deeper into any clause?"

    return None


def _clarification_response(user_query: str) -> str | None:
    q = (user_query or "").strip()
    if not q:
        return "Could you share your question in a bit more detail?"

    low_info_terms = {"this", "that", "it", "explain", "help", "what", "why", "how"}
    if len(q) <= 3:
        return "Could you say a bit more about what you want explained?"
    if q.lower() in low_info_terms:
        return "I am not sure which clause you mean. Can you clarify the section or topic?"
    return None

@app.post("/query")
def query_contracts(request: QueryRequest, current_user: User = Depends(get_current_user)):
    user_query = request.query
    top_k = request.top_k
    smalltalk = _smalltalk_response(user_query)
    if smalltalk is not None:
        return {
            "query": user_query,
            "top_k": top_k,
            "results": [],
            "ai_answer": smalltalk
        }
    clarification = _clarification_response(user_query)
    if clarification is not None:
        return {
            "query": user_query,
            "top_k": top_k,
            "results": [],
            "ai_answer": clarification
        }
    results = _search_relevant_chunks(user_query, top_k)
    ai_response = _build_ai_answer(user_query, results)

    return {
        "query": user_query,
        "top_k": top_k,
        "results": results,
        "ai_answer": ai_response
    }


@app.post("/query/v2")
def query_contracts_v2(
    request: QueryV2Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_query = request.query
    top_k = request.top_k
    contract_id = request.contract_id
    conversation_key = request.conversation_id or f"{current_user.id}:{contract_id}"
    smalltalk = _smalltalk_response(user_query)
    if smalltalk is not None:
        response = {
            "query": user_query,
            "top_k": top_k,
            "contract_id": contract_id,
            "results": [],
            "ai_answer": smalltalk,
            "streaming_enabled": ENABLE_CHAT_STREAMING and request.stream,
        }
        if ENABLE_CHAT_CITATIONS:
            response["citations"] = []
        return response
    clarification = _clarification_response(user_query)
    if clarification is not None:
        response = {
            "query": user_query,
            "top_k": top_k,
            "contract_id": contract_id,
            "results": [],
            "ai_answer": clarification,
            "streaming_enabled": ENABLE_CHAT_STREAMING and request.stream,
        }
        if ENABLE_CHAT_CITATIONS:
            response["citations"] = []
        return response

    results = _search_relevant_chunks(user_query, top_k, contract_id=contract_id)
    if not results:
        contract = db.query(Contract).filter(Contract.id == contract_id).first()
        results = _simple_search_chunks(
            contract.text if contract else "",
            user_query,
            contract_id,
            top_k,
        )

    memory_lines = []
    if ENABLE_CHAT_MEMORY:
        history = CHAT_MEMORY.get(conversation_key, [])[-8:]
        for turn in history:
            memory_lines.append(f"{turn.get('role', 'user')}: {turn.get('content', '')}")

    ai_response = _build_ai_answer(
        user_query,
        results,
        memory_lines if ENABLE_CHAT_MEMORY else None,
    )

    if ENABLE_CHAT_MEMORY:
        CHAT_MEMORY.setdefault(conversation_key, []).extend(
            [{"role": "user", "content": user_query}, {"role": "assistant", "content": ai_response or ""}]
        )
        CHAT_MEMORY[conversation_key] = CHAT_MEMORY[conversation_key][-20:]

    response = {
        "query": user_query,
        "top_k": top_k,
        "contract_id": contract_id,
        "results": results,
        "ai_answer": ai_response,
        "streaming_enabled": ENABLE_CHAT_STREAMING and request.stream,
    }

    if ENABLE_CHAT_CITATIONS:
        response["citations"] = [
            {
                "chunk_index": idx,
                "contract_id": item.get("contract_id"),
                "score": item.get("score"),
                "snippet": str(item.get("chunk_text", ""))[:220],
            }
            for idx, item in enumerate(results)
        ]

    return response


@app.get("/contracts")
def get_contracts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contracts = db.query(Contract).all()
    
    return [
        {
            "id": c.id,
            "filename": c.filename,
            "uploaded_at": c.uploaded_at.isoformat() if c.uploaded_at else None,
            "summary": c.summary,
            "risk_classification": c.risk_classification,
            "suggested_improvements": c.suggested_improvements,
        } for c in contracts
    ]

# GET single contract by ID
@app.get("/contract/{contract_id}")
@app.get("/contracts/{contract_id}")
def get_contract(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(Contract).filter(Contract.id == contract_id).first()
    
    if not c:
        return {"error": "Contract not found"}
    stored_analysis = _analysis_storage_payload(c.analysis or {})
    return {
        "id": c.id,
        "filename": c.filename,
        "uploaded_at": c.uploaded_at.isoformat() if c.uploaded_at else None,
        "summary": c.summary,
        "risk_classification": c.risk_classification,
        "suggested_improvements": c.suggested_improvements,
        "analysis": stored_analysis,
    }


@app.post("/contracts/{contract_id}/analyze")
def analyze_contract(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    contract_text = (contract.text or "").strip()
    if not contract_text:
        fallback_summary = str(contract.summary or "").strip()
        normalized = _normalize_analysis_payload(
            {
                "risk_score": 0,
                "risk_level": "low",
                "summary": fallback_summary,
                "clauses": [],
            }
        )
        contract.analysis = _analysis_storage_payload(normalized)
        db.commit()
        return {
            "risk_score": 0,
            "risk_level": "low",
            "summary": fallback_summary,
            "layman_summary": fallback_summary,
            "clauses": [],
            "answer": fallback_summary,
            "chunks": [],
        }

    prompt = f"""
You are a legal contract risk analyzer.
Return ONLY valid JSON. No markdown, no explanations, no extra text.

Schema:
{{
  "risk_score": <integer 0-100>,
  "risk_level": "low" | "medium" | "high",
  "summary": "<short plain-English summary>",
  "clauses": [
    {{
      "type": "<clause category>",
      "risk_level": "low" | "medium" | "high",
      "text": "<original or paraphrased clause text>"
    }}
  ]
}}

Contract text:
{contract_text[:12000]}
"""

    raw_text = _safe_generate_content(prompt, temperature=0.1)

    payload = _extract_json_object(raw_text)
    if payload:
        normalized = _normalize_analysis_payload(payload)
    else:
        normalized = _fallback_analysis_payload(contract_text, str(contract.summary or ""))

    if not normalized["summary"]:
        normalized["summary"] = str(contract.summary or "").strip()
        normalized["layman_summary"] = normalized["summary"]
        normalized["answer"] = normalized["summary"]

    contract.analysis = _analysis_storage_payload(normalized)
    db.commit()

    return normalized


@app.get("/report/{contract_id}")
def download_contract_report(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    stored = _analysis_storage_payload(contract.analysis or {})
    clauses = stored.get("clauses") if isinstance(stored.get("clauses"), list) else []

    lines = [
        f"Filename: {contract.filename or ''}",
        f"Uploaded: {contract.uploaded_at.isoformat() if contract.uploaded_at else ''}",
        f"Risk Score: {stored.get('risk_score', 0)}",
        f"Risk Level: {stored.get('risk_level', 'low')}",
        "",
        "Summary:",
        str(stored.get("summary") or "No summary available"),
        "",
        "Top Clauses:",
    ]
    for clause in clauses[:8]:
        if not isinstance(clause, dict):
            continue
        c_type = str(clause.get("type") or "General")
        c_risk = str(clause.get("risk_level") or "low")
        c_text = str(clause.get("text") or "").replace("\n", " ").strip()
        lines.append(f"- [{c_risk}] {c_type}: {c_text[:180]}")

    pdf_bytes = _generate_simple_report_pdf("Contract Analysis Report", lines)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="contract-report-{contract_id}.pdf"'},
    )


@app.delete("/contracts/{contract_id}")
def delete_contract(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        return {"error": "Contract not found"}

    db.delete(contract)
    db.commit()
    return {"message": "Contract deleted"}

@app.post("/explain-clause", response_model=ClauseExplainResponse)
async def explain_clause(data: ClauseExplainRequest):

    prompt = f"""
    You are a legal AI assistant.

    Analyze this contract clause:

    Clause Text:
    {data.clause_text}

    Clause Type:
    {data.clause_type}

    Risk Level:
    {data.risk_level}

    Respond strictly in JSON format with:
    {{
        "simple_explanation": "...",
        "example": "...",
        "risk_reason": "...",
        "suggestions": ["...", "..."],
        "complexity_level": "Low/Medium/High"
    }}

    Do not include anything outside JSON.
    """

    raw_text = _safe_generate_content(prompt, temperature=0.1)
    parsed = _extract_json_object(raw_text)

    if not parsed:
        simple = _fallback_summary(data.clause_text, max_len=260)
        level = str(data.risk_level or "medium").strip().lower()
        risk_reason = (
            "This clause may expose one side to high obligations or weak safeguards."
            if level == "high"
            else "This clause has moderate ambiguity or obligations that should be clarified."
            if level == "medium"
            else "This clause appears lower risk but should still be reviewed for clarity."
        )
        return {
            "simple_explanation": simple or "Could not parse structured explanation.",
            "example": f"For example, define exact duties and timelines for {data.clause_type or 'this clause'}.",
            "risk_reason": risk_reason,
            "suggestions": [
                "Define obligations and timelines in explicit language.",
                "Add limits, exceptions, and dispute handling terms.",
                "Review manually with legal counsel for final wording.",
            ],
            "complexity_level": "High" if level == "high" else "Medium"
        }

    suggestions_raw = parsed.get("suggestions")
    suggestions = suggestions_raw if isinstance(suggestions_raw, list) else ["Review manually."]
    suggestions = [str(item).strip() for item in suggestions if str(item).strip()] or ["Review manually."]

    return {
        "simple_explanation": str(parsed.get("simple_explanation") or "").strip() or raw_text.strip() or "No explanation provided.",
        "example": str(parsed.get("example") or "").strip() or "No example provided.",
        "risk_reason": str(parsed.get("risk_reason") or "").strip() or "No risk reason provided.",
        "suggestions": suggestions,
        "complexity_level": str(parsed.get("complexity_level") or "Medium").strip() or "Medium",
    }

