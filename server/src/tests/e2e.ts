/**
 * End-to-end verification of the real product flows against a running server.
 *
 *   docker compose exec -T api npx tsx src/tests/e2e.ts
 *
 * It registers two real accounts, drives voice/video calls, exhausts the daily free
 * attempts, checks paid billing (reserve → settle → refund), earnings split, recharge
 * confirmation, withdrawal, chat and ban, then deletes everything it created.
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:4000/api';

let checks = 0;
let failures = 0;

function ok(condition: boolean, label: string, extra?: unknown): void {
  checks += 1;
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures += 1;
    console.error(`  \u2717 ${label}`, extra === undefined ? '' : JSON.stringify(extra));
  }
}

function section(title: string): void {
  console.log(`\n== ${title}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ApiResult<T = any> {
  status: number;
  data: T;
}

async function call<T = any>(
  path: string,
  options: { method?: string; body?: unknown; token?: string; admin?: boolean } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

interface Session {
  token: string;
  id: string;
  email: string;
  password: string;
}

const stamp = Date.now().toString(36);

async function register(tag: string): Promise<Session> {
  const email = `${tag}.${stamp}@connectplus.test`;
  const password = 'Passw0rd!2026';
  const response = await call('/auth/register', {
    method: 'POST',
    body: { email, password, displayName: `Test ${tag}`, username: `${tag}${stamp}`.slice(0, 20) },
  });
  if (response.status !== 201) {
    throw new Error(`register ${tag} failed: ${response.status} ${JSON.stringify(response.data)}`);
  }
  return { token: response.data.token, id: response.data.user.id, email, password };
}

async function me(token: string) {
  const response = await call('/auth/me', { token });
  return response.data;
}

async function invite(token: string, calleeId: string, kind: 'voice' | 'video') {
  return call('/calls', { method: 'POST', token, body: { calleeId, kind } });
}

async function runCall(
  caller: Session,
  callee: Session,
  kind: 'voice' | 'video',
  holdMs = 1200
) {
  const invited = await invite(caller.token, callee.id, kind);
  if (invited.status !== 201) return { invited, accepted: null, ended: null };
  const accepted = await call(`/calls/${invited.data.callId}/accept`, {
    method: 'POST',
    token: callee.token,
  });
  await sleep(holdMs);
  const ended = await call(`/calls/${invited.data.callId}/end`, { method: 'POST', token: caller.token });
  return { invited, accepted, ended };
}

async function main(): Promise<void> {
  section('Health');
  const health = await call('/health');
  ok(health.status === 200 && health.data.ok === true, 'API and database are reachable', health.data);

  section('Accounts');
  const alice = await register('alice');
  const bob = await register('bob');
  ok(Boolean(alice.token && bob.token), 'two real accounts registered');

  const start = await me(alice.token);
  ok(start.freeCalls.remaining === 5 && start.freeCalls.perDay === 5, 'new user starts with 5/5 free attempts', start.freeCalls);
  ok(start.wallet.balance === 0, 'new user wallet starts at 0 coins');
  ok(start.user.id !== bob.id, 'each account gets its own ID');

  const baghdadToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  ok(start.freeCalls.usageDate === baghdadToday, 'free-attempt day is computed in Baghdad time on the server', {
    usageDate: start.freeCalls.usageDate,
    baghdadToday,
  });
  ok(new Date(start.freeCalls.nextResetAt).getUTCHours() === 21, 'renewal is next Baghdad midnight (21:00 UTC)', {
    nextResetAt: start.freeCalls.nextResetAt,
  });

  section('Free call (voice)');
  const freeCall = await runCall(alice, bob, 'voice', 2200);
  ok(freeCall.invited.status === 201 && freeCall.invited.data.freeAvailable === true, 'invite reports a free attempt available');
  ok(freeCall.accepted?.data.isFree === true, 'accepted call is marked free');
  const afterFree = await me(alice.token);
  ok(afterFree.freeCalls.remaining === 4 && afterFree.freeCalls.used === 1, 'exactly one attempt consumed', afterFree.freeCalls);
  ok(afterFree.wallet.balance === 0, 'free call deducts no coins');
  ok(freeCall.ended?.data.call.coinsCharged === 0, 'free call is charged 0 coins');
  const bobAfterFree = await me(bob.token);
  ok(bobAfterFree.wallet.earned === 0, 'free call produces no earnings for the receiver');

  section('Rejected and cancelled calls never consume an attempt');
  const rejectedInvite = await invite(alice.token, bob.id, 'video');
  await call(`/calls/${rejectedInvite.data.callId}/reject`, { method: 'POST', token: bob.token });
  const afterReject = await me(alice.token);
  ok(afterReject.freeCalls.remaining === 4, 'rejected call does not consume a free attempt', afterReject.freeCalls);
  ok(afterReject.wallet.balance === 0, 'rejected call charges nothing');

  const cancelledInvite = await invite(alice.token, bob.id, 'voice');
  await call(`/calls/${cancelledInvite.data.callId}/cancel`, { method: 'POST', token: alice.token });
  const afterCancel = await me(alice.token);
  ok(afterCancel.freeCalls.remaining === 4, 'unanswered/cancelled call does not consume an attempt');

  section('Exhaust the remaining free attempts');
  for (let index = 0; index < 4; index += 1) {
    await runCall(alice, bob, index % 2 === 0 ? 'video' : 'voice', 900);
  }
  const exhausted = await me(alice.token);
  ok(exhausted.freeCalls.remaining === 0 && exhausted.freeCalls.used === 5, 'all 5 shared attempts consumed by voice+video', exhausted.freeCalls);
  ok(exhausted.wallet.balance === 0, 'no coins were spent on free calls');

  section('Paid call is blocked without coins');
  const blocked = await invite(alice.token, bob.id, 'voice');
  ok(blocked.status === 402, 'caller without coins gets 402', blocked.data);
  ok(blocked.data.code === 'insufficient_coins', 'error code is insufficient_coins');

  section('Admin authentication and top-up');
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.log('  ! ADMIN_PASSWORD not present — skipping admin-only checks');
  } else {
    const adminLogin = await call('/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: adminPassword },
    });
    ok(adminLogin.status === 200 && Boolean(adminLogin.data.token), 'admin signs in with the configured password');
    const adminToken: string = adminLogin.data.token;

    const topUp = await call(`/admin/users/${alice.id}/coins`, {
      method: 'POST',
      token: adminToken,
      body: { amount: 500, note: 'e2e top-up' },
    });
    ok(topUp.status === 200 && topUp.data.balance === 500, 'admin credits 500 coins', topUp.data);

    const ledger = await call('/wallet', { token: alice.token });
    ok(
      ledger.data.transactions.some((entry: any) => entry.type === 'admin_adjust' && entry.amount === 500),
      'top-up is written to the wallet ledger'
    );

    section('Paid call: reserve, settle, refund, earnings split');
    const paid = await runCall(alice, bob, 'video', 3200);
    ok(paid.invited.data.freeAvailable === false, 'invite now reports a paid call');
    ok(paid.accepted?.data.isFree === false, 'accepted call is paid');
    ok(paid.accepted?.data.balance === 400, 'one minute (100 coins) reserved on accept', paid.accepted?.data);

    const duration = paid.ended?.data.call.durationSeconds ?? 0;
    const expectedCharge = Math.min(100, Math.ceil((duration * 100) / 60));
    const expectedHost = Math.floor((expectedCharge * 50) / 100);
    ok(duration >= 3, 'call duration measured on the server', { duration });
    ok(paid.ended?.data.call.coinsCharged === expectedCharge, 'charge is pro-rata for elapsed seconds', {
      charged: paid.ended?.data.call.coinsCharged,
      expectedCharge,
    });
    ok(
      paid.ended?.data.call.coinsRefunded === 100 - expectedCharge,
      'unused part of the reservation is refunded',
      { refunded: paid.ended?.data.call.coinsRefunded }
    );
    const alicePaid = await me(alice.token);
    ok(alicePaid.wallet.balance === 500 - expectedCharge, 'caller balance equals 500 - charge', alicePaid.wallet);
    ok(alicePaid.wallet.reserved === 0, 'no coins stay reserved after the call');
    const bobPaid = await me(bob.token);
    ok(bobPaid.wallet.earned === expectedHost, 'receiver earns 50% of the charge', {
      earned: bobPaid.wallet.earned,
      expectedHost,
    });
    ok(bobPaid.wallet.balance === expectedHost, 'receiver coins are credited to the wallet');
    ok(bobPaid.wallet.spent === 0, 'receiver is never charged for the call');

    section('Insufficient balance ends the call automatically');
    const before = await me(alice.token);
    await call(`/admin/users/${alice.id}/coins`, {
      method: 'POST',
      token: adminToken,
      body: { amount: 100 - before.wallet.balance, note: 'set balance to 100' },
    });
    const invited = await invite(alice.token, bob.id, 'voice');
    const accepted = await call(`/calls/${invited.data.callId}/accept`, {
      method: 'POST',
      token: bob.token,
    });
    ok(accepted.status === 200 && accepted.data.balance === 0, 'exactly one minute reserved, balance now 0');
    let endedRecord: any = null;
    for (let index = 0; index < 75; index += 1) {
      await sleep(1000);
      const history = await call('/calls/history?limit=1', { token: alice.token });
      const latest = history.data.calls?.[0];
      if (latest && latest.status === 'ended') {
        endedRecord = latest;
        break;
      }
    }
    ok(endedRecord?.endReason === 'insufficient_balance', 'call auto-ends when the next minute cannot be reserved', endedRecord?.endReason);
    ok(endedRecord?.coinsCharged === 100, 'exactly one minute charged before auto-end', endedRecord?.coinsCharged);
    ok(endedRecord?.coinsRefunded === 0, 'nothing to refund when the minute was used');

    section('Recharge order and server-side confirmation');
    const packages = await call('/wallet/packages', { token: alice.token });
    const pack = packages.data.packages[0];
    const order = await call('/wallet/orders', {
      method: 'POST',
      token: alice.token,
      body: { packageId: pack.id, currency: 'IQD', provider: 'manual' },
    });
    ok(order.status === 201 && order.data.order.status === 'pending', 'order is created pending');
    await call(`/wallet/orders/${order.data.order.id}/mark-paid`, {
      method: 'POST',
      token: alice.token,
      body: { note: 'paid via transfer' },
    });
    const balanceBeforeConfirm = (await me(alice.token)).wallet.balance;
    ok(balanceBeforeConfirm === 0, 'balance does not change before confirmation');

    const confirm = await call(`/admin/orders/${order.data.order.id}/confirm`, {
      method: 'POST',
      token: adminToken,
      body: { providerRef: 'e2e-ref' },
    });
    ok(confirm.status === 200 && confirm.data.credited === true, 'admin confirmation credits the coins');
    const afterConfirm = await me(alice.token);
    ok(afterConfirm.wallet.balance === balanceBeforeConfirm + pack.totalCoins, 'exact package coins added', {
      balance: afterConfirm.wallet.balance,
      expected: balanceBeforeConfirm + pack.totalCoins,
    });

    const doubleConfirm = await call(`/admin/orders/${order.data.order.id}/confirm`, {
      method: 'POST',
      token: adminToken,
      body: { providerRef: 'e2e-ref' },
    });
    ok(doubleConfirm.data.credited === false, 'a repeated confirmation is ignored');
    ok((await me(alice.token)).wallet.balance === afterConfirm.wallet.balance, 'no double credit');

    section('Withdrawal request and rejection refund');
    await call(`/admin/users/${alice.id}/coins`, {
      method: 'POST',
      token: adminToken,
      body: { amount: 2000, note: 'e2e withdrawal float' },
    });
    const beforeWithdraw = (await me(alice.token)).wallet.balance;
    const tooSmall = await call('/wallet/withdrawals', {
      method: 'POST',
      token: alice.token,
      body: { coins: 10 },
    });
    ok(tooSmall.status === 400, 'withdrawal below the minimum is rejected');

    const withdrawal = await call('/wallet/withdrawals', {
      method: 'POST',
      token: alice.token,
      body: { coins: 1000 },
    });
    ok(withdrawal.status === 201, 'withdrawal request created');
    ok((await me(alice.token)).wallet.balance === beforeWithdraw - 1000, 'coins are held on request');

    const reject = await call(`/admin/withdrawals/${withdrawal.data.withdrawal.id}/reject`, {
      method: 'POST',
      token: adminToken,
      body: { note: 'e2e reject' },
    });
    ok(reject.status === 200, 'admin rejects the withdrawal');
    ok((await me(alice.token)).wallet.balance === beforeWithdraw, 'rejected withdrawal refunds the coins');

    section('Concurrent call protection');
    await call(`/admin/users/${alice.id}/coins`, {
      method: 'POST',
      token: adminToken,
      body: { amount: 300, note: 'e2e concurrency float' },
    });
    const first = await invite(alice.token, bob.id, 'voice');
    await call(`/calls/${first.data.callId}/accept`, { method: 'POST', token: bob.token });
    const second = await invite(bob.token, alice.id, 'video');
    ok(second.status === 409, 'a user already on a call cannot be called', second.data);
    await call(`/calls/${first.data.callId}/end`, { method: 'POST', token: alice.token });

    section('Chat: send, receive, read receipt');
    const conversation = await call('/chat/conversations', {
      method: 'POST',
      token: alice.token,
      body: { userId: bob.id },
    });
    ok(conversation.status === 201 || conversation.status === 200, 'direct conversation created');
    const conversationId = conversation.data.conversationId;
    const sent = await call(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: alice.token,
      body: { body: 'hello from the e2e suite', type: 'text' },
    });
    ok(sent.status === 201 && sent.data.message.body.includes('e2e'), 'message stored');
    const bobMessages = await call(`/chat/conversations/${conversationId}/messages`, { token: bob.token });
    ok(
      bobMessages.data.messages.some((message: any) => message.id === sent.data.message.id),
      'receiver can read the message'
    );
    const read = await call(`/chat/conversations/${conversationId}/read`, {
      method: 'POST',
      token: bob.token,
    });
    ok(read.data.read >= 1, 'receiver marks it read');
    const aliceMessages = await call(`/chat/conversations/${conversationId}/messages`, { token: alice.token });
    const stored = aliceMessages.data.messages.find((message: any) => message.id === sent.data.message.id);
    ok(Boolean(stored?.readAt), 'sender sees the read receipt');

    section('Ban blocks access');
    await call(`/admin/users/${bob.id}/ban`, {
      method: 'POST',
      token: adminToken,
      body: { reason: 'e2e' },
    });
    const bannedMe = await call('/auth/me', { token: bob.token });
    ok(bannedMe.status === 403, 'banned account cannot use the API', bannedMe.status);
    await call(`/admin/users/${bob.id}/unban`, { method: 'POST', token: adminToken, body: {} });
    ok((await call('/auth/me', { token: bob.token })).status === 200, 'unbanned account works again');

    section('Admin statistics');
    const overview = await call('/admin/overview', { token: adminToken });
    ok(overview.status === 200 && overview.data.stats.calls_today > 0, 'overview reports today calls', overview.data.stats?.calls_today);
    ok(overview.data.stats.coins_today > 0, 'overview reports consumed coins');
    ok(overview.data.stats.admin_profit_today > 0, 'overview reports admin profit');
    const freeReport = await call('/admin/free-calls', { token: adminToken });
    ok(freeReport.data.totals.used >= 5, 'free-attempt usage is reported to admin', freeReport.data.totals);
  }

  section('Cleanup (deletes the two test accounts)');
  const deleteAlice = await call('/auth/me', { method: 'DELETE', token: alice.token, body: { password: alice.password } });
  const deleteBob = await call('/auth/me', { method: 'DELETE', token: bob.token, body: { password: bob.password } });
  ok(deleteAlice.status === 200 && deleteBob.status === 200, 'test accounts deleted');
  const loginAfterDelete = await call('/auth/login', {
    method: 'POST',
    body: { identifier: alice.email, password: alice.password },
  });
  ok(loginAfterDelete.status === 401, 'deleted account can no longer sign in');

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error('\nE2E run crashed:', error);
  process.exit(1);
});
