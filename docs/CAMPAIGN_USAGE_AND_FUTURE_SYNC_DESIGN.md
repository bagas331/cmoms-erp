# CMOS: Campaign Usage Management & Future Synchronization Architecture Design

**Document Version:** 1.0.0  
**Status:** Approved Architectural Specification (Phase 4 Deliverable)  
**Security Classification:** Confidential / Internal Operations  
**Date:** October 2026  

---

## 1. Executive Summary

This document provides a comprehensive architectural specification for the **Campaign Usage Management** module within the Orbiz Creative & Motion Operations System (CMOS / CMOMS) and outlines the future synchronization design for completed ERP requests with external repositories (such as Google Sheets).

### Strict Boundary Statement:
- **Phase 1-3 Implementation:** The current production deployment operates in **STRICTLY READ-ONLY MODE**.
- Zero write, append, update, clear, or batchUpdate calls are executed against Google Sheets or any external service.
- The external Motion Framework Portal (`https://jovadirgantara.github.io/motion-framework-portal/campaign`) and Google Sheets (`1aXZ2STMDwPa-zFeZj37aa_Ko4-IE5WYzIKKe3EMm8rs`) remain completely untouched.

---

## 2. Audit of ERP Task Completion States Across Pipelines

In CMOS, workflows are decoupled across four distinct pipelines. It is a critical architectural error to conflate "Request Selesai", "Mockup Disetujui", "Motion Output Selesai", and "Asset Siap Digunakan Operator". Each represents a different lifecycle milestone with distinct business rules, permissions, and consumers.

### 2.1 Distinction Matrix

| Milestone | Pipeline Applicable | Triggering State / Action | PIC / Owner | Output Produced | Is Ready for OP? |
|---|---|---|---|---|---|
| **1. Request Selesai (GD E-Commerce)** | `GD_NON_MOCKUP` | Task status transitions to `TASK_CLOSED` or `DESIGN_APPROVED` with client approval | Designer & Requester | Static banners, name cards, PDP graphics, PDF decks | **No** (Non-mockup content for marketplace/social, not streaming mockup) |
| **2. Request Selesai (Strategic)** | `STRATEGIC` | Concept approved (`STRAT_STATUS === 'APPROVED'`), then design approved (`DESIGN_APPROVED`) | Strategic PIC & Designer | Strategic concept link, copy brief, approved layout | **No** (Concept/layout completed, not animated) |
| **3. Mockup Disetujui** | `GD_MOCKUP` | Lead/Requester approves mockup design (`DESIGN_APPROVED`); triggers auto-handover to Motion | Lead / Requester | Layered Photoshop / Illustrator `.psd` file with approved dimensions | **No** (Static mockup template approved, awaiting animation) |
| **4. Motion Output Selesai** | `MOTION` | Motion designer submits render; passes Lead QC (`STATUS === 'DONE'` or `'APPROVED'`) | Motion PIC & Lead | High-res video / WebM / Alpha video asset link on Google Drive | **Conditionally** (Render finished, pending scheduling) |
| **5. Asset Siap Digunakan Operator** | Operational Live Stream | Asset registered in *Motion Status* schedule with valid `Periode Mulai`, `Periode Selesai`, `Jam Tayang`, verified Drive URL, and Studio | Operations Lead / Motion PIC | Scheduled streaming asset ready for OBS/vMix broadcast operator | **YES (Live Operational Asset)** |

---

## 3. Data Mapping: CMOS ERP to Campaign Usage Management

When mapping completed CMOS records to the Campaign Usage Management schema:

| CMOS ERP Field (`tasks` / `motion_tasks`) | Google Sheets Tab 2026 Field | Google Sheets Tab Motion Status Field | Transformation / Business Rule |
|---|---|---|---|
| `created_at` (Month) | `by Design Month Request` | `Bulan` | Format Indonesian month name (e.g. `Juli`, `Agustus`) |
| `created_at` (Date) | `Req. Date` | `Tanggal Produksi` | Format `DD/MM/YYYY` |
| `client.name` | `Brand` | `Brand` | Uppercase normalized brand string |
| `campaign` | `Campaign` | `Kampanye` | Normalized: `BAU`, `DD`, `PAYDAY`, `SPECIAL CAMPAIGN` |
| `is_strategic` / `has_concept` | `by Strategic With Strategic Concept` | - | `'Yes'` if strategic concept required, else `'No'` |
| `strat_pic.full_name` | `Strat PIC` | - | Lead Strategic member name |
| `design_pic.full_name` | `by Design Design PIC` | - | Assigned Designer name |
| `content_type.name` | `Type of Content` | `Tipe` | Content classification (Mockup, Banner, etc.) |
| `task_source` | `Taks Source` | - | Normalized: `Ecommerce` or `Orca` |
| `quantity` | `Req. Qty` | - | Requested quantity (default 1) |
| `output_qty` | `Output Qty` | - | Delivered quantity |
| `due_date` | `Due Date` | - | Format `DD/MM/YYYY` |
| `completed_at` | `Submission Date` | - | Actual completion timestamp |
| `working_days_spent` | `Working Day (SLA 3 Days)` | - | Calculated working days excluding holidays/weekends |
| `operational_excellence` | `Operational Exellence` | - | `Excellence` (within SLA & 0/1 revision), `Good` (minor delay/revision), `Bad` (>SLA or major revision) |
| `difficulty` | `Design Difficulty` | `Complexity` | `Low`, `Medium`, `High` |
| `revisions.length` | `Design Revision` / `Strat Revision` | `Revisi & Tipe` | Numeric or stage breakdown (e.g. `V2 | Alif`) |
| `status` | `Status Design` / `Status Strat` | `Status Mockup` | `Done`, `On Progress`, `Waiting Approval`, `Blocked` |
| `final_asset_name` | `by Motion to OP Final Asset Name` | `Nama Aset` | Standardized naming e.g. `[BRAND]_[CAMPAIGN]_[TYPE]` |
| `motion_pic.full_name` | `Motion PIC` | `Motion PIC` | Motion Designer name |
| `output_url` / `drive_url` | `Link Motion` | `Link File` | Sanitized Google Drive link |
| `notes` / `remarks` | `Remark (Wardrobe, Gimmick...)` | `Catatan` | Specific operational notes |

