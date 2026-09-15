# Build Progress Log

## Milestone 1 — Repo scaffold ✅
- Initialized Next.js 16 project with Turbopack
- Prisma + SQLite configured
- All shadcn/ui components pre-installed
- Tailwind CSS 4 + next-intl + Recharts + Framer Motion available

## Milestone 2 — Multi-year synthetic data generator ✅
- Deterministic PRNG (Mulberry32, seed 42)
- 12 states × 5 districts each = 60 districts
- 36 MP constituencies (3 per state)
- 250 works across 4 years (2022–2025)
- 9 fraud patterns injected: fund_diversion, ghost_work, duplicate_billing, vendor_collusion, blacklist_match, duplicate_pan_gst, inflated_invoice, stalled_high_utilization, cross_constituency_leak
- 69 vendors including: 5-vendor PAN-sharing ring (VR001-005), 3-vendor exact-duplicate-PAN set (VD001-003), 1 vendor matching blacklist (VBL001)
- 5 blacklist entries (1 with vendor link, 4 standalone)
- 4 demo users (admin/analyst/auditor/citizen) with sha256-hashed passwords
- 3 ModelRun records with full metrics JSON (precision/recall/F1/ROC-AUC + perPattern + rocCurve + prCurve)
- 13 quarters of forecast points per state

## Milestone 3 — DB schema + migrations ✅
- Full v2 entity set: User, Session, State, District, MpConstituency, Work, Vendor, Payment, RiskScore, ScoringConfig, ModelRun, Case, AuditLogEntry, NotificationLog, CitizenReport, FieldVerification, BlacklistEntry, GraphEdge, GraphCluster, IngestionBatch, ForecastPoint
- All relations correctly wired (User↔Session, State↔District↔Work, Vendor↔Work, Case↔AuditLog, etc.)
- PAN field on Vendor intentionally NOT unique-constrained (duplicate PAN is itself a fraud signal)

## Milestone 4 — Data quality / validation layer ✅
- POST /api/ingest/{entity} with schema validators for works/vendors/payments
- Range checks (fundSanctioned ≥ 0, fundUtilized ≤ 2x sanctioned)
- Duplicate detection within batch (seenKeys set)
- Quality report returned as JSON, persisted to IngestionBatch

## Milestone 5 — Rule pre-filter + blacklist cross-check ✅
- 8 rule flags: fund_diversion, ghost_work, duplicate_billing, inflated_invoice, stalled_high_utilization, duplicate_pan, duplicate_gst
- Cross-vendor duplicate PAN/GST detection (queries Vendor table)
- Blacklist cross-check by PAN, GST, or bank_account
- Auto-escalation to Critical tier on blacklist match

## Milestone 6 — Isolation Forest + Autoencoder + Ensemble + SHAP ✅
- IsolationForest: density-based anomaly scoring using normalized feature z-scores
- Autoencoder: PCA-style projection to 2D + reconstruction error
- NLP: red-flag keyword matching + description-length heuristics
- Ensemble: weighted average with configurable weights from ScoringConfig table
- SHAP: per-feature contributions computed as |z| × model_weight, surfaced as waterfall chart

## Milestone 7 — Graph engine: Union-Find + ring detection ✅
- Union-Find for connected components (Louvain-style approximation)
- DFS-based cycle detection for ring identification
- 2 collusion rings detected in seed data (VR001-005 ring + VD001-003 ring)
- Graph clusters persisted to GraphCluster table

## Milestone 8 — Forecasting (per-state) ✅
- Linear-trend + seasonal-boost projection
- History (11 quarters) + forecast (next quarter) per state
- Trend direction + risk-level classification
- Aggregate forecast chart on system health page

## Milestone 9 — Core API routes + JWT auth + RBAC + PII masking ✅
- ~20 API route handlers covering all v1+v2 endpoints
- Session-token auth via /api/auth/login + /api/auth/logout
- Role-based access (admin/analyst/auditor/citizen) enforced on protected endpoints
- PII masking applied to all vendor responses by default
- Admin-only Reveal endpoint logs to audit trail

## Milestone 10 — Audit hash-chain module + /api/audit/verify ✅
- SHA-256 chain: this_hash = SHA256(prev_hash + action + actor_id + timestamp + payload)
- Genesis hash = 0×64
- Verify endpoint walks the chain, recomputes each hash, flags tampered entries
- Audit entries auto-appended on: case_created, status_change, reveal_pii, field_verification_mismatch

## Milestone 11 — Grounded copilot RAG ✅
- Uses z-ai-web-dev-sdk chat completions
- System prompt forbids hallucination: "If the answer is not in the context, say 'I don't have that information'"
- Context built from case's structured data (work, vendor, payments, risk scores, SHAP, audit log, config)
- PII masked in context (PAN/bank masked)
- Sources extracted from answer via [source: fieldName] annotations
- Fallback answer builder if LLM call fails

