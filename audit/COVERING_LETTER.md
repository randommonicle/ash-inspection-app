# Covering Statement to the Independent Audit Team

**Subject:** ASH Inspection App, software version 0.2.3
**Date:** 13 May 2026
**Issued by:** Ben Graham, Senior Property Manager and lead developer, ASH Chartered Surveyors
**Audit scope as understood:** Security, statutory compliance, data protection (UK GDPR), safety, database structure, methodology, and overall fitness for purpose.

---

## To the Audit Team

Thank you for taking on this review. This letter is intended to set out — clearly and without varnish — what you are about to look at, why it has been built the way it has, what is well-controlled, and what is not yet finished. It accompanies a full system specification (`SPECIFICATION.md`) which is the authoritative technical document. This letter does not replicate that detail; it frames it.

I am writing as both the property manager who will use the system in production and the person who has written every line of its code. That is unusual, and the audit team should know it up front: there is no separate development organisation behind this work. The dual role brings a benefit (the system is shaped by the operator's actual needs) and a risk (the developer is also the reviewer, the tester, the deployer, and the data protection point-of-contact). I have tried to mitigate that by writing documentation that is exacting enough to be reviewed externally, by adopting engineering conventions borrowed from a sibling project intended for multi-firm production use (PropOS), and by keeping a candid record of every decision in `CLAUDE.md` and `NEXT_SESSION.md`. Both files are inside the repository and form part of the audit material.

### What the system does

It replaces a paper-based block-inspection workflow at ASH Chartered Surveyors. A property manager walks a residential block, narrates observations into the app, takes photographs, completes a pre-report checklist, and receives a branded Word document (plus PDF and self-contained HTML) by email a few minutes later. AI is used internally to convert voice narration into professional report prose, to classify each observation into one of twelve inspection sections, to describe and group photographs, and to produce an overall condition summary. The AI is not used to make findings or judgements of fact — it transcribes, classifies, and summarises what the inspector said and what is visible in the inspector's photographs.

The system does **not** generate structural surveys, RICS Home Surveys, fire-door inspections, or any other statutory report. Each report carries a disclaimer to that effect. Inspections are visual, restricted to accessible common areas, and conducted by a RICS-regulated firm acting in its managing-agent capacity.

### What is well-controlled

I would draw the audit team's attention first to:

- **Authentication and authorisation.** Every API route requires a valid Supabase JWT. The server independently re-checks that the inspection being acted upon belongs to the calling inspector before doing any work. Row-Level Security policies in Postgres scope every table to its rightful owner. The service-role key never reaches the Android app; it sits only on the Railway server.
- **Secrets exposure.** No third-party API key ships in the Android APK. Deepgram (transcription) was moved server-side specifically because the prior client-side arrangement was unacceptable for production. The Supabase anon key is in the bundle by design — it is RLS-bounded.
- **Rate limiting.** Every protected route has a per-IP rate limit. The report-generation route, which is the most expensive in both compute and AI cost, is capped at 10 requests per hour.
- **AI failure handling.** Every AI call is wrapped in non-fatal error handling. A failure in classification, dedup, summary, or synthesis never aborts a report. The inspector always receives a deliverable. This is documented in §9.4 of the specification.
- **Test coverage where it matters.** Eighteen unit tests run in under half a second and cover the structural invariants that broke historically (a missing section key in `SECTION_ORDER`; a regression in HTML escaping; signature rendering with and without a captured buffer). Six integration tests exercise the real Anthropic API. The convention is: *fix the code, never skip the test*.
- **Iteration discipline.** The build is structured in numbered phases with field-test gates between them. Each phase has been used in anger before the next began. The audit team should not see speculative or unused features in the code; everything in `app/src/` and `server/` is wired to an active path.
- **Honest record-keeping.** The repository contains a developer guide (`CLAUDE.md`) which captures decisions, gotchas, and lessons-learned at the point of discovery. It is intentionally written for a successor — human or AI — to pick up the codebase cold.

### What is not yet finished

This is the more important half of this letter. I list these openly because the audit team will find them anyway, and I would rather present them than have them presented to me.

- **No formal Data Processing Agreements have been signed** with the third-party processors (Anthropic, Deepgram, Resend, Supabase, Railway). Each provider publishes a standard DPA via their Trust Center; ASH has not yet formally accepted or signed these. This is the most material gap and is item 5 in the open-items register (specification §10.1).
- **No published Privacy Notice** covers the system specifically. ASH Chartered Surveyors is ICO-registered at the firm level; whether this system materially changes that registration has not been formally reassessed.
- **No DPIA** has been conducted. Whether one is *required* under UK GDPR Article 35 is a judgement call (incidental processing of resident personal data via photographs is possible; large-scale or systematic monitoring is not occurring). A DPIA is recommended in any case and is open item 8.
- **Supabase region not yet explicitly verified.** The project is *intended* to live in `eu-west-2`. The architectural decision is recorded; the actual region setting needs to be confirmed in the Supabase dashboard before go-live. Item 1 in §10.1.
- **Supabase is on the free tier.** Point-in-Time Recovery and verified backup cadence require a paid tier, which has not yet been upgraded. Item 3 in §10.1.
- **No formal penetration test, no SAST in CI, no SBOM.** The mitigation is small surface area (two users on company-issued devices, signed APKs, server-side AI, RLS-enforced database) but the absence is real and should be considered when assessing residual risk.
- **No multi-factor authentication on Supabase Auth.** At current scale (two users, company devices) MFA is operationally awkward. The cold-start re-login behaviour is the primary control. This will need revisiting at any scale-up.
- **Retention is intended, not enforced.** A 6-year retention period aligns with the RICS / professional-indemnity tail, but there is no scheduled deletion job and `deleteInspection()` is a hard delete rather than a soft delete. The system therefore *over*-retains by default, not *under*-retains.
- **Single-developer responder.** There is no formal incident-response runbook beyond "Ben investigates Railway logs." For a two-user system in pilot this is proportionate; it is not a mature posture.
- **Test data still in production database.** The current Supabase database contains test inspections only. These will be truncated, and the storage bucket cleared of test photos, before any client-facing data is captured. Item 10.3 of the specification.

I am not asking the audit team to overlook these items. I am asking the audit team to evaluate them in the context of a small, single-firm, two-user pilot that has not yet handled live client data, and to indicate which items should be hard go-live gates and which can sit on a documented remediation plan.

### Methodology notes for the auditor

A few things will save the audit team time:

1. **The repository contains everything.** There is no separate documentation portal, ticketing system, design archive, or runbook external to the repo. `CLAUDE.md` is the runbook. `README.md` is the high-level overview. `NEXT_SESSION.md` is a running log of in-flight thinking. Migrations are in `supabase/migrations/`. Tests are in `server/tests/`.
2. **The colloquial use of "RAG" is misleading here.** Specification §9.1 spells this out: the system uses direct LLM prompting with structured context fetched from Postgres. It does not use vector embeddings, vector databases, or document retrieval. If the audit team's framework expects to find a RAG pipeline, the answer is that there isn't one — and the LLM use that *is* present is bounded, costed (every call logged with USD spend in `api_usage_log`), and non-fatal on failure.
3. **The codebase is the source of truth, not this document.** If the documentation and the code disagree on any point, the code wins, and I would like to be told so the documentation can be corrected. I have not edited the codebase to suppress findings since starting to prepare these documents and will not do so until the audit concludes.
4. **PropOS is referenced repeatedly but is not part of this audit.** PropOS is a sibling property-management system in development by the same author. The inspection app is intended to fold into PropOS eventually as an unbranded module. References in the specification to "PropOS conventions" are forward-looking architectural intent, not present-tense claims about the system in front of the audit team.

### Practical points

- The development team will respond to clarifying questions within one working day where possible.
- The audit team is welcome to request a live walkthrough of the app on device, the admin dashboard, the Supabase project, the Railway deployment, or any specific code path.
- The development team will not push code changes to the `main` branch during the audit window without first notifying the audit team. Bug-squash work that is genuinely necessary will be branched and held.
- Findings will be acknowledged in writing and incorporated into the open-items register at specification §10.1.

I expect the audit will surface items I have not anticipated. I will treat those findings constructively. The intent here is not to receive a clean bill of health for v0.2.3 — it is to know exactly where the system stands before any real client data flows through it, and to act on what you tell us.

Yours faithfully,

**Ben Graham**
Senior Property Manager and lead developer
ASH Chartered Surveyors
ben240689@proton.me

---

*Attached: `SPECIFICATION.md` — full system specification (v1.0, 13 May 2026).*
