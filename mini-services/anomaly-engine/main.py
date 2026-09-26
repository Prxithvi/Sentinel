"""
Sentinel Anomaly Detection Engine
──────────────────────────────────
Ensemble anomaly detection service for MPLAD work records: combines two
unsupervised ML models (Isolation Forest + Local Outlier Factor) with a
transparent rule-based layer, and returns per-work explainability
("indicators") alongside the anomaly score. Designed to be stateless and
safe on small or malformed batches.

Note on scope: this service scores a *batch* of works relative to each
other (and to fixed rule thresholds) in a single request. It does not
persist a trained model between calls — each /detect call is self-
contained, which keeps the engine simple to deploy and reason about.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import RobustScaler

# ──────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────

ENGINE_VERSION = "2.0.0"
MIN_WORKS_FOR_ML = 5           # below this, fall back to rule-based scoring only
IF_WEIGHT = 0.55                # weight of Isolation Forest in the ensemble
LOF_WEIGHT = 0.45               # weight of Local Outlier Factor in the ensemble
RULE_BONUS_CAP = 35             # max points rule-based flags can add to the ML score
LOF_NEIGHBOR_CAP = 20           # max neighbors for LOF, bounded by batch size

RISK_THRESHOLDS = (
    ("CRITICAL", 80),
    ("HIGH", 60),
    ("MEDIUM", 40),
    ("LOW", 0),
)

ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("SENTINEL_ALLOWED_ORIGINS", "*").split(",") if o.strip()
]

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("sentinel")

_service_started_at = time.monotonic()

app = FastAPI(
    title="Sentinel Anomaly Detection Engine",
    description="Ensemble ML + rule-based anomaly scoring for MPLAD work records.",
    version=ENGINE_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error while processing %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal error while scoring works. No results were generated."},
    )


# ──────────────────────────────────────────────────────────────────────────
# Request / response models
# ──────────────────────────────────────────────────────────────────────────

class Work(BaseModel):
    work_id: str = Field(..., min_length=1, description="Unique identifier for the work")
    sanctioned_amount: float = Field(..., gt=0, description="Sanctioned fund amount (same unit across the batch)")
    utilized_amount: float = Field(..., ge=0, description="Utilized fund amount")
    completion_days: float = Field(..., ge=0, description="Days elapsed since sanction (or since work start)")
    vendor_works: int = Field(..., ge=0, description="Number of works this vendor has, as supplied by the caller")
    district_works: int = Field(..., ge=0, description="Number of works this district has, as supplied by the caller")

    # Optional enrichment fields — safe to omit; used to sharpen rule-based
    # indicators when the caller has them, without changing the base contract.
    vendor_id: Optional[str] = Field(None, description="Vendor identifier, used to recompute concentration within this batch")
    district_id: Optional[str] = Field(None, description="District identifier, used to recompute concentration within this batch")
    category: Optional[str] = Field(None, description="Work category, e.g. 'road', 'sanitation'")

    @field_validator("utilized_amount")
    @classmethod
    def _warn_not_validate_over_utilization(cls, v: float) -> float:
        # Over-utilization is not rejected — it's a legitimate signal the
        # rule engine should flag, not a malformed request.
        return v


class DetectionRequest(BaseModel):
    works: list[Work] = Field(..., min_length=1, description="Batch of works to score together")
    contamination: Optional[float] = Field(
        None, gt=0.0, lt=0.5,
        description="Optional override for expected anomaly proportion (0–0.5). Defaults to 'auto'.",
    )


class WorkResult(BaseModel):
    work_id: str
    is_anomaly: bool
    anomaly_score: int
    risk: str
    indicators: list[str]
    components: dict  # transparency: raw contribution of each sub-model/rule layer


class DetectionSummary(BaseModel):
    total: int
    critical: int
    high: int
    medium: int
    low: int
    average_score: float


class DetectionResponse(BaseModel):
    status: str
    method: str
    request_id: str
    generated_at: str
    engine_version: str
    summary: DetectionSummary
    results: list[WorkResult]


# ──────────────────────────────────────────────────────────────────────────
# Feature engineering
# ──────────────────────────────────────────────────────────────────────────

def _safe_ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator > 0 else 0.0


def _median(values: list[float]) -> float:
    return float(np.median(values)) if values else 0.0


def build_feature_matrix(works: list[Work]) -> np.ndarray:
    """Builds a per-work feature vector. Monetary values are log-transformed
    to reduce skew; ratios and counts capture behavioural signals that raw
    amounts alone miss."""
    vendor_median = _median([w.vendor_works for w in works])
    district_median = _median([w.district_works for w in works])

    rows = []
    for w in works:
        utilization_ratio = _safe_ratio(w.utilized_amount, w.sanctioned_amount)
        burn_rate = _safe_ratio(w.utilized_amount, max(w.completion_days, 1))
        vendor_concentration = _safe_ratio(w.vendor_works, vendor_median) if vendor_median > 0 else 1.0
        district_concentration = _safe_ratio(w.district_works, district_median) if district_median > 0 else 1.0

        rows.append([
            np.log1p(w.sanctioned_amount),
            np.log1p(w.utilized_amount),
            utilization_ratio,
            w.completion_days,
            np.log1p(burn_rate),
            w.vendor_works,
            w.district_works,
            vendor_concentration,
            district_concentration,
        ])
    return np.array(rows, dtype=float)


# ──────────────────────────────────────────────────────────────────────────
# Rule-based explainability layer
# ──────────────────────────────────────────────────────────────────────────

def _is_suspiciously_round(amount: float) -> bool:
    """Flags amounts that are exact multiples of a large round unit
    (e.g. exactly 500000, 1000000) — a common pattern in fabricated records."""
    if amount <= 0:
        return False
    for unit in (100000, 500000, 1000000):
        if amount % unit == 0:
            return True
    return False


def evaluate_rules(work: Work, vendor_median: float, district_median: float) -> tuple[int, list[str]]:
    """Returns (bonus_points, indicators). Bonus points are additive and
    capped by the caller — these are transparent, auditable heuristics,
    not black-box scores."""
    bonus = 0
    indicators: list[str] = []
    utilization_ratio = _safe_ratio(work.utilized_amount, work.sanctioned_amount)

    if work.utilized_amount > work.sanctioned_amount * 1.02:
        bonus += 15
        indicators.append("Utilized amount exceeds the sanctioned amount")

    if work.completion_days <= 3 and utilization_ratio >= 0.95:
        bonus += 15
        indicators.append("Reported over 95% utilized within 3 days of sanction")

    if work.completion_days == 0 and work.utilized_amount > 0:
        bonus += 10
        indicators.append("Funds marked utilized with zero elapsed days since sanction")

    if _is_suspiciously_round(work.sanctioned_amount) and _is_suspiciously_round(work.utilized_amount) and work.sanctioned_amount > 0:
        bonus += 8
        indicators.append("Both sanctioned and utilized amounts are suspiciously round figures")

    if vendor_median > 0 and work.vendor_works >= max(5, vendor_median * 3):
        bonus += 10
        indicators.append(f"Vendor is associated with {work.vendor_works} works — unusually concentrated versus the batch median")

    if district_median > 0 and work.district_works >= max(5, district_median * 3):
        bonus += 6
        indicators.append(f"District has {work.district_works} works in this batch — high concentration")

    if utilization_ratio < 0.05 and work.completion_days > 365:
        bonus += 12
        indicators.append("Sanctioned over a year ago with negligible fund utilization (possible stalled/dormant work)")

    return bonus, indicators


def risk_tier_for(score: int) -> str:
    for tier, threshold in RISK_THRESHOLDS:
        if score >= threshold:
            return tier
    return "LOW"


# ──────────────────────────────────────────────────────────────────────────
# ML ensemble scoring
# ──────────────────────────────────────────────────────────────────────────

def _minmax_normalize_invert(raw_scores: np.ndarray) -> np.ndarray:
    """Maps raw decision-function-style scores (where LOWER = more anomalous)
    onto a 0–100 scale where HIGHER = more anomalous, using batch-relative
    min-max scaling so the full 0–100 range is actually used."""
    lo, hi = float(raw_scores.min()), float(raw_scores.max())
    if hi - lo < 1e-9:
        return np.full_like(raw_scores, 50.0)
    return (hi - raw_scores) / (hi - lo) * 100.0


def run_ensemble(X: np.ndarray, contamination) -> tuple[np.ndarray, np.ndarray]:
    """Fits Isolation Forest + Local Outlier Factor on the (scaled) batch and
    returns two 0–100 normalized anomaly-score arrays, one per model."""
    scaler = RobustScaler()
    X_scaled = scaler.fit_transform(X)

    contamination_arg = contamination if contamination is not None else "auto"

    iso_forest = IsolationForest(n_estimators=200, contamination=contamination_arg, random_state=42)
    iso_forest.fit(X_scaled)
    if_raw = iso_forest.decision_function(X_scaled)
    if_scores = _minmax_normalize_invert(if_raw)

    n_neighbors = max(1, min(LOF_NEIGHBOR_CAP, len(X_scaled) - 1))
    lof = LocalOutlierFactor(n_neighbors=n_neighbors, contamination=contamination_arg)
    lof.fit_predict(X_scaled)
    lof_raw = lof.negative_outlier_factor_  # lower (more negative) = more anomalous
    lof_scores = _minmax_normalize_invert(lof_raw)

    return if_scores, lof_scores


# ──────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "engine": "sentinel-anomaly-engine",
        "version": ENGINE_VERSION,
        "uptime_seconds": round(time.monotonic() - _service_started_at, 1),
        "min_works_for_ml": MIN_WORKS_FOR_ML,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/detect", response_model=DetectionResponse)
def detect(request: DetectionRequest):
    request_id = str(uuid.uuid4())
    works = request.works
    n = len(works)

    vendor_median = _median([w.vendor_works for w in works])
    district_median = _median([w.district_works for w in works])

    if n < MIN_WORKS_FOR_ML:
        logger.info("[%s] Batch of %d works below ML threshold (%d) — using rule-based scoring only",
                    request_id, n, MIN_WORKS_FOR_ML)
        results = []
        for w in works:
            bonus, indicators = evaluate_rules(w, vendor_median, district_median)
            score = max(0, min(100, bonus))
            results.append(WorkResult(
                work_id=w.work_id,
                is_anomaly=score >= 60,
                anomaly_score=score,
                risk=risk_tier_for(score),
                indicators=indicators or ["No rule-based indicators triggered"],
                components={"ml_score": None, "rule_bonus": bonus, "method": "rule_based"},
            ))
        return _build_response(results, request_id, method="rule_based_fallback")

    try:
        X = build_feature_matrix(works)
        if_scores, lof_scores = run_ensemble(X, request.contamination)
    except Exception as exc:  # noqa: BLE001 — deliberately broad: never let a model error 500 the whole batch
        logger.exception("[%s] Ensemble model failed, falling back to rule-based scoring", request_id)
        results = []
        for w in works:
            bonus, indicators = evaluate_rules(w, vendor_median, district_median)
            score = max(0, min(100, bonus))
            results.append(WorkResult(
                work_id=w.work_id,
                is_anomaly=score >= 60,
                anomaly_score=score,
                risk=risk_tier_for(score),
                indicators=indicators or ["No rule-based indicators triggered"],
                components={"ml_score": None, "rule_bonus": bonus, "method": "rule_based_after_ml_error"},
            ))
        return _build_response(results, request_id, method="rule_based_fallback_after_error")

    results = []
    for i, w in enumerate(works):
        ml_score = IF_WEIGHT * if_scores[i] + LOF_WEIGHT * lof_scores[i]
        bonus, indicators = evaluate_rules(w, vendor_median, district_median)
        bonus = min(bonus, RULE_BONUS_CAP)
        final_score = int(round(max(0, min(100, ml_score + bonus))))

        results.append(WorkResult(
            work_id=w.work_id,
            is_anomaly=final_score >= 60,
            anomaly_score=final_score,
            risk=risk_tier_for(final_score),
            indicators=indicators,
            components={
                "isolation_forest_score": round(float(if_scores[i]), 1),
                "local_outlier_factor_score": round(float(lof_scores[i]), 1),
                "rule_bonus": bonus,
                "method": "ensemble_ml",
            },
        ))

    return _build_response(results, request_id, method="ensemble_ml")


def _build_response(results: list[WorkResult], request_id: str, method: str) -> DetectionResponse:
    scores = [r.anomaly_score for r in results]
    summary = DetectionSummary(
        total=len(results),
        critical=sum(1 for r in results if r.risk == "CRITICAL"),
        high=sum(1 for r in results if r.risk == "HIGH"),
        medium=sum(1 for r in results if r.risk == "MEDIUM"),
        low=sum(1 for r in results if r.risk == "LOW"),
        average_score=round(sum(scores) / len(scores), 1) if scores else 0.0,
    )
    return DetectionResponse(
        status="success",
        method=method,
        request_id=request_id,
        generated_at=datetime.now(timezone.utc).isoformat(),
        engine_version=ENGINE_VERSION,
        summary=summary,
        results=results,
    )