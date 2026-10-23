import { createHmac, timingSafeEqual } from 'node:crypto';

const reply = (body, status = 200) => new Response(body, {
  status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});
const equal = (a, b) => {
  const left = Buffer.from(a ?? '');
  const right = Buffer.from(b ?? '');
  return left.length === right.length && timingSafeEqual(left, right);
};
const profile = async (id, token) => {
  if (!token) return {};
  const url = new URL(`https://graph.instagram.com/v26.0/${encodeURIComponent(id)}`);
  url.searchParams.set('fields', 'id,username,name');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return {};
  const data = await response.json();
  return { username: data.username, name: data.name };
};

// Notification receiver only. Message bodies remain in Instagram;
// this endpoint does not store conversations or send automated replies.
export default {
  async fetch(request) {
    const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    if (!verifyToken || !appSecret || !accountId) return reply('Not configured', 503);
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const challenge = url.searchParams.get('hub.challenge');
      if (url.searchParams.get('hub.mode') !== 'subscribe' || !challenge ||
          !equal(url.searchParams.get('hub.verify_token'), verifyToken)) return reply('Forbidden', 403);
      console.info(JSON.stringify({ event: 'instagram_webhook_verified' }));
      return reply(challenge);
    }
    if (request.method !== 'POST') return reply('Method not allowed', 405);
    const signature = request.headers.get('x-hub-signature-256') ?? '';
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return reply('Invalid signature', 401);
    // Limit the raw body before authentication and JSON parsing.
    const reader = request.body?.getReader();
    if (!reader) return reply('Missing body', 400);
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); return reply('Too large', 413); }
      chunks.push(Buffer.from(value));
    }
    const raw = Buffer.concat(chunks);
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
    if (!equal(signature.toLowerCase(), expected)) return reply('Invalid signature', 401);
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); }
    catch { return reply('Invalid JSON', 400); }
    if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return reply('Invalid event', 400);
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const crmUrl = process.env.CRM_INGEST_URL;
    const crmSecret = process.env.CRM_WEBHOOK_SECRET;
    const accepted = [];
    let changes = 0;
    for (const entry of payload.entry) {
      if (String(entry?.id) !== accountId) continue;
      changes += Array.isArray(entry.changes) ? entry.changes.length : 0;
      for (const event of entry.messaging ?? []) {
        const message = event?.message;
        if (!message?.mid || message?.is_deleted) continue;
        const incoming = String(event?.recipient?.id) === accountId;
        if (!incoming) continue;
        const contactId = String(incoming ? event?.sender?.id ?? '' : event?.recipient?.id ?? '');
        if (!contactId || contactId === accountId) continue;
        const person = await profile(contactId, accessToken);
        const attachment = Array.isArray(message.attachments) ? message.attachments[0]?.type : null;
        accepted.push({
          message_id: String(message.mid), instagram_scoped_user_id: contactId,
          username: person.username || null, name: person.name || null,
          direction: 'incoming', text: String(message.text ?? ''),
          attachment_type: attachment ? String(attachment).slice(0, 30) : null,
          sent_at: new Date(Number(event.timestamp) || Date.now()).toISOString(),
        });
      }
    }
    if (accepted.length) {
      if (!accessToken || !crmUrl || !crmSecret) return reply('Forwarding not configured', 503);
      const forwarded = await fetch(crmUrl, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: {'content-type':'application/json','x-instagram-webhook-secret':crmSecret},
        body: JSON.stringify({messages: accepted}) });
      if (!forwarded.ok) return reply('CRM unavailable', 503);
    }
    // Do not log message content, sender IDs, access tokens or request URLs.
    console.info(JSON.stringify({ event: 'instagram_webhook_received', messages: accepted.length, changes }));
    return reply('EVENT_RECEIVED');
  },
};
