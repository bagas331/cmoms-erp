# CMOS ERP — Bug Fix Log

**Document Version:** 1.0.0  
**Last Updated:** October 19, 2026  
**Auditor:** Senior Software Engineer & Technical Auditor  
**Workspace:** `d:\ORBIZ INTERN\DESAIN INTERNAL ERP\cmoms`  

---

## Log Entry #001: Motion Pipeline Request Disappearance Upon Approval

### 1. Metadata
- **Bug ID:** FIX-MOTION-001
- **Severity:** Critical (P0)
- **Module:** Motion Graphics Pipeline (`src/app/dashboard/motion/page.tsx`)
- **Reported By:** User ("terjadi error di motion pipline dari saat request di approve, request nya hilang coba perbaiki")
- **Date Fixed:** October 19, 2026
- **Status:** Verified & Resolved

### 2. Issue Description & Symptom
When a motion task in `SUBMITTED` status was approved by an authorized user (Team Lead, Admin, Requester), the motion card immediately vanished from the active Kanban board. Users were unable to proceed with subsequent operational steps, specifically the `Handover to Operator` workflow.

### 3. Root Cause Analysis
In `src/app/dashboard/motion/page.tsx`, the client-side filtering function `baseScopedMotionTasks` contained an explicit condition:
```typescript
if (['COMPLETED', 'APPROVED'].includes(mt.status_motion)) return false;
```
Even though the Kanban board defined a dedicated column for `APPROVED`:
```typescript
{ key: 'APPROVED', title: 'Approved', ... }
```
Any task transitioning to `status_motion = 'APPROVED'` was filtered out of `baseScopedMotionTasks`, making it invisible across all Kanban columns on the active board.

Furthermore, `activeMotionTasksCount` also excluded `APPROVED` tasks, causing the top badge count to become inconsistent with the pipeline state.

### 4. Code Changes Applied

#### File: `src/app/dashboard/motion/page.tsx`
- **Change 1: Scoping filter in `baseScopedMotionTasks`:**
```diff
- if (['COMPLETED', 'APPROVED'].includes(mt.status_motion)) return false;
```
Now tasks remain on the active board until explicitly marked as archived (`!mt.is_archived`).

- **Change 2: Active counter alignment:**
```diff
- const activeMotionTasksCount = useMemo(() => {
-   return motionTasks.filter(mt => !mt.is_archived && !['COMPLETED', 'APPROVED'].includes(mt.status_motion)).length;
- }, [motionTasks]);
+ const activeMotionTasksCount = useMemo(() => {
+   return motionTasks.filter(mt => !mt.is_archived).length;
+ }, [motionTasks]);
```

- **Change 3: Column header navigation:**
Added quick navigation link to "Arsip" with `ArrowRight` icon on the `APPROVED` column header, matching the design pipeline standard.

- **Change 4: Safe status updates & error handling:**
Updated `handleStatusChange` and detail modal action buttons (Undo, Start Work, Approve Motion) to pass `user.id` and wrap async mutations in `try / catch` blocks to prevent unhandled promise rejections.

### 5. Verification Evidence
1. **Automated Test Suite:**
   - Ran `npx tsx src/tests/motion_api_test.ts` — **PASSED**
   - Ran `npx tsx src/tests/motion_approved_archive_verification.ts` — **PASSED**
2. **Browser Subagent E2E Verification:**
   - Loaded `http://localhost:3000/dashboard/motion`.
   - Verified that the `Approved` column displays all 7 active approved motion tasks (e.g., MOT-2026-0042, MOT-2026-0041, REQ-2026-0013, REQ-2026-0002, REQ-2026-0056, MOT-2026-0040, REQ-2026-0048).
   - Confirmed each card has active `Handover` and `Undo` actions.
   - Recording saved: `motion_approval_verification_1792386376405.webp`.

---

## Log Entry #002: Operator Handover Data Synchronization

### 1. Metadata
- **Bug ID:** FIX-STORE-002
- **Severity:** High (P1)
- **Module:** Store & Repository Layer (`src/lib/store.ts`, `src/lib/supabase-store.ts`)
- **Date Fixed:** October 19, 2026
- **Status:** Verified & Resolved

