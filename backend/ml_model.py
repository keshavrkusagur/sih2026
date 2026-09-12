import random

PRECURSOR_KEYWORDS = {
    "Energy Isolation": ["energy isolation", "lockout", "tagout", "isolation", "live circuit", "de-energ"],
    "Confined Space": ["confined space", "gas testing", "atmospheric", "ventilation", "manhole"],
    "Hot Work": ["hot work", "welding", "grinding", "spark", "flammable"],
    "Line of Fire": ["line of fire", "suspended load", "crane", "dropped object", "pinch point"],
    "Working at Height": ["scaffold", "height", "fall protection", "harness", "ladder"],
}


def classify_report(text: str) -> dict:
    lower = (text or "").lower()
    hits: list[str] = []
    best_rule = None

    for rule, keywords in PRECURSOR_KEYWORDS.items():
        matched = [k for k in keywords if k in lower]
        if matched:
            hits.extend(matched)
            best_rule = rule

    sif_potential = len(hits) > 0
    if sif_potential:
        confidence = min(0.99, 0.62 + len(hits) * 0.11 + random.random() * 0.08)
    else:
        confidence = random.random() * 0.25

    return {
        "sif_potential": sif_potential,
        "confidence": round(confidence, 2),
        "rule_tag": best_rule if sif_potential else None,
        "precursor_keywords": hits,
    }
