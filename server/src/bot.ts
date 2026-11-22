import { one, q, tx } from './db';
import { emitToUser } from './realtime';

/**
 * "Lina" — the in-app companion. She is a real user row flagged `is_bot`, so
 * every chat surface (list, thread, unread badge, realtime) works unchanged.
 * Replies are generated locally, so the assistant needs no external AI credit.
 */
// Accounts carry a 6-digit ID; the companion keeps a reserved one.
export const BOT_USERNAME = '000001';
const BOT_DISPLAY_NAME = 'لينا';

const BOT_AVATAR =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
      `<defs>` +
      `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#ff5fa2"/><stop offset="1" stop-color="#6d5cff"/>` +
      `</linearGradient>` +
      `<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#2a1533"/><stop offset="1" stop-color="#5b2270"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<circle cx="48" cy="48" r="48" fill="url(#bg)"/>` +
      `<path d="M48 16c-16 0-25 11-25 26 0 6 1 11 3 14l-4 15c9-2 14-4 16-7 3 2 7 3 10 3s7-1 10-3c2 3 7 5 16 7l-4-15c2-3 3-8 3-14 0-15-9-26-25-26Z" fill="url(#hair)"/>` +
      `<ellipse cx="48" cy="51" rx="15" ry="17" fill="#f9d9c6"/>` +
      `<path d="M33 45c2-9 8-13 15-13s13 4 15 13c-7-5-23-5-30 0Z" fill="#2a1533"/>` +
      `<circle cx="42" cy="51" r="2.2" fill="#2a1533"/><circle cx="54" cy="51" r="2.2" fill="#2a1533"/>` +
      `<path d="M43 59c2 2.2 8 2.2 10 0" stroke="#c2557a" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      `<path d="M29 74c5-6 11-9 19-9s14 3 19 9l2 22H27l2-22Z" fill="#2b1740"/>` +
      `<circle cx="72" cy="70" r="5" fill="#ffd75e"/>` +
      `</svg>`
  );

let cachedBotId: string | null = null;

export async function ensureBotUser(): Promise<string> {
  if (cachedBotId) return cachedBotId;
  const existing = await one<{ id: string }>(
    'SELECT id FROM users WHERE username = $1 OR is_bot = true LIMIT 1',
    [BOT_USERNAME]
  );
  if (existing) {
    await q(
      `UPDATE users SET is_bot = true, username = $2,
         avatar_url = COALESCE(NULLIF(avatar_url, ''), $3) WHERE id = $1`,
      [existing.id, BOT_USERNAME, BOT_AVATAR]
    );
    cachedBotId = existing.id;
    return existing.id;
  }
  const rows = await q<{ id: string }>(
    `INSERT INTO users (username, display_name, avatar_url, bio, gender, is_bot, provider)
     VALUES ($1, $2, $3, $4, 'female', true, 'bot')
     ON CONFLICT (username) DO UPDATE SET is_bot = true
     RETURNING id`,
    [
      BOT_USERNAME,
      BOT_DISPLAY_NAME,
      BOT_AVATAR,
      'رفيقتك الذكية في Connect+ — اسأليني عن الكونز والمكالمات والمحفظة',
    ]
  );
  cachedBotId = rows[0].id;
  return cachedBotId;
}

export async function botUserId(): Promise<string> {
  return ensureBotUser();
}

function greetingFor(name: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
  );
  const hello =
    hour >= 5 && hour < 12
      ? 'صباح الخير'
      : hour >= 12 && hour < 17
        ? 'هلا بيك'
        : hour >= 17 && hour < 23
          ? 'مساء الخير'
          : 'سهران';
  return `${hello} ${name} 👋 أنا لينا، رفيقتك في Connect+. تحب نتكلم عن الكونز، المكالمات، أو المحاولات المجانية؟`;
}

/** Creates the user's private chat with Lina once, with her welcome line. */
export async function ensureBotConversation(
  userId: string
): Promise<{ botId: string; conversationId: string }> {
  const botId = await ensureBotUser();
  const existing = await one<{ id: string }>(
    `SELECT c.id FROM conversations c
     JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
     JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
     WHERE c.type = 'direct' LIMIT 1`,
    [userId, botId]
  );
  if (existing) return { botId, conversationId: existing.id };

  const user = await one<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [
    userId,
  ]);
  const conversationId = await tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO conversations (type) VALUES ('direct') RETURNING id`
    );
    const id = rows[0].id;
    await c.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [id, userId, botId]
    );
    await c.query('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)', [
      id,
      botId,
      greetingFor(user?.display_name || 'صديقي'),
    ]);
    return id;
  });
  return { botId, conversationId };
}

