"""
Hierarchical Skills Loader

Inspired by Claude Code's SKILL.md plugin system.

Directory layout:
  skills/
    SKILL.md              ← master registry (describes all sub-skills)
    core/
      SKILL.md            ← base system prompt (shared by all subjects)
    subjects/
      math/
        SKILL.md          ← subject-level skill
        algebra/SKILL.md  ← sub-skill matched by problem_type
        geometry/SKILL.md
        function/SKILL.md
        probability/SKILL.md
      physics/
        SKILL.md
        mechanics/SKILL.md
        electro/SKILL.md
      chemistry/SKILL.md
      biology/SKILL.md
      chinese/SKILL.md
      english/SKILL.md

Each SKILL.md has YAML frontmatter between --- delimiters followed by
the Markdown prompt body.

Composition order (all parts joined with blank lines):
  1. core/SKILL.md body        — universal format & LaTeX rules
  2. subjects/{subject}/SKILL.md body — subject teaching standards
  3. subjects/{subject}/{sub}/SKILL.md body — problem-type specifics (optional)
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import yaml as _yaml
    def _load_yaml(text: str) -> dict:
        return _yaml.safe_load(text) or {}
except ImportError:
    # Fallback: minimal key: value parser (no nested structures)
    def _load_yaml(text: str) -> dict:  # type: ignore[misc]
        result: dict = {}
        current_list_key: Optional[str] = None
        for line in text.splitlines():
            if re.match(r'^\s*-\s+', line) and current_list_key:
                result.setdefault(current_list_key, []).append(line.strip().lstrip('- ').strip())
                continue
            m = re.match(r'^(\w[\w_-]*):\s*(.*)', line)
            if m:
                current_list_key = None
                key, val = m.group(1), m.group(2).strip()
                if val == '':
                    current_list_key = key
                else:
                    # strip surrounding quotes
                    val = val.strip('"\'')
                    result[key] = val
        return result


logger = logging.getLogger("skill_loader")

SKILLS_DIR = Path(__file__).parent


# ── Data structures ────────────────────────────────────────────────────────

@dataclass
class SkillMeta:
    name: str
    description: str = ""
    version: str = "1.0"
    type: str = "skill"            # core | subject | sub-skill | registry
    subject: str = ""              # which subject this skill belongs to
    parent: str = ""               # parent subject for sub-skills
    problem_types: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    step_flow: list[str] = field(default_factory=list)
    diagram_policy: str = "optional"   # prefer | required | optional | forbidden
    sub_skills: list[str] = field(default_factory=list)


@dataclass
class SkillFile:
    meta: SkillMeta
    body: str
    path: Path


# ── Parser ─────────────────────────────────────────────────────────────────

def _parse_skill_file(path: Path) -> Optional[SkillFile]:
    """Parse a SKILL.md file and return a SkillFile, or None on failure."""
    if not path.exists():
        return None

    text = path.read_text(encoding="utf-8")

    # Extract YAML frontmatter between the first pair of --- delimiters
    fm_match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', text, re.DOTALL)
    if not fm_match:
        logger.debug("No frontmatter in %s — treating entire file as body", path)
        return SkillFile(
            meta=SkillMeta(name=path.parent.name),
            body=text.strip(),
            path=path,
        )

    try:
        raw: dict = _load_yaml(fm_match.group(1))
    except Exception as exc:
        logger.error("YAML parse error in %s: %s", path, exc)
        return None

    def _list(key: str) -> list[str]:
        val = raw.get(key, [])
        if isinstance(val, list):
            return [str(v) for v in val]
        if isinstance(val, str) and val:
            return [val]
        return []

    meta = SkillMeta(
        name=str(raw.get("name", path.parent.name)),
        description=str(raw.get("description", "")),
        version=str(raw.get("version", "1.0")),
        type=str(raw.get("type", "skill")),
        subject=str(raw.get("subject", "")),
        parent=str(raw.get("parent", "")),
        problem_types=_list("problem_types"),
        keywords=_list("keywords"),
        step_flow=_list("step_flow"),
        diagram_policy=str(raw.get("diagram_policy", "optional")),
        sub_skills=_list("sub_skills"),
    )

    return SkillFile(meta=meta, body=fm_match.group(2).strip(), path=path)


# ── Loader ─────────────────────────────────────────────────────────────────

class SkillLoader:
    """
    Loads and composes hierarchical SKILL.md skills into a system prompt.

    All loaded files are cached in-process; restart the server to pick up
    edits (or call loader.reload()).
    """

    def __init__(self, skills_dir: Path = SKILLS_DIR):
        self.skills_dir = skills_dir
        self._cache: dict[str, Optional[SkillFile]] = {}

    # ── Private helpers ───────────────────────────────────────────────────

    def _load(self, rel_path: str) -> Optional[SkillFile]:
        if rel_path not in self._cache:
            full = self.skills_dir / rel_path
            skill = _parse_skill_file(full)
            if skill:
                logger.debug("Loaded skill  path=%s  name=%s", full, skill.meta.name)
            self._cache[rel_path] = skill
        return self._cache[rel_path]

    def _core(self) -> str:
        skill = self._load("core/SKILL.md")
        return skill.body if skill else ""

    def _subject(self, subject: str) -> Optional[SkillFile]:
        return self._load(f"subjects/{subject}/SKILL.md")

    def _sub_skill(self, subject: str, sub: str) -> Optional[SkillFile]:
        return self._load(f"subjects/{subject}/{sub}/SKILL.md")

    def _best_sub_skill(self, subject: str, problem_type: str) -> Optional[SkillFile]:
        """
        Match a sub-skill by scoring how well its problem_types / keywords
        overlap with the detected problem_type string.
        """
        subject_skill = self._subject(subject)
        if not subject_skill or not subject_skill.meta.sub_skills:
            return None

        pt_lower = problem_type.lower()
        best: Optional[SkillFile] = None
        best_score = 0

        for sub_name in subject_skill.meta.sub_skills:
            skill = self._sub_skill(subject, sub_name)
            if not skill:
                continue

            score = 0
            for pt in skill.meta.problem_types:
                if pt.lower() in pt_lower or pt_lower in pt.lower():
                    score += 2
            for kw in skill.meta.keywords:
                if kw.lower() in pt_lower:
                    score += 1

            if score > best_score:
                best_score = score
                best = skill

        if best and best_score > 0:
            logger.info(
                "Sub-skill matched  subject=%s  sub=%s  problem_type='%s'  score=%d",
                subject, best.meta.name, problem_type, best_score,
            )
            return best
        return None

    # ── Public API ────────────────────────────────────────────────────────

    def build_prompt(self, subject: str, problem_type: str = "") -> str:
        """
        Compose the full system prompt for a given subject and problem type.

        Composition:
          core body  +  subject body  +  sub-skill body (if matched)

        Falls back gracefully: if a SKILL.md file is missing, that layer
        is simply omitted. If *all* files are missing, returns "".
        """
        parts: list[str] = []

        core = self._core()
        if core:
            parts.append(core)

        subject_skill = self._subject(subject)
        if subject_skill:
            parts.append(subject_skill.body)
        else:
            logger.warning("No subject skill found for '%s'", subject)

        if problem_type and subject_skill:
            sub = self._best_sub_skill(subject, problem_type)
            if sub:
                parts.append(sub.body)

        if not parts:
            logger.warning("Empty skill composition for subject='%s'", subject)

        return "\n\n".join(parts)

    def reload(self) -> None:
        """Clear the cache so skill files are re-read on next request."""
        self._cache.clear()
        logger.info("SkillLoader cache cleared")

    def list_skills(self) -> dict:
        """Return a summary dict (useful for /health or debugging)."""
        result: dict = {}
        subjects_dir = self.skills_dir / "subjects"
        if not subjects_dir.exists():
            return result
        for subject_dir in sorted(subjects_dir.iterdir()):
            if not subject_dir.is_dir():
                continue
            skill = self._subject(subject_dir.name)
            result[subject_dir.name] = {
                "loaded": skill is not None,
                "name": skill.meta.name if skill else subject_dir.name,
                "version": skill.meta.version if skill else "?",
                "sub_skills": skill.meta.sub_skills if skill else [],
            }
        return result


# ── Module-level singleton ────────────────────────────────────────────────

_loader: Optional[SkillLoader] = None


def get_loader() -> SkillLoader:
    global _loader
    if _loader is None:
        _loader = SkillLoader()
        logger.info("SkillLoader initialised  dir=%s", SKILLS_DIR)
    return _loader


def build_system_prompt(subject: str, problem_type: str = "") -> str:
    """
    Compatibility shim — same signature as the old prompts.py function,
    but now composes from SKILL.md files.
    """
    return get_loader().build_prompt(subject, problem_type)
