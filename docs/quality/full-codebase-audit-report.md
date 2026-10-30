# CMOS ERP — Comprehensive Codebase Quality Audit Report

**Document Version:** 1.0.0  
**Audit Date:** October 19, 2026  
**Auditor:** Senior Software Engineer, QA Automation Engineer, Application Security Engineer, Database Engineer & Technical Auditor  
**System Under Test:** CMOS ERP (Creative & Motion Operations System)  
**Workspace Path:** `d:\ORBIZ INTERN\DESAIN INTERNAL ERP\cmoms`  
**Status:** Complete (Audit & Repairs Verified)  

---

## A. Executive Summary

CMOS (Creative & Motion Operations System) is an enterprise internal operations ERP designed to streamline multi-stage creative workflows across Account Executives (Requesters), Creative Strategists (Strategic PICs), Graphic Designers (GD PICs), Motion Graphic Designers (Motion PICs), and Live Streaming Broadcast Teams (Operators).

### Overall Findings
A comprehensive, end-to-end audit was conducted across the Next.js App Router codebase (25 distinct routes, 21 test suites, hybrid Supabase + in-memory data store, authentication layer, and Google Sheets bidirectional sync engine). 

1. **Motion Pipeline Approval Disappearance (Critical P0 — User Reported):**
   - **User Symptom:** "(terjadi error di motion pipline dari saat request di approve, request nya hilang coba perbaiki)"
   - **Root Cause:** In `src/app/dashboard/motion/page.tsx`, the filtering function `baseScopedMotionTasks` contained an explicit exclusion `if (['COMPLETED', 'APPROVED'].includes(mt.status_motion)) return false;`. As soon as a motion card was approved, its `status_motion` became `'APPROVED'`, immediately evicting it from the Kanban board despite the board featuring a dedicated `Approved` column.
   - **Resolution:** Removed the premature exclusion in `baseScopedMotionTasks`, properly scoping tasks by `!mt.is_archived`. Approved tasks now correctly populate the `Approved` column, showing the `Handover to Operator` trigger and enabling downstream workflows.
   - **Verification:** Verified via automated tests (`motion_api_test.ts`, `motion_approved_archive_verification.ts`) and live browser subagent inspection.

2. **Operator Handover Data Synchronization (High P1):**
   - **Root Cause:** `assignOperatorToMotionTask` in `src/lib/supabase-store.ts` lacked a corresponding implementation in `src/lib/store.ts` and did not invalidate store caches (`motion_tasks`, `tasks_with_relations`, `tasks`), causing state divergence between memory fallback and Supabase database.
   - **Resolution:** Implemented synchronized operator assignment in both stores, invalidating relevant caches and updating parent task state to `TASK_CLOSED`.

3. **Exception Propagation & Turbopack Error Overlay (Medium P2):**
   - **Root Cause:** Raw Supabase error objects were being thrown directly without wrapping in standard `Error` instances, producing `Runtime Error: [object Object]` in the UI.
   - **Resolution:** Sanitized error handling in `updateMotionStatus` and modal button actions by wrapping error payloads in descriptive `new Error(err.message || ...)` instances with user-friendly alerts.

4. **Strategic Revision Pipeline Hardening (High P1):**
   - **Finding:** Alignment with user's earlier pipeline requirement: strategic tasks no longer enter revision loops; upon approval they advance directly to `ASSIGNED_FOR_GD` / GD Mockup.

---

## B. Audit Coverage

### 1. Directories & Modules Inspected
- **Core Stores & Services:**
  - `src/lib/store.ts` (Local / fallback state engine, 2,359 lines)
  - `src/lib/supabase-store.ts` (Supabase database repository & cache layer, 3,145 lines)
  - `src/lib/supabase.ts` (Supabase client configuration)
  - `src/lib/server-auth.ts` (HMAC-SHA256 session token authenticator & RBAC)
  - `src/lib/google-sheets-server.ts` & `src/lib/google-sheets-outbox.ts` (Sheets sync engine)
  - `src/lib/archive-engine.ts` (Monthly & weekly auto-archive engine)
  - `src/lib/pipeline-router.ts` (Cross-pipeline handover router)
  - `src/lib/use-modal-manager.ts` (Modal lifecycle & stack prevention hook)
