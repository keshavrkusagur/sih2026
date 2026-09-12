import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import init_db, get_connection, row_to_dict
from ml_model import classify_report

app = FastAPI(title="OIL SIF/NLP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()

#Request
class ReportIn(BaseModel):
    worker_id: Optional[str] = None
    site: Optional[str] = None
    activity: Optional[str] = None
    location: Optional[str] = None
    report_type: Optional[str] = None
    description: str
    weather: Optional[str] = None
    equipment: Optional[str] = None
    ppe_compliant: Optional[bool] = None
    submitted_at: Optional[str] = None
    sif_potential: Optional[bool] = None
    confidence: Optional[float] = None
    rule_tag: Optional[str] = None
    precursor_keywords: Optional[list] = None
    status: Optional[str] = "pending"


class StatusUpdate(BaseModel):
    status: str
    
# Routes
@app.get("/")
def health_check():
    return {"status": "ok", "service": "OIL SIF/NLP API"}


@app.post("/api/reports")
def create_report(report: ReportIn):
    classification = classify_report(report.description)

    submitted_at = report.submitted_at or datetime.now(timezone.utc).isoformat()

    conn = get_connection()
    cur = conn.execute(
        """
        INSERT INTO reports (
            worker_id, site, activity, location, report_type, description,
            weather, equipment, ppe_compliant, submitted_at,
            sif_potential, confidence, rule_tag, precursor_keywords, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            report.worker_id, report.site, report.activity, report.location,
            report.report_type, report.description, report.weather, report.equipment,
            int(report.ppe_compliant) if report.ppe_compliant is not None else None,
            submitted_at,
            int(classification["sif_potential"]),
            classification["confidence"],
            classification["rule_tag"],
            json.dumps(classification["precursor_keywords"]),
            "processed",
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (new_id,)).fetchone()
    conn.close()

    return row_to_dict(row)


@app.get("/api/reports")
def list_reports():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM reports ORDER BY submitted_at DESC").fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@app.get("/api/reports/{report_id}")
def get_report(report_id: int):
    conn = get_connection()
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return row_to_dict(row)


@app.patch("/api/reports/{report_id}")
def update_report_status(report_id: int, update: StatusUpdate):
    conn = get_connection()
    existing = conn.execute("SELECT id FROM reports WHERE id = ?", (report_id,)).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found")

    conn.execute("UPDATE reports SET status = ? WHERE id = ?", (update.status, report_id))
    conn.commit()
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    conn.close()
    return row_to_dict(row)
