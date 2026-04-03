from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class Subject(str, Enum):
    MATH = "math"
    PHYSICS = "physics"
    CHEMISTRY = "chemistry"
    BIOLOGY = "biology"
    CHINESE = "chinese"
    ENGLISH = "english"
    UNKNOWN = "unknown"


class CitationType(str, Enum):
    IN_PROBLEM = "in_problem"
    BACKGROUND = "background"


class Citation(BaseModel):
    type: CitationType
    text: str
    source: Optional[str] = None


class StepContent(BaseModel):
    explanation: str
    key_point: Optional[str] = None
    details: Optional[str] = None
    formula: Optional[str] = None
    conclusion: Optional[str] = None
    diagram_svg: Optional[str] = None
    diagram_tikz: Optional[str] = None
    diagram_mermaid: Optional[str] = None
    diagram_caption: Optional[str] = None
    citations: List[Citation] = Field(default_factory=list)


class StepType(str, Enum):
    PROBLEM_TYPE = "problem_type"
    UNDERSTANDING = "understanding"
    KNOWN_CONDITIONS = "known_conditions"
    TARGET = "target"
    APPROACH = "approach"
    DERIVATION = "derivation"
    STAGE_CONCLUSION = "stage_conclusion"
    FINAL_ANSWER = "final_answer"
    VERIFICATION = "verification"
    SUMMARY = "summary"
    ALTERNATIVE = "alternative"
    EXPLANATION = "explanation"


class Step(BaseModel):
    step_index: int
    step_type: StepType
    title: str
    content: StepContent
    is_final: bool = False
    method_index: int = 0  # 0 = main, 1+ = alternative methods
    method_name: Optional[str] = None


class PrefetchedStep(BaseModel):
    step: Step
    raw_response: str


class SolveRequest(BaseModel):
    problem_text: str
    images: List[str] = Field(default_factory=list)  # base64 encoded images


class NextStepRequest(BaseModel):
    session_id: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    referenced_step_index: Optional[int] = None


class SessionState(BaseModel):
    session_id: str
    problem_text: str
    images: List[str] = Field(default_factory=list)
    subject: Subject = Subject.UNKNOWN
    problem_type: str = ""
    messages: List[dict] = Field(default_factory=list)  # Claude conversation history
    steps: List[Step] = Field(default_factory=list)
    current_step_index: int = 0
    is_complete: bool = False
    alternative_methods: List[str] = Field(default_factory=list)
    current_method: int = 0
    prefetched_steps: List[PrefetchedStep] = Field(default_factory=list)
    prefetch_generation: int = 0


class ChatResponse(BaseModel):
    reply: str
    new_steps: List[Step] = Field(default_factory=list)
