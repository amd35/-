import crypto from 'node:crypto';
import { q } from './db';

/**
 * Firebase Cloud Messaging (HTTP v1) sender.
 *
 * Configured entirely through environment secrets — nothing is baked into the
 * repo:
 *   FCM_SERVICE_ACCOUNT_JSON : the service-account JSON (project_id, client_email, private_key)
 *   FCM_PROJECT_ID           : optional override of the project id inside that JSON
 *
 * Without them the app keeps working: announcements are still delivered live
 * over the websocket and stored in the database, and `pushConfigured()` reports
 * false so the admin panel can say push needs the FCM keys.
 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    const projectId = process.env.FCM_PROJECT_ID || parsed.project_id;
    if (!projectId || !parsed.client_email || !parsed.private_key) return null;
    return {
      project_id: projectId,
      client_email: parsed.client_email,
      private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
      token_uri: parsed.token_uri,
    };
  } catch {
    console.error('[push] FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }
}

export function pushConfigured(): boolean {
  return serviceAccount() !== null;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key, 'base64url');
  const assertion = `${header}.${claim}.${signature}`;

  const response = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`FCM auth failed (${response.status})`);
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('FCM auth returned no access token');
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends one notification to every registered device of the given users.
 * Tokens FCM reports as gone are deleted so they stop being retried.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ configured: boolean; sent: number; failed: number; devices: number }> {
  const sa = serviceAccount();
  if (!sa || userIds.length === 0) {
    return { configured: Boolean(sa), sent: 0, failed: 0, devices: 0 };
  }
  const tokens = await q<{ token: string }>(
    'SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[])',
    [userIds]
  );
  if (tokens.length === 0) return { configured: true, sent: 0, failed: 0, devices: 0 };

  let sent = 0;
  let failed = 0;
  try {
    const token = await accessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    for (const row of tokens) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: { title: payload.title, body: payload.body },
            data: payload.data ?? {},
            android: { priority: 'high', notification: { channel_id: 'announcements' } },
          },
        }),
      });
      if (response.ok) {
        sent += 1;
        continue;
      }
      failed += 1;
      const text = await response.text().catch(() => '');
      if (response.status === 404 || /UNREGISTERED|NOT_FOUND/.test(text)) {
        await q('DELETE FROM push_tokens WHERE token = $1', [row.token]).catch(() => undefined);
      } else {
        console.error('[push] send failed', response.status, text.slice(0, 200));
      }
    }
  } catch (error) {
    console.error('[push] dispatch failed', (error as Error).message);
    return { configured: true, sent, failed: tokens.length - sent, devices: tokens.length };
  }
  return { configured: true, sent, failed, devices: tokens.length };
}