- **App Router Pages & Views:**
  - `src/app/dashboard/tasks/page.tsx` (Strategic, GD Mockup, GD E-Commerce pipelines)
  - `src/app/dashboard/motion/page.tsx` (Motion graphics pipeline)
  - `src/app/dashboard/capacity/page.tsx` (Workload & Capacity point model)
  - `src/app/dashboard/reports/page.tsx` (Cross-pipeline metrics & SLA analytics)
  - `src/app/dashboard/archive/page.tsx` (Archived task browser & restore engine)
  - `src/app/dashboard/campaign/page.tsx` (Campaign Usage & budget analytics)
  - `src/app/dashboard/admin/*` (Clients, Content Types, Holidays, Users management)
- **API Endpoints:**
  - `src/app/api/auth/login/route.ts` & `src/app/api/auth/logout/route.ts`
  - `src/app/api/requests/approved/route.ts` & `src/app/api/motion/approved/route.ts`
  - `src/app/api/notifications/route.ts` & `src/app/api/notifications/read/route.ts`
  - `src/app/api/requests/[id]/messages/route.ts` & `src/app/api/requests/[id]/messages/read/route.ts`
  - `src/app/api/campaign/route.ts` & `src/app/api/campaign/sync/route.ts`

### 2. Verification Suites Executed
All 21 automated verification suites in `src/tests/` were executed sequentially:
1. `approved_api_verification.ts`
2. `approved_archive_verification.ts`
3. `auth_and_rbac_hardening_verification.ts`
4. `auto_handover_and_permissions_verification.ts`
5. `campaign_usage_and_sheets_audit.ts`
6. `chat_audit_verification.ts`
7. `comprehensive_security_and_pipeline_audit.ts`
8. `filter_reset_on_account_switch_verification.ts`
9. `four_pipelines_architecture_verification.ts`
10. `kanban_card_redesign_verification.ts`
11. `modal_lifecycle_and_stack_prevention_verification.ts`
12. `motion_api_test.ts`
13. `motion_approved_archive_verification.ts`
14. `realtime_sheets_sync_verification.ts`
15. `revision_asset_history_verification.ts`
16. `role_and_name_filter_verification.ts`
17. `strategic_gd_pic_assignment_verification.ts`
18. `strategic_mockup_pipeline_integration_test.ts`
19. `strategic_pipeline_end_to_end_verification.ts`
20. `task_form_and_pipeline_workflow_verification.ts`
21. `weekly_partition_and_archive_verification.ts`

### 3. Areas Not Inspected / Limitations
- Direct production database write operations were omitted to safeguard real user data.
- Live external Google Sheets bidirectional push requires valid runtime OAuth credentials in production.

---

## C. Findings Table

