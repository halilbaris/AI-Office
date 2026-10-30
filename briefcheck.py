"""Scenario briefs: the Alert Writer's output, checked against what the platforms' alert generator accepts.

The platforms (the platform, the platform) build their alerts themselves from a "scenario context" plus a few options
(sector, difficulty, campaign pack, counts), using their own asset inventory, OS rules and playbook generator.
So the agent does not write alerts or SQL: it writes briefs, and this module checks that every brief is something
the generator can use. Plain code, no model, no network.
"""
import json
import re

SECTORS = ("auto", "HEALTHCARE", "FINANCE", "GOVERNMENT", "OT_ICS", "RETAIL", "ENERGY", "TECH")
DIFFICULTIES = ("Novice", "Beginner", "Intermediate", "Advanced", "Expert")
PACKS = ("general", "ransomware", "apt", "phishing", "cloud", "ai_security")
SEVERITIES = ("Low", "Medium", "High", "Critical")
MITRE_RE = re.compile(r"^T\d{4}(\.\d{3})?$")
IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
MIN_CONTEXT, MAX_CONTEXT, MAX_BRIEFS = 80, 1200, 12


def extract_json(text):
    """The JSON object holding "briefs": a fenced block, or the first {...} that parses and has the key."""
    candidates = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidates += [m.group(0) for m in re.finditer(r"\{.*\}", text, re.S)]
    for c in candidates:
        try:
            data = json.loads(c)
        except ValueError:
            continue
        if isinstance(data, dict) and isinstance(data.get("briefs"), list):
            return data
    return None


def _int_map(value, keys, name, problems, total):
    if value is None:
        return
    if not isinstance(value, dict) or any(k not in keys for k in value) or \
            not all(isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in value.values()):
        problems.append(f"{name} must use only {', '.join(keys)} with whole numbers")
    elif sum(value.values()) != total:
        problems.append(f"{name} adds up to {sum(value.values())}, but count is {total}")


def check_brief(brief, index):
    """-> (clean brief or None, problems). A brief with any problem is not offered for use."""
    problems = []
    if not isinstance(brief, dict):
        return None, ["not an object"]
    ctx = brief.get("scenario_context")
    if not isinstance(ctx, str) or not MIN_CONTEXT <= len(ctx.strip()) <= MAX_CONTEXT:
        problems.append(f"scenario_context must be text of {MIN_CONTEXT}-{MAX_CONTEXT} characters")
    elif IPV4_RE.search(ctx):
        problems.append("scenario_context names an IP address; the platform picks hosts, IPs and users from its own inventory")
    sector = brief.get("sector_code", "auto")
    if sector not in SECTORS:
        problems.append(f"sector_code must be one of {', '.join(SECTORS)}")
    if brief.get("difficulty") not in DIFFICULTIES:
        problems.append(f"difficulty must be one of {', '.join(DIFFICULTIES)}")
    pack = brief.get("campaign_pack", "general")
    if pack not in PACKS:
        problems.append(f"campaign_pack must be one of {', '.join(PACKS)}")
    count = brief.get("count")
    if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 10:
        problems.append("count must be a whole number from 1 to 10")
        count = None
    if count:
        _int_map(brief.get("verdict_mix"), ("true_positive", "false_positive", "benign"), "verdict_mix", problems, count)
        _int_map(brief.get("severity_counts"), SEVERITIES, "severity_counts", problems, count)
    mitre = brief.get("mitre") or []
    if not isinstance(mitre, list) or not all(isinstance(m, str) and MITRE_RE.match(m) for m in mitre):
        problems.append("mitre must be a list of technique ids like T1566 or T1059.001")
    refs = brief.get("incident_refs")
    if not isinstance(refs, list) or not refs or not all(
            isinstance(r, dict) and str(r.get("url", "")).startswith("https://") and r.get("date") for r in refs):
        problems.append("incident_refs needs at least one entry with an https url and a date: no source, no brief")
    if not isinstance(brief.get("title"), str) or not brief["title"].strip():
        problems.append("title is required")
    return (None if problems else {**brief, "id": str(brief.get("id") or f"b{index + 1}")}), problems


def check_text(text):
    """Whole agent output -> {briefs: [clean], problems: [{index, title, problems}], found: bool}."""
    data = extract_json(text or "")
    if data is None:
        return {"found": False, "briefs": [], "problems": []}
    briefs, issues, seen = [], [], set()
    for i, raw in enumerate(data["briefs"][:MAX_BRIEFS]):
        clean, problems = check_brief(raw, i)
        if clean and clean["id"] in seen:
            clean, problems = None, ["duplicate id"]
        if clean:
            seen.add(clean["id"])
            briefs.append(clean)
        else:
            issues.append({"index": i + 1, "title": str((raw or {}).get("title", "") if isinstance(raw, dict) else "")[:80], "problems": problems})
    if len(data["briefs"]) > MAX_BRIEFS:
        issues.append({"index": MAX_BRIEFS + 1, "title": "", "problems": [f"only the first {MAX_BRIEFS} briefs are checked"]})
    return {"found": True, "briefs": briefs, "problems": issues}
