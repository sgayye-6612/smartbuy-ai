"""Module 6: AI shopping assistant."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..config import ANTHROPIC_API_KEY
from ..database import get_db
from ..models import SearchHistory, User
from ..schemas import AssistantIn
from ..security import get_optional_user
from ..services.assistant import answer

router = APIRouter(prefix="/api/assistant", tags=["AI Assistant"])


@router.post("")
def ask(body: AssistantIn, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    if user:
        db.add(SearchHistory(user_id=user.id, query=body.message))
        db.commit()
    return answer(db, user, body.message)


@router.get("/status")
def status():
    return {"llm_enabled": bool(ANTHROPIC_API_KEY),
            "mode": "LLM + comparison engine" if ANTHROPIC_API_KEY else "Rule-based parser + comparison engine"}
