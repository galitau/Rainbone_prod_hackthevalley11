"""Saved Gemini answers (services.llm_providers) go to backend/.ai-answers.json by default. The suite keeps none, so
one test's Gemini answer is never served to another and the developer's file is never touched; a test of them
names its own file with AI_ANSWER_STORE."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import llm_providers  # noqa: E402

llm_providers.ANSWER_STORE_DEFAULT = None