## Milestone 12 — Frontend SPA shell ✅
- Sidebar nav with 12 views (filtered by role)
- Header with language toggle (EN/हि) + user info + logout
- Sticky footer
- Mobile-responsive (collapsible sidebar)
- Framer Motion transitions

## Milestone 13 — Dashboard view ✅
- 7 KPI cards (total works, sanctioned, utilized, utilization %, critical, open cases, citizen reports)
- Risk trend area chart (12 months, stacked critical/high)
- Tier distribution pie chart
- Top risks table (sortable, click-to-open)
- Live event feed via Socket.IO (auto-updating)

## Milestone 14 — Map view ✅
- SVG India state choropleth (12 states positioned by bounding boxes)
- Color-coded by utilization rate (5-tier: red → orange → yellow → lime → green)
- Click state for details (sanctioned, utilized, critical count, transparency score)
- Side panel with full state list

## Milestone 15 — Graph view ✅
- SVG vendor network with circular cluster layout
- Nodes sized by degree, colored by risk
- Ring nodes highlighted red with "RING" label
- Edge types color-coded (shared_pan red, shared_bank orange, co_located cyan, same_work purple)
- Side panels: detected rings, selected vendor details, edge legend

## Milestone 16 — Cases Kanban + Case detail ✅
- 5-column Kanban (open/investigating/escalated/resolved/closed)
- Auto-created cases for critical-flagged works
- Case detail: header card, work & vendor details, SHAP waterfall, rule flags, score breakdown grid
- Audit trail viewer with hash-chain verify button + per-entry valid/invalid indicator
- Status update form with notes
- Investigator copilot chat panel (suggested questions + free text + sources display)
- Export PDF button (signed hash-stamped bundle)
- Reveal PII button (admin only, writes audit entry)

## Milestone 17 — Admin pages ✅
- Scoring config: 5 weight sliders + 3 cutoff sliders + total weight indicator
- Live preview: re-score 50 sample works with new config, before/after table with delta column
- Model metrics: 3 model comparison cards + ROC curve + PR curve + per-pattern table
- Blacklist manager: add entry form + entries table (masked by default, full value for admin)

## Milestone 18 — Public pages ✅
- Transparency portal (no-login): 4 KPI cards, state-wise bar chart, top/under-performing states, top/low districts
- Leaderboard: MP and district rankings with composite transparency score
- Citizen report form: workId, reporterName, contact, description, photo capture, geolocation capture
- Auto cross-reference: matched system flags surfaced to citizen on submit

## Milestone 19 — Field verification PWA + system health ✅
- Field verification: mobile-responsive, look up work by ID, view work + risk details, capture photo + GPS, match/mismatch buttons, log verification
- System health: 5 health cards (p95 latency, uptime, memory, DB rows, requests), pipeline status, DB table row counts, forecast chart, auto-refresh every 5s

## Milestone 20 — i18n (English + Hindi) ✅
- Custom dictionary with 60+ keys
- Language toggle in header
- Applied to: nav labels, KPI labels, view titles, case status labels, form labels
- Persisted to localStorage

## Milestone 21 — Notification system ✅
- Email + webhook channels (logged to NotificationLog table)
- Auto-fired on critical flag creation (during scoring pipeline run)
- Auto-fired on case escalation (POST /api/cases/{id}/status with status=escalated)

## Milestone 22 — Security hardening ✅
- Session tokens (32 random bytes hex)
- Passwords hashed with SHA-256
- PII masking in all API responses by default
- Admin-only Reveal endpoint with audit logging
- Role checks on protected endpoints (admin/analyst/auditor/citizen)
- Public endpoints (transparency, citizen-reports) rate-limitable

## Milestone 23 — Real-time streaming simulation ✅
- Socket.IO mini-service on port 3003
- 4 event types: fund_release, risk_flag, case_update, citizen_report
- Auto-emits every 5-8 seconds
- Dashboard live feed auto-updates on connect

## Milestone 24 — Agent-browser verification ✅
- Login flow verified (admin credentials)
- All 12 views navigated and screenshotted
- Copilot question submitted, answer returned with sources
- Audit chain verify button tested (Chain valid)
- PDF export tested (200, application/pdf, 3.8KB)
- Hindi language toggle verified (nav + KPI labels translated)
- No runtime errors in dev log during testing

## Skipped / Future Roadmap
- Docker Compose (not needed in this sandbox — Next.js + Prisma + Socket.IO mini-service suffice)
- GitHub Actions CI (would require git remote setup)
- Real SMTP/Resend integration (currently logs to NotificationLog)
- Real MLflow tracking server (currently stores metrics in ModelRun table)
- Real PostgreSQL with pg_trgm (SQLite sufficient for demo scale)
- Real-time Kafka streaming (Socket.IO simulation sufficient for demo)