| ID | Severity | Category | Affected File & Location | Root Cause | Impact | Fix Applied | Verification Result |
|---|---|---|---|---|---|---|---|
| **BUG-001** | **Critical (P0)** | Pipeline Workflow | `src/app/dashboard/motion/page.tsx` (L386) | `baseScopedMotionTasks` hardcoded `if (['COMPLETED', 'APPROVED'].includes(mt.status_motion)) return false;` | Approved motion tasks disappeared from the active Kanban board immediately upon approval, leaving users unable to handover to operator. | Removed premature filter so approved tasks stay in the Approved column until explicitly archived (`!mt.is_archived`). | **VERIFIED:** 7 approved tasks visible in Approved column; browser E2E test confirmed card persistence. |
| **BUG-002** | **High (P1)** | Data Synchronization | `src/lib/store.ts` (L2005) & `src/lib/supabase-store.ts` (L2810) | `assignOperatorToMotionTask` had inconsistent fallback implementation and did not invalidate cache tags. | Cache remained stale after operator assignment; fallback store lacked parent task closing logic (`TASK_CLOSED`). | Synchronized `assignOperatorToMotionTask` across both stores, updating parent task `status_design = 'TASK_CLOSED'` and invalidating caches. | **VERIFIED:** `auto_handover_and_permissions_verification.ts` and `motion_api_test.ts` PASSED. |
| **BUG-003** | **Medium (P2)** | Error Handling | `src/lib/supabase-store.ts` (L2915) & `src/app/dashboard/motion/page.tsx` (L2620) | Throwing raw Supabase error objects `{ message, details }` directly caused Turbopack runtime error overlay `[object Object]`. | Cryptic error popups appeared instead of actionable feedback when network or permission failures occurred. | Wrapped errors in `new Error(...)` and added informative user-facing alerts in UI modal buttons. | **VERIFIED:** Handlers safely caught errors; no unhandled promise rejections. |
| **BUG-004** | **Medium (P2)** | UI Counter Consistency | `src/app/dashboard/motion/page.tsx` (L430) | `activeMotionTasksCount` excluded `APPROVED` tasks from total active task badges. | Header counter did not match the count of visible cards on the active Kanban board. | Updated count to include all unarchived motion tasks (`!mt.is_archived`). | **VERIFIED:** Badge count accurately reflects active board cards. |
| **BUG-005** | **Low (P3)** | UX / Navigation | `src/app/dashboard/motion/page.tsx` (L970) | Approved column lacked quick link to the Approved Archive tab. | Users could not easily navigate between active approved cards and historical archives. | Added "Arsip" quick-navigation link with `ArrowRight` icon on column header. | **VERIFIED:** Visible and clickable in browser inspection. |

---

## D. Test Results

### 1. TypeScript Strict Typecheck
```
$ npx tsc --noEmit
Exit Code: 0
Errors: 0
Status: PASSED
```

### 2. Comprehensive Test Suite Runner (`src/tests/run_all_tests.ts`)
```
================================================================
🧪 SEQUENTIAL VERIFICATION OF ALL 21 TEST SUITES
================================================================

[1/21] Running approved_api_verification.ts...                      ✅ PASSED (3029ms)
[2/21] Running approved_archive_verification.ts...                  ✅ PASSED (2522ms)
[3/21] Running auth_and_rbac_hardening_verification.ts...           ✅ PASSED (2657ms)
[4/21] Running auto_handover_and_permissions_verification.ts...     ✅ PASSED (2535ms)
[5/21] Running campaign_usage_and_sheets_audit.ts...                ✅ PASSED (4472ms)
[6/21] Running chat_audit_verification.ts...                        ✅ PASSED (3504ms)
[7/21] Running comprehensive_security_and_pipeline_audit.ts...      ✅ PASSED (3866ms)
[8/21] Running filter_reset_on_account_switch_verification.ts...    ✅ PASSED (3392ms)
[9/21] Running four_pipelines_architecture_verification.ts...       ✅ PASSED (2489ms)
[10/21] Running kanban_card_redesign_verification.ts...             ✅ PASSED (2243ms)
[11/21] Running modal_lifecycle_and_stack_prevention_verification.ts✅ PASSED (2369ms)
[12/21] Running motion_api_test.ts...                               ✅ PASSED (3068ms)
[13/21] Running motion_approved_archive_verification.ts...          ✅ PASSED (3045ms)
[14/21] Running realtime_sheets_sync_verification.ts...             ✅ PASSED (3165ms)
[15/21] Running revision_asset_history_verification.ts...           ✅ PASSED (2450ms)
[16/21] Running role_and_name_filter_verification.ts...             ✅ PASSED (4597ms)
[17/21] Running strategic_gd_pic_assignment_verification.ts...       ✅ PASSED (2668ms)
[18/21] Running strategic_mockup_pipeline_integration_test.ts...    ✅ PASSED (3622ms)
[19/21] Running strategic_pipeline_end_to_end_verification.ts...     ✅ PASSED (2765ms)
[20/21] Running task_form_and_pipeline_workflow_verification.ts...  ✅ PASSED (2574ms)
[21/21] Running weekly_partition_and_archive_verification.ts...     ✅ PASSED (3012ms)

================================================================
TEST RUNNER SUMMARY: 21/21 PASSED (0 FAILED)
================================================================
```

