from .skill_loader import build_system_prompt, get_loader, SkillLoader
from .prompts import DETECT_SUBJECT_PROMPT, NEXT_STEP_PROMPT, CHAT_RESPONSE_PROMPT

__all__ = [
    # New skills system
    "build_system_prompt",
    "get_loader",
    "SkillLoader",
    # Prompt constants (unchanged)
    "DETECT_SUBJECT_PROMPT",
    "NEXT_STEP_PROMPT",
    "CHAT_RESPONSE_PROMPT",
]