### 2. Issue Description & Symptom
When an approved motion task was handed over to a Live Streaming Operator:
1. `src/lib/supabase-store.ts` did not synchronize state to `localStore`.
2. Cache invalidation tags (`motion_tasks`, `tasks_with_relations`, `tasks`) were not dispatched.
3. The parent task's `status_design` was not updated to `TASK_CLOSED` in `src/lib/store.ts`.

### 3. Root Cause Analysis
The handover function `assignOperatorToMotionTask` had divergent logic between the Supabase client implementation and the local in-memory fallback store. Calling handover updated the database record but left client cached state outdated until a full page reload occurred.

### 4. Code Changes Applied

#### File: `src/lib/store.ts`
Updated `assignOperatorToMotionTask` to update parent task `status_design = 'TASK_CLOSED'` and timestamp:
```typescript
if (mt.task_id) {
  const tasks = getTasks();
  const tIdx = tasks.findIndex(t => t.id === mt.task_id);
  if (tIdx !== -1) {
    tasks[tIdx].operator_id = operatorId;
    tasks[tIdx].status_design = 'TASK_CLOSED';
    tasks[tIdx].updated_at = now();
    setStore(STORE_KEYS.tasks, tasks);
  }
}
```

#### File: `src/lib/supabase-store.ts`
Synchronized fallback call and cache invalidation:
```typescript
localStore.assignOperatorToMotionTask(motionTaskId, operatorId, userId);
invalidateStoreCache('motion_tasks');
invalidateStoreCache('tasks_with_relations');
invalidateStoreCache('tasks');
```

### 5. Verification Evidence
- Ran `npx tsx src/tests/auto_handover_and_permissions_verification.ts` — **PASSED**
- Ran `npx tsx src/tests/motion_api_test.ts` — **PASSED**

---

## Log Entry #003: Supabase Runtime Error `[object Object]` Overlay Sanitization

### 1. Metadata
- **Bug ID:** FIX-ERROR-003
- **Severity:** Medium (P2)
- **Module:** API and UI Error Boundaries (`src/lib/supabase-store.ts`, `src/app/dashboard/motion/page.tsx`)
- **Date Fixed:** October 19, 2026
- **Status:** Verified & Resolved

### 2. Issue Description & Symptom
In development mode with Next.js Turbopack, whenever a Supabase query returned an error object, throwing `error` directly caused Turbopack's React overlay to display `Runtime Error: [object Object]`.

### 3. Root Cause Analysis
Supabase JS client returns error shapes `{ message: string, details?: string, code?: string }` which are plain JavaScript objects rather than standard `Error` instances. When thrown as uncaught rejections, React dev tools stringify them into `[object Object]`.

### 4. Code Changes Applied

#### File: `src/lib/supabase-store.ts`
```typescript
const { error } = await supabase.from('motion_tasks').update(updatePayload).eq('id', motionTaskId);
if (error) {
  console.error('Supabase updateMotionStatus error:', error);
  throw new Error(error.message || error.details || 'Gagal mengubah status motion');
}
```

#### File: `src/app/dashboard/motion/page.tsx`
Wrapped modal action button handlers in try/catch with user-friendly alerts:
```typescript
try {
  await updateMotionStatus(motionTask.id, 'APPROVED', user.id);
  onRefresh();
  onClose();
} catch (err: any) {
  console.error('Error approving motion task:', err);
  alert(`Gagal menyetujui motion task: ${err?.message || String(err)}`);
}
```

### 5. Verification Evidence
- Ran `npx tsx src/tests/modal_lifecycle_and_stack_prevention_verification.ts` — **PASSED**
- Verified modal button interaction in browser with valid user context.

---

## Regression Verification Summary

| Check | Tool / Command | Result |
|---|---|---|
| TypeScript Typecheck | `npx tsc --noEmit` | **0 errors (Exit 0)** |
| 21 Automated Test Suites | `npx tsx src/tests/run_all_tests.ts` | **21/21 PASSED (0 failed)** |
| Next.js Production Build | `npm run build` | **25/25 routes compiled (Exit 0)** |
| Browser E2E Inspection | Browser Subagent | **All approved motion tasks visible in Approved column** |
