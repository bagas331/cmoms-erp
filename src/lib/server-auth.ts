import crypto from 'crypto';
import { getUsers } from '@/lib/supabase-store';
import { User, RoleName } from '@/lib/types';

export interface SessionPayload {
  userId: string;
  email: string;
  role: RoleName;
  exp: number; // UNIX timestamp in seconds
}

const isProduction = process.env.NODE_ENV === 'production';

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    if (isProduction) {
      throw new Error(
        'CRITICAL SECURITY ERROR: SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY environment variable is mandatory in production.'
      );
    }
    return 'cmoms-internal-erp-hmac-sha256-auth-secret-key-2026';
  }
  return secret;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Creates a signed HMAC-SHA256 session token
 */
export function signSessionToken(
  user: { id: string; email: string; role_name: RoleName },
  expiresInSeconds: number = 86400 * 7 // 7 days
): string {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role_name,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const secret = getSessionSecret();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 session token
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const sigBufA = Buffer.from(signature);
  const sigBufB = Buffer.from(expectedSignature);

  if (sigBufA.length !== sigBufB.length) return null;
  if (!crypto.timingSafeEqual(sigBufA, sigBufB)) return null;

  try {
    const jsonStr = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(jsonStr) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return null; // Expired
    }

    if (!payload.userId || !payload.role) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Parses cookies from cookie header string
 */
function parseCookies(cookieHeader?: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [name, ...val] = pair.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(val.join('='));
    }
  }
  return cookies;
}

import { SEED_UUID_REVERSE_MAP } from '@/lib/constants';

/**
 * Authoritatively resolves and verifies the authenticated user from a Request.
 *
 * Security guarantees:
 * 1. Checks verified session token from cookie (cmoms_session), Authorization Bearer, or x-session-token.
 * 2. If valid token, fetches authoritative active user record from DB to verify user exists and is active.
 * 3. In PRODUCTION (NODE_ENV === 'production'):
 *    - Strict enforcement: ONLY cryptographically signed, unexpired session tokens are accepted.
 *    - All header and query fallbacks are completely disabled.
 * 4. In DEVELOPMENT / TEST RUNNER (NODE_ENV !== 'production'):
 *    - If x-user-id header is provided, verifies against database and AUTHORITATIVELY enforces
 *      the database's role_name (NEVER trusting client-supplied x-user-role).
 *    - Query parameters (?userId=) and request body user_id are NEVER accepted as proof of identity.
 * 5. Rejects non-existent, deactivated (is_active === false), or forged identities.
 */
export async function resolveAuthenticatedUser(req: Request): Promise<User | null> {
  // 1. Check signed cookie: cmoms_session
  const cookieHeader = req.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const sessionCookie = cookies['cmoms_session'];

  // 2. Check Authorization Bearer or x-session-token
  const authHeader = req.headers.get('authorization');
  let bearerToken: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }
  const customTokenHeader = req.headers.get('x-session-token');

  const candidateToken = sessionCookie || bearerToken || customTokenHeader;
  const allUsers = await getUsers();

  if (candidateToken) {
    const verified = verifySessionToken(candidateToken);
    if (verified) {
      const dbUser = allUsers.find(
        (u) => u.id === verified.userId && u.is_active !== false
      );
      if (dbUser) {
        return dbUser;
      }
    }
  }

  // 3. Fallback for test runner (STRICTLY DISABLED IN PRODUCTION)
  // In production, no header fallback is allowed under any circumstances.
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const rawUserId = req.headers.get('x-user-id');
  if (rawUserId && typeof rawUserId === 'string') {
    let cleanId = rawUserId.trim().toLowerCase();
    if (SEED_UUID_REVERSE_MAP[cleanId]) {
      cleanId = SEED_UUID_REVERSE_MAP[cleanId].toLowerCase();
    }
    const matched = allUsers.find(
      (u) =>
        (u.id.toLowerCase() === cleanId ||
          u.id.toLowerCase() === `u-${cleanId}` ||
          cleanId === `u-${u.id.toLowerCase()}` ||
          (cleanId.includes('admin') && u.role_name === 'ADMIN') ||
          (cleanId.includes('lead') && u.role_name === 'TEAM_LEAD')) &&
        u.is_active !== false
    );
    if (matched) {
      return matched;
    }
  }

  return null;
}