---

## 4. Architectural Design for Future Two-Way Synchronization

> [!IMPORTANT]
> This section documents the prospective design for future implementation. It is **NOT** active in the current release. Any implementation of write-back operations requires explicit stakeholder approval, dedicated Google Cloud Service Account credentials with write scopes, and migration testing.

### 4.1 System Components Diagram

```
+-----------------------------------------------------------------------------------+
|                                  CMOS ERP SYSTEM                                  |
|                                                                                   |
|  [Tasks / Motion Tasks] ---> [Event Trigger / Hook]                               |
|                                     |                                             |
|                                     v                                             |
|                     [Task Completion Filter & Validator]                          |
|                                     |                                             |
|                                     v                                             |
|                         [Outbox Queue / Sync Table]                               |
|                         (Record Deduplication Key: UUID)                          |
|                                     |                                             |
+-------------------------------------|---------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                        FUTURE WRITE WORKER (STANDALONE)                           |
|                                                                                   |
|  [Rate Limiter & Backoff] ---> [Google Sheets API v4 with Service Account]        |
|                                     |                                             |
|                                     v                                             |
|                       [Audit Log & Conflict Resolver]                             |
+-----------------------------------------------------------------------------------+
```

### 4.2 Deduplication and Idempotency Strategy
1. **Primary Sync Key:**
   Each ERP record generates an immutable deterministic sync key: `cmos_${pipeline}_${taskId}_${revisionCount}`.
2. **Idempotent Upsert:**
   Before appending or writing to external Google Sheets, the worker performs a lookup of column `A` or metadata comment tags. If the key already exists, the worker performs an in-place row update (`spreadsheets.values.update`) rather than duplicating rows (`append`).
3. **Change Detection:**
   A SHA-256 hash of the mapped payload (`payload_hash`) is stored in the ERP database `sync_history` table. If the hash has not changed, upstream write calls are skipped entirely.

### 4.3 Resilience & Failure Management
1. **Exponential Backoff:**
   Google Sheets API enforces a limit of 300 write requests per minute per project. The future worker must implement truncated exponential backoff (starting at 1s, doubling up to 64s, with jitter).
2. **Outbox Pattern:**
   Task status changes must never directly execute HTTP calls in the user request thread. Instead, status changes commit to an internal transactional outbox table (`campaign_sync_outbox`), ensuring that transient Google network failures never block ERP workflow progression.
3. **Dead-Letter Queue & Monitoring:**
   Records failing after 5 attempts are flagged as `DEAD_LETTER` with detailed error logs for administrator intervention via `/dashboard/admin/audit`.

### 4.4 Audit Trail
All sync operations must record:
- `sync_id` (UUID)
- `task_id` (UUID)
- `source_pipeline` (Enum)
- `sync_timestamp` (ISO-8601 UTC)
- `status` (`SUCCESS` | `FAILED` | `RETRY`)
- `external_row_index` (Integer)
- `payload_snapshot` (JSONB)
- `error_message` (Text, if applicable)

---

## 5. Security & Principle of Least Privilege

1. **Authentication:** Server-side HMAC token verification (`resolveAuthenticatedUser`) protects all internal API routes. Client tokens or query strings are never trusted.
2. **URL Sanitization:** All Google Drive and external file links undergo strict RFC-compliant sanitization (`sanitizeUrl`) to prevent `javascript:`, data URIs, and open-redirect vulnerabilities.
3. **Information Disclosure Prevention:** Upstream Google API errors are sanitized so that internal file paths, credentials, and network topologies are never leaked to the client interface.

---

## 6. Conclusion

The current Phase 2/3 Campaign Usage Management module delivers a resilient, high-performance, strictly read-only interface meeting 100% of the operational requirements. The future synchronization architecture documented herein establishes a safe, idempotent roadmap for any future write integration should the business authorize it.