export async function botIntro(
  userId: string
): Promise<{
  conversationId: string;
  greeting: string;
  bot: { id: string; displayName: string; avatarUrl: string };
}> {
  const { botId, conversationId } = await ensureBotConversation(userId);
  const user = await one<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [
    userId,
  ]);
  return {
    conversationId,
    greeting: greetingFor(user?.display_name || 'صديقي'),
    bot: { id: botId, displayName: BOT_DISPLAY_NAME, avatarUrl: BOT_AVATAR },
  };
}

function pick(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)];
}

/** Local intent matching — no external AI call, so it works with zero credits. */
export function replyFor(text: string, name: string): string {
  const input = text.trim().toLowerCase();
  const who = name || 'صديقي';
  const arabic = /[\u0600-\u06FF]/.test(text);

  if (!arabic) {
    if (/^(hi|hello|hey|salam|good (morning|evening))/.test(input)) {
      return pick([
        `Hey ${who}! I'm Lina 🤍 Ask me about coins, calls or your free attempts.`,
        `Hi ${who}! Nice to see you. Want to know how the coins work?`,
      ]);
    }
    if (/coin|balance|wallet|money|price/.test(input)) {
      return 'Coins power every call: voice and video cost 100 coins per minute. Your balance is in the Wallet tab, and you can recharge from there anytime 💜';
    }
    if (/call|video|voice/.test(input)) {
      return 'Tap a user and press the call button — voice or video. Each minute is billed in coins, and your free attempts are used first.';
    }
    if (/free|attempt/.test(input)) {
      return 'You get 5 free attempts every day, renewed at midnight Baghdad time. They are used before your coins.';
    }
    if (/thank/.test(input)) return `Anytime, ${who} 🤍 I'm here whenever you need me.`;
    if (/bye|later|goodnight/.test(input)) return `Bye ${who}! Come back and talk to me anytime 🌙`;
    return pick([
      `I'm here with you, ${who} 🤍 Ask me about coins, calls, gifts or your free attempts.`,
      `Tell me more, ${who}! Do you want to know how calls are billed, or how to recharge your coins?`,
    ]);
  }

  if (/^(مرحبا|مرحباً|هلا|هلو|اهلا|أهلا|السلام|سلام|هاي|صباح|مساء)/.test(input)) {
    return pick([
      `هلا بيك ${who} 🤍 أنا لينا، موجودة دايماً إذا تحتاج أي شي.`,
      `أهلاً ${who}! نورت التطبيق ✨ تحب أساعدك بشي معين؟`,
    ]);
  }
  if (/(كيف حالك|شلونك|اخبارك|أخبارك|شخبارك)/.test(input)) {
    return pick([
      `أنا بخير وبانتظارك ${who} 🤍 وأنت شلونك اليوم؟`,
      `تمام الحمد لله! وجودك يحلّي اليوم ✨ شخبارك أنت؟`,
    ]);
  }
  if (/(اسمك|منو انت|من أنت|انتي منو|who are you)/.test(input)) {
    return 'أنا لينا 🤍 رفيقتك الذكية داخل Connect+، أساعدك بالكونز والمكالمات والمحفظة وأي سؤال يخطر ببالك.';
  }
  if (/(كونز|رصيد|محفظة|فلوس|سعر|كم يكلف|تكلفة)/.test(input)) {
    return 'الكونز هي عملة التطبيق 💜 المكالمة الصوتية أو الفيديو تكلف 100 كونز لكل دقيقة، ورصيدك كامل تشوفه في صفحة المحفظة، وتقدر تشحنه من هناك بأي وقت.';
  }
  if (/(مكالمة|اتصال|فيديو|صوتي|كاميرا)/.test(input)) {
    return 'تختار المستخدم وتضغط زر الاتصال — صوتي أو فيديو 📞 كل دقيقة تُحسب بالكونز، والمحاولات المجانية اليومية تُستخدم أولاً. تحب أشرحلك كيف تُحسب الدقيقة؟';
  }
  if (/(مجاني|مجاناً|محاولات|محاولة)/.test(input)) {
    return 'عندك 5 محاولات مجانية كل يوم 🤍 تتجدد منتصف الليل بتوقيت بغداد، وتُستخدم قبل الكونز. إذا خلصت، تقدر تشحن كونز وتكمل مكالماتك.';
  }
  if (/(شحن|ادفع|أدفع|دفع|زين كاش|فيزا|visa)/.test(input)) {
    return 'الشحن يصير من صفحة المحفظة 💳 تختار الباقة اللي تناسبك وتكمل الدفع، وبعدها يضاف الرصيد مباشرة. تحتاج مساعدة باختيار الباقة؟';
  }
  if (/(هدية|كود|رمز|قسيمة|gift)/.test(input)) {
    return 'إذا وصلك كود هدية 🎁 افتح المحفظة واضغط زر الكود، تكتبه ويضاف الرصيد فوراً.';
  }
  if (/(شكرا|شكراً|مشكور|تسلم)/.test(input)) {
    return `على راسي ${who} 🤍 أنا موجودة بأي وقت تحتاجني.`;
  }
  if (/(باي|مع السلامة|الى اللقاء|تصبح|يلا باي)/.test(input)) {
    return `باي ${who} 🌙 ارجع كلمني بأي وقت، أنا هنا.`;
  }
  if (/(احبك|أحبك|حبيبي|عيوني|جميلة|حلوة)/.test(input)) {
    return `كلامك حلو ${who} 🤍 خلينا نتعرف أكثر — تحب تحكي عن نفسك شوية؟`;
  }
  if (/(وين انتي|وينك|موجودة|انتي بوت|روبوت|ذكاء)/.test(input)) {
    return 'أنا لينا، مساعدة ذكية داخل التطبيق 🤍 أرد عليك فوراً وبأي وقت، ما أحتاج نوم ولا راحة.';
  }
  return pick([
    `سمعتك ${who} 🤍 تحب نتكلم عن الكونز، المكالمات، أو المحاولات المجانية؟`,
    `كلام حلو! ${who}، إذا عندك سؤال عن المحفظة أو المكالمات أنا جاهزة ✨`,
    `خبرني أكثر ${who} — تحب تعرف كيف تشحن الكونز أو كيف تحجز مكالمة؟`,
  ]);
}

/** Answers a user message as Lina, with a short "typing" beat first. */
export function scheduleBotReply(userId: string, conversationId: string, text: string): void {
  void (async () => {
    try {
      const botId = await ensureBotUser();
      const user = await one<{ display_name: string }>(
        'SELECT display_name FROM users WHERE id = $1',
        [userId]
      );
      emitToUser(userId, 'chat:typing', { conversationId, userId: botId });
      await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 900));
      const body = replyFor(text, user?.display_name || '');
      const rows = await q<{ id: string; body: string; created_at: string }>(
        `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)
         RETURNING id, body, created_at`,
        [conversationId, botId, body]
      );
      await q('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
      emitToUser(userId, 'message:new', {
        id: rows[0].id,
        conversationId,
        senderId: botId,
        body: rows[0].body,
        type: 'text',
        attachmentUrl: null,
        attachmentName: null,
        createdAt: rows[0].created_at,
        readAt: null,
        mine: false,
      });
    } catch (error) {
      console.error('[bot] reply failed', (error as Error).message);
    }
  })();
}