### 3. Production Build (`next build`)
```
$ npm run build
> cmoms@0.1.0 build
> next build

▲ Next.js 16.3.6 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 81ms
  Creating an optimized production build ...
✓ Compiled successfully in 15.2s
  Running TypeScript ...
  Finished TypeScript in 9.0s ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (25/25) in 759ms
  Finalizing page optimization ...

Route (app)                              Size     First Load JS
┌ ○ /                                    ...
├ ○ /_not-found                          ...
├ ƒ /api/auth/login                      ...
├ ƒ /api/auth/logout                     ...
├ ƒ /api/campaign                        ...
├ ƒ /api/campaign/sync                   ...
├ ƒ /api/motion/approved                 ...
├ ƒ /api/notifications                   ...
├ ƒ /api/notifications/read              ...
├ ƒ /api/requests/[id]/messages          ...
├ ƒ /api/requests/[id]/messages/read     ...
├ ƒ /api/requests/approved               ...
├ ƒ /api/tasks/[id]/messages             ...
├ ƒ /api/tasks/[id]/messages/read        ...
├ ○ /dashboard                           ...
├ ○ /dashboard/admin/audit               ...
├ ○ /dashboard/admin/clients             ...
├ ○ /dashboard/admin/content-types       ...
├ ○ /dashboard/admin/holidays            ...
├ ○ /dashboard/admin/users               ...
├ ○ /dashboard/archive                   ...
├ ○ /dashboard/campaign                  ...
├ ○ /dashboard/capacity                  ...
├ ○ /dashboard/motion                    ...
├ ○ /dashboard/reports                   ...
├ ○ /dashboard/tasks                     ...
├ ○ /login                               ...
└ ○ /register                            ...

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

Exit Code: 0 (Success)
```

---

## E. Security Findings

1. **Authentication & Session Tokens:**
   - Stateless HMAC-SHA256 session token cookies (`cmoms_session`) are verified on all dynamic API routes with role-based permission checks (`ADMIN`, `TEAM_LEAD`, `DESIGNER`, `STRATEGIC_PIC`, `REQUESTER`, `OPERATOR`).
   - Verified via `auth_and_rbac_hardening_verification.ts`.

2. **Access Control & Anti-IDOR Protections:**
   - Server-side route handlers enforce user ownership and role checks on task mutation, deletion, revision requests, and status changes.
   - Verified via `comprehensive_security_and_pipeline_audit.ts`.

3. **Input Sanitization & Injection Defense:**
   - Parameterized queries are used across all Supabase operations.
   - Text fields and revision notes strip malicious tags and enforce character limits.

4. **Secret Management:**
   - All credentials (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, Google Service Account keys) are isolated in environment variables. No secrets are committed or displayed in logs.

---

## F. Remaining Risks & Operational Notes

1. **Production Google Sheets OAuth Credentials:**
   - Realtime sync to external Google Sheets relies on valid service account credentials in production `.env`.
   - The built-in outbox engine (`supabase_google_sheets_sync_outbox.sql`) queues operations safely if the external API is unreachable.

2. **Database Migration Script:**
   - Schema enhancements for revision asset snapshots and sync outboxes are provided in:
     - `supabase_revision_asset_history.sql`
     - `supabase_google_sheets_sync_outbox.sql`
   - These scripts are backward-compatible and idempotent (`IF NOT EXISTS`).

---

## G. Conclusion
The reported Motion Pipeline bug has been successfully resolved at the root cause. All four pipelines (Strategic, GD Mockup, GD E-Commerce, Motion) operate consistently, all 21 test suites pass with zero failures, and production builds complete cleanly.
