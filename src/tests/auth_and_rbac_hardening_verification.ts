import { signSessionToken, verifySessionToken, resolveAuthenticatedUser } from '../lib/server-auth';
import { GET as getApproved } from '../app/api/requests/approved/route';
import { GET as getMotionApproved } from '../app/api/motion/approved/route';
import { GET as getMessages, POST as postMessage, PATCH as patchMessage, DELETE as deleteMessage } from '../app/api/requests/[id]/messages/route';
import { GET as getNotifications } from '../app/api/notifications/route';
import { POST as markNotificationRead } from '../app/api/notifications/read/route';
import { POST as postLogout } from '../app/api/auth/logout/route';
import { getUsers, getAllTasksWithRelations } from '../lib/supabase-store';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (detail) console.error(`     Detail: ${detail}`);
    failed++;
  }
}

async function runAuthHardeningVerification() {
  console.log('====================================================');
  console.log('[AUDIT] RUNNING API AUTHENTICATION & RBAC HARDENING VERIFICATION');
  console.log('====================================================\n');

  const users = await getUsers();
  const adminUser = users.find(u => u.role_name === 'ADMIN') || users[0];
  const designerUser = users.find(u => u.role_name === 'DESIGNER') || users.find(u => u.id !== adminUser.id)!;
  const tasks = await getAllTasksWithRelations();
  const sampleTask = tasks[0] || { id: '00000000-0000-0000-0000-000000000001' };

  console.log(`Test Subject: Admin = ${adminUser.id} (${adminUser.role_name}), Designer = ${designerUser.id} (${designerUser.role_name})`);

  // --------------------------------------------------------------------------
  // Suite 1: HMAC-SHA256 Token Lifecycle & Tamper Resistance
  // --------------------------------------------------------------------------
  console.log('\nSuite 1: HMAC Session Token Integrity & Expiry');
  {
    const validToken = signSessionToken({
      id: adminUser.id,
      email: adminUser.email,
      role_name: adminUser.role_name
    }, 3600);

    const verified = verifySessionToken(validToken);
    assert(Boolean(verified && verified.userId === adminUser.id), 'Valid session token successfully verified');
    assert(verified?.role === adminUser.role_name, 'Verified token payload contains correct role');

    // Tampered payload
    const parts = validToken.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'hacker-001', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const forgedToken = `${tamperedPayload}.${parts[1]}`;
    assert(verifySessionToken(forgedToken) === null, 'Tampered token payload rejected due to signature mismatch');

    // Tampered signature
    const badSigToken = `${parts[0]}.invalidsignature1234567890abcdef`;
    assert(verifySessionToken(badSigToken) === null, 'Token with invalid signature rejected');

    // Expired token
    const expiredToken = signSessionToken({
      id: adminUser.id,
      email: adminUser.email,
      role_name: adminUser.role_name
    }, -60); // Expired 1 minute ago
    assert(verifySessionToken(expiredToken) === null, 'Expired session token rejected');
  }

  // --------------------------------------------------------------------------
  // Suite 2: resolveAuthenticatedUser Security & Anti-Spoofing
  // --------------------------------------------------------------------------
  console.log('\nSuite 2: Server-Side Identity Resolution & Role Authoritativeness');
  {
    // Request with completely fabricated/unknown user ID
    const fakeReq = new Request('http://localhost:3000/api/test', {
      headers: {
        'x-user-id': 'hacker-non-existent-999',
        'x-user-role': 'ADMIN'
      }
    });
    const fakeResolved = await resolveAuthenticatedUser(fakeReq);
    assert(fakeResolved === null, 'Fabricated x-user-id is rejected (returns null)');

    // Request from Designer attempting to spoof ADMIN role via header
    const spoofReq = new Request('http://localhost:3000/api/test', {
      headers: {
        'x-user-id': designerUser.id,
        'x-user-role': 'ADMIN' // Spoofed role!
      }
    });
    const spoofResolved = await resolveAuthenticatedUser(spoofReq);
    assert(Boolean(spoofResolved), 'Legitimate user is recognized');
    assert(spoofResolved?.role_name === designerUser.role_name, 'User role is AUTHORITATIVE from DB (header role spoofing ignored)');
    assert(spoofResolved?.role_name !== 'ADMIN', 'Privilege escalation via x-user-role header is completely blocked');

    // Request with valid session cookie
    const token = signSessionToken({
      id: designerUser.id,
      email: designerUser.email,
      role_name: designerUser.role_name
    });
    const cookieReq = new Request('http://localhost:3000/api/test', {
      headers: {
        'cookie': `cmoms_session=${token}`
      }
    });
    const cookieResolved = await resolveAuthenticatedUser(cookieReq);
    assert(Boolean(cookieResolved && cookieResolved.id === designerUser.id), 'Session cookie authenticated correctly');
  }

  // --------------------------------------------------------------------------
  // Suite 3: /api/requests/approved Endpoint Security
  // --------------------------------------------------------------------------
  console.log('\nSuite 3: /api/requests/approved Hardened Access Control');
  {
    // Unauthenticated
    const resUnauth = await getApproved(new Request('http://localhost:3000/api/requests/approved'));
    assert(resUnauth.status === 401, 'Unauthenticated request returns 401');

    // Bogus credentials
    const resBogus = await getApproved(new Request('http://localhost:3000/api/requests/approved', {
      headers: { 'x-user-id': 'evil-attacker' }
    }));
    assert(resBogus.status === 401, 'Request with bogus x-user-id returns 401');

    // Authenticated via valid session token cookie
    const adminToken = signSessionToken({
      id: adminUser.id,
      email: adminUser.email,
      role_name: adminUser.role_name
    });
    const resAuthCookie = await getApproved(new Request('http://localhost:3000/api/requests/approved', {
      headers: { 'cookie': `cmoms_session=${adminToken}` }
    }));
    assert(resAuthCookie.status === 200, 'Admin with signed session cookie returns 200 OK');
  }

  // --------------------------------------------------------------------------
  // Suite 4: /api/notifications IDOR Protection
  // --------------------------------------------------------------------------
  console.log('\nSuite 4: /api/notifications IDOR Prevention');
  {
    // Unauthenticated
    const resNotifUnauth = await getNotifications(new Request('http://localhost:3000/api/notifications'));
    assert(resNotifUnauth.status === 401, 'Unauthenticated notifications fetch returns 401');

    // Designer attempting to view Admin notifications by spoofing x-user-role: ADMIN
    const resIdorAttack = await getNotifications(new Request(`http://localhost:3000/api/notifications?userId=${adminUser.id}`, {
      headers: {
        'x-user-id': designerUser.id,
        'x-user-role': 'ADMIN' // Attacker claims to be admin
      }
    }));
    assert(resIdorAttack.status === 403, 'Designer attempting to view Admin notifications is BLOCKED with 403 Forbidden despite spoofed role header');

    // Legitimate self-access
    const resLegit = await getNotifications(new Request(`http://localhost:3000/api/notifications?userId=${designerUser.id}`, {
      headers: { 'x-user-id': designerUser.id }
    }));
    assert(resLegit.status === 200, 'User viewing their own notifications returns 200 OK');
  }

  // --------------------------------------------------------------------------
  // Suite 5: /api/requests/[id]/messages Endpoint Hardening
  // --------------------------------------------------------------------------
  console.log('\nSuite 5: /api/requests/[id]/messages Access Control');
  {
    const context = { params: Promise.resolve({ id: sampleTask.id }) };

    // Unauthenticated GET
    const resMsgUnauth = await getMessages(new Request('http://localhost:3000/api/requests/messages'), context);
    assert(resMsgUnauth.status === 401, 'Unauthenticated GET messages returns 401');

    // Unauthenticated POST
    const resPostUnauth = await postMessage(new Request('http://localhost:3000/api/requests/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'Test unauth' })
    }), context);
    assert(resPostUnauth.status === 401, 'Unauthenticated POST message returns 401');

    // POST with fake user
    const resPostFake = await postMessage(new Request('http://localhost:3000/api/requests/messages', {
      method: 'POST',
      headers: { 'x-user-id': 'attacker-fake-99' },
      body: JSON.stringify({ content: 'Spoof attempt' })
    }), context);
    assert(resPostFake.status === 401, 'POST message with fake x-user-id returns 401');
  }

  // --------------------------------------------------------------------------
  // Suite 6: Production Mode Isolation (x-user-id header strictly disabled)
  // --------------------------------------------------------------------------
  console.log('\nSuite 6: Production Mode Strict Security Enforcement');
  {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';

      // Attempting to use x-user-id in production mode
      const prodHeaderReq = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-user-id': adminUser.id,
        }
      });
      const prodResolved = await resolveAuthenticatedUser(prodHeaderReq);
      assert(prodResolved === null, 'In production mode, x-user-id header is STRICTLY DISABLED and returns null');

      // Valid signed token MUST still work in production
      const adminToken = signSessionToken({
        id: adminUser.id,
        email: adminUser.email,
        role_name: adminUser.role_name
      });
      const prodCookieReq = new Request('http://localhost:3000/api/test', {
        headers: {
          'cookie': `cmoms_session=${adminToken}`
        }
      });
      const prodTokenResolved = await resolveAuthenticatedUser(prodCookieReq);
      assert(Boolean(prodTokenResolved && prodTokenResolved.id === adminUser.id), 'In production mode, valid signed session token is accepted');
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  }

  // --------------------------------------------------------------------------
  // Suite 7: Deactivated User Enforcement (is_active === false)
  // --------------------------------------------------------------------------
  console.log('\nSuite 7: Deactivated User Enforcement');
  {
    const allUsers = await getUsers();
    const targetUser = allUsers[allUsers.length - 1]; // Pick last user
    const originalActive = targetUser.is_active;

    try {
      // Temporarily mark user as deactivated in-memory
      targetUser.is_active = false;

      // 1. Deactivated user with validly signed token
      const deactToken = signSessionToken({
        id: targetUser.id,
        email: targetUser.email,
        role_name: targetUser.role_name
      });
      const tokenReq = new Request('http://localhost:3000/api/test', {
        headers: { 'cookie': `cmoms_session=${deactToken}` }
      });
      const resolvedToken = await resolveAuthenticatedUser(tokenReq);
      assert(resolvedToken === null, `Deactivated user (${targetUser.email}) is immediately rejected by token verification`);

      // 2. Deactivated user via x-user-id header in dev/test
      const headerReq = new Request('http://localhost:3000/api/test', {
        headers: { 'x-user-id': targetUser.id }
      });
      const resolvedHeader = await resolveAuthenticatedUser(headerReq);
      assert(resolvedHeader === null, `Deactivated user (${targetUser.email}) is rejected even via header fallback`);
    } finally {
      targetUser.is_active = originalActive;
    }
  }

  // --------------------------------------------------------------------------
  // Suite 8: Logout Cookie Clearing Verification
  // --------------------------------------------------------------------------
  console.log('\nSuite 8: Server-Side Logout Cookie Clearing');
  {
    const logoutRes = await postLogout();
    assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200');
    const setCookieHeader = logoutRes.headers.get('set-cookie') || '';
    assert(setCookieHeader.includes('cmoms_session='), 'Logout response includes set-cookie for cmoms_session');
    assert(setCookieHeader.includes('Max-Age=0') || setCookieHeader.includes('max-age=0'), 'Session cookie is invalidated with Max-Age=0');
    assert(setCookieHeader.includes('HttpOnly') || setCookieHeader.includes('httponly'), 'Cleared cookie maintains HttpOnly attribute');
  }

  // --------------------------------------------------------------------------
  // Suite 9: Query Parameter & Body Spoofing Resistance
  // --------------------------------------------------------------------------
  console.log('\nSuite 9: Query Param and Body Spoofing Resistance');
  {
    // Calling API with ?userId=adminUser.id and no cookie
    const spoofQueryReq = new Request(`http://localhost:3000/api/notifications?userId=${adminUser.id}`);
    const resSpoofQuery = await getNotifications(spoofQueryReq);
    assert(resSpoofQuery.status === 401, 'Request with ?userId= parameter and no session returns 401 Unauthorized');

    // Calling resolveAuthenticatedUser with query param only
    const rawReq = new Request(`http://localhost:3000/api/test?userId=${adminUser.id}`);
    const rawResolved = await resolveAuthenticatedUser(rawReq);
    assert(rawResolved === null, 'resolveAuthenticatedUser returns null for query param ?userId=');
  }

  console.log(`\n====================================================`);
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`====================================================`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Auth & RBAC hardening verification`);
  }
}

runAuthHardeningVerification()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
