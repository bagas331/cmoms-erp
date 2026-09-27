import { createClient } from '@supabase/supabase-js';
import {
  SEED_ROLES, SEED_USERS, SEED_CLIENTS, SEED_CONTENT_TYPES,
  SEED_HOLIDAYS, SEED_TASKS, SEED_MOTION_TASKS, SEED_REVISIONS,
  SEED_AUDIT_LOGS, SEED_NOTIFICATIONS
} from './src/lib/seed-data';

// Deterministic UUIDs for users to satisfy Postgres UUID type
const UUID_MAP: Record<string, string> = {
  'u-admin-001': '00000000-0000-0000-0000-000000000001',
  'u-lead-alfie': '00000000-0000-0000-0000-000000000002',
  'u-strat-ira': '00000000-0000-0000-0000-000000000003',
  'u-strat-mahes': '00000000-0000-0000-0000-000000000004',
  'u-des-nadya': '00000000-0000-0000-0000-000000000005',
  'u-des-yusuf': '00000000-0000-0000-0000-000000000006',
  'u-des-bad': '00000000-0000-0000-0000-000000000007',
  'u-mot-jova': '00000000-0000-0000-0000-000000000008',
  'u-mot-bima': '00000000-0000-0000-0000-000000000009',
  'u-req-sarah': '00000000-0000-0000-0000-000000000010',
  'u-req-reza': '00000000-0000-0000-0000-000000000011',
  'u-op-sam': '00000000-0000-0000-0000-000000000012',
};

function mapTaskId(id: string): string {
  const digits = id.replace(/\D/g, '') || '1';
  return `10000000-0000-0000-0000-${digits.padStart(12, '0').slice(-12)}`;
}

function mapUserId(id: string | null | undefined): string | null {
  if (!id) return null;
  return UUID_MAP[id] || id;
}

import fs from 'fs';

// Load credentials safely from .env.local or process.env
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if ((!supabaseUrl || !supabaseKey) && fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  if (keyMatch) supabaseKey = keyMatch[1].trim();
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function seedDatabase() {
  console.log('Seeding Supabase database...');

  // 1. Roles
  console.log('Inserting Roles...');
  const roles = SEED_ROLES.map(({ created_at, label, ...rest }) => rest);
  const { error: rolesErr } = await supabase.from('roles').upsert(roles);
  if (rolesErr) console.error('Roles error:', rolesErr);

  // 2. Users
  console.log('Inserting Users...');
  const users = SEED_USERS.map(u => ({
    ...u,
    id: mapUserId(u.id)
  }));
  const { error: usersErr } = await supabase.from('users').upsert(users);
  if (usersErr) console.error('Users error:', usersErr);

  // 3. Clients
  console.log('Inserting Clients...');
  const clients = SEED_CLIENTS.map(({ created_at, ...rest }) => rest);
  const { error: clientsErr } = await supabase.from('clients').upsert(clients);
  if (clientsErr) console.error('Clients error:', clientsErr);

  // 4. Content Types
  console.log('Inserting Content Types...');
  const ct = SEED_CONTENT_TYPES.map(({ created_at, default_difficulty, ...rest }) => rest);
  const { error: ctErr } = await supabase.from('content_types').upsert(ct);
  if (ctErr) console.error('Content Types error:', ctErr);

  // 5. Holidays
  console.log('Inserting Holidays...');
  const holidays = SEED_HOLIDAYS.map(h => ({
    date: h.holiday_date,
    description: h.description
  }));
  const { error: holErr } = await supabase.from('holidays').upsert(holidays);
  if (holErr) console.error('Holidays error:', holErr);

  // 6. Tasks
  console.log('Inserting Tasks...');
  // Delete existing tasks to prevent duplicate key error during seeding
  await supabase.from('task_revisions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('motion_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const tasks = SEED_TASKS.map(t => ({
    ...t,
    id: mapTaskId(t.id),
    strat_pic_id: mapUserId(t.strat_pic_id),
    design_pic_id: mapUserId(t.design_pic_id),
    operator_id: mapUserId(t.operator_id),
    created_by: mapUserId(t.created_by)
  }));
  const { error: tasksErr } = await supabase.from('tasks').insert(tasks);
  if (tasksErr) console.error('Tasks error:', tasksErr);

  // 7. Motion Tasks
  console.log('Inserting Motion Tasks...');
  const motionTasks = SEED_MOTION_TASKS.map((m, idx) => ({
    id: `40000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`,
    task_id: mapTaskId(m.task_id || ''),
    motion_pic_id: mapUserId(m.motion_pic_id),
    status_motion: m.status_motion,
    due_date: m.apply_date ? `${m.apply_date}T00:00:00Z` : null,
    submission_date: m.apply_date ? `${m.apply_date}T00:00:00Z` : null,
    motion_revision_count: m.motion_revision_count,
    final_video_link: m.link_motion,
    created_at: m.created_at,
    updated_at: m.updated_at
  }));
  const { error: motionErr } = await supabase.from('motion_tasks').insert(motionTasks);
  if (motionErr) console.error('Motion Tasks error:', motionErr);

  // 8. Revisions
  console.log('Inserting Revisions...');
  const revisions = SEED_REVISIONS.map((r, idx) => ({
    id: `20000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`,
    task_id: mapTaskId(r.task_id),
    stage: r.stage,
    requested_by: mapUserId(r.requested_by),
    revision_notes: r.notes || 'Revision requested',
    status: 'RESOLVED',
    created_at: r.created_at
  }));
  const { error: revErr } = await supabase.from('task_revisions').insert(revisions);
  if (revErr) console.error('Revisions error:', revErr);

  // 9. Audit Logs
  console.log('Inserting Audit Logs...');
  await supabase.from('audit_logs').delete().neq('id', -9999);
  const auditLogs = SEED_AUDIT_LOGS.map(a => ({
    entity_name: a.entity_name,
    entity_id: mapTaskId(a.entity_id || ''),
    action: a.action,
    performed_by: mapUserId(a.performed_by),
    performer_name: a.performer_name,
    before_state: a.before_state,
    after_state: a.after_state,
    timestamp: a.timestamp
  }));
  const { error: auditErr } = await supabase.from('audit_logs').insert(auditLogs);
  if (auditErr) console.error('Audit logs error:', auditErr);

  // 10. Notifications
  console.log('Inserting Notifications...');
  await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const notifs = SEED_NOTIFICATIONS.map((n, idx) => ({
    id: `30000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`,
    user_id: mapUserId(n.user_id),
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    link: n.link,
    created_at: n.created_at
  }));
  const { error: notifErr } = await supabase.from('notifications').insert(notifs);
  if (notifErr) console.error('Notifications error:', notifErr);

  console.log('🎉 ALL 10 TABLES SEEDED SUCCESSFULLY INTO SUPABASE!');
}

seedDatabase().catch(console.error);
