import type { Db } from '../db.js';
import { SendError, type Deps } from '../deps.js';
import { fmtDate, lang, renderMessage, renderSms, WHATSAPP_TEMPLATES, type MessageData, type MessageKind } from './messages.js';
import { smsBlocked, smsSender } from './sms.js';
import type { Restaurant } from './types.js';

export interface GuestContact {
  name: string; phone: string | null; email: string | null; language: string;
  /** false = broj nije na WhatsAppu (ide odmah SMS) */
  whatsapp_ok?: boolean | null;
}
export type Channel = 'whatsapp' | 'sms' | 'email';

/** Čekanje prije ponovnog pokušaja, u minutama, nakon 1., 2., 3. i 4. neuspjeha. */
const BACKOFF_MIN = [1, 5, 15, 60];
const MAX_ATTEMPTS = 5;
/** WhatsApp koji ne prođe ni iz drugog puta ide SMS-om: link za karticu vrijedi samo 30 minuta. */
const SMS_FALLBACK_AFTER = 2;

/** Upit za recenziju ne ide SMS-om gostu koji ga ionako dobije emailom: SMS se plaća. */
function smsWorthIt(kind: MessageKind, guest: GuestContact) {
  return !(kind === 'review_request' && guest.email);
}

/**
 * Upisuje poruke u outbox (šalju se iz schedulera).
 * Mobitel: WhatsApp ako ga restoran ima i broj nije poznat kao "bez WhatsAppa", inače SMS ako je restoranu uključen.
 * Email uvijek kad ga gost ima. Vraća kanale na koje poruka ide; prazan niz = gostu se nema kamo poslati.
 */
export async function enqueueGuestMessage(
  db: Db, r: Restaurant,
  opts: { reservationId: number | null; guest: GuestContact; kind: MessageKind; data: MessageData; sendAfter?: Date; sms?: boolean },
): Promise<Channel[]> {
  const { guest, kind, data } = opts;
  const sendAfter = opts.sendAfter ?? new Date(0);
  const channels: Channel[] = [];
  const msg = renderMessage(kind, guest.language, data);
  const sms = opts.sms && smsWorthIt(kind, guest) ? renderSms(kind, guest.language, data) : null;
  const insert = (channel: Channel, recipient: string, payload: unknown) => db.query(
    `insert into outbox (restaurant_id, reservation_id, channel, recipient, kind, payload, send_after) values ($1,$2,$3,$4,$5,$6,$7)`,
    [r.id, opts.reservationId, channel, recipient, kind, JSON.stringify(payload), sendAfter],
  );

  if (guest.phone && r.whatsapp_phone_number_id && guest.whatsapp_ok !== false) {
    // link koji ta poruka treba: potvrda vodi na izmjenu/otkaz, ne na recenziju
    const url = (kind === 'guarantee_link' ? data.guaranteeUrl : kind === 'review_request' ? data.reviewUrl : data.manageUrl) ?? data.manageUrl ?? '';
    await insert('whatsapp', guest.phone, {
      template: WHATSAPP_TEMPLATES[kind],
      language: guest.language,
      params: [data.guestName, data.restaurantName, fmtDate(data.date, lang(guest.language)), data.time, String(data.partySize), data.code, url],
      fallbackText: msg.text,
      sms, // ako WhatsApp ne prođe
    });
    channels.push('whatsapp');
  } else if (guest.phone && sms && !(await smsBlocked(db, r, guest.phone))) {
    await insert('sms', guest.phone, { text: sms });
    channels.push('sms');
  }
  if (guest.email) {
    await insert('email', guest.email, msg);
    channels.push('email');
  }
  return channels;
}

/**
 * Rezervni SMS za WhatsApp poruku koja nije prošla. Vraća true ako je SMS upisan.
 * Ne šalje se ako je termin već prošao (osim upita za recenziju), ako SMS nije uključen ili je limit potrošen.
 */
export async function smsFallback(db: Db, deps: Deps, r: Restaurant, m: any): Promise<boolean> {
  const text = m.payload?.sms;
  if (!text || !deps.transport.sendSms || (await smsBlocked(db, r, m.recipient))) return false;
  if (m.reservation_id && m.kind !== 'review_request') {
    const res = (await db.query('select start_at from reservations where id = $1', [m.reservation_id])).rows[0];
    if (res && new Date(res.start_at).getTime() <= deps.now().getTime()) return false;
  }
  const { rows } = await db.query(
    `insert into outbox (restaurant_id, reservation_id, channel, recipient, kind, payload, fallback_for, send_after)
     values ($1,$2,'sms',$3,$4,$5,$6,$7)
     on conflict (fallback_for) where fallback_for is not null do nothing returning id`,
    [r.id, m.reservation_id, m.recipient, m.kind, JSON.stringify({ text }), m.id, deps.now()],
  );
  return rows.length > 0;
}

/** Šalje dospjele poruke. Neuspjele pokušava ponovno s razmakom; WhatsApp koji ne prolazi zamijeni SMS-om. Vraća broj poslanih. */
export async function processOutbox(db: Db, deps: Deps, limit = 50): Promise<number> {
  const now = deps.now();
  const { rows } = await db.query<any>(
    `select o.*, r.whatsapp_phone_number_id, r.instagram_account_id, r.email as restaurant_email
       from outbox o join restaurants r on r.id = o.restaurant_id
      where o.sent_at is null and o.failed_at is null and o.send_after <= $1 and o.attempts < $3
      order by o.id limit $2`,
    [now, limit, MAX_ATTEMPTS],
  );
  let sent = 0;
  for (const m of rows) {
    try {
      const p = m.payload;
      let providerId: string | null = null;
      if (m.channel === 'email') {
        await deps.transport.sendEmail({ to: m.recipient, subject: p.subject, text: p.text, replyTo: m.restaurant_email });
      } else if (m.channel === 'whatsapp') {
        providerId = await deps.transport.sendWhatsApp({
          phoneNumberId: m.whatsapp_phone_number_id,
          to: m.recipient,
          body: p.template
            ? { type: 'template', name: p.template, language: p.language, params: p.params }
            : { type: 'text', text: p.text },
        });
      } else if (m.channel === 'sms') {
        if (!deps.transport.sendSms) throw new SendError('SMS nije podešen na serveru (INFOBIP_API_KEY)', true);
        const r = (await db.query<Restaurant>('select * from restaurants where id = $1', [m.restaurant_id])).rows[0];
        providerId = await deps.transport.sendSms({ to: m.recipient, from: smsSender(r, deps.config.smsSenderOverride), text: p.text });
      } else if (m.channel === 'instagram') {
        await deps.transport.sendInstagram({ igAccountId: m.instagram_account_id, recipientId: m.recipient, text: p.text });
      }
      await db.query('update outbox set sent_at = $2, attempts = attempts + 1, provider_id = $3 where id = $1', [m.id, now, providerId]);
      sent++;
    } catch (e: any) {
      await failed(db, deps, m, e, now);
    }
  }
  return sent;
}

async function failed(db: Db, deps: Deps, m: any, e: any, now: Date) {
  const attempts = m.attempts + 1;
  const permanent = e instanceof SendError && e.permanent;
  let giveUp = permanent || attempts >= MAX_ATTEMPTS;
  if (m.channel === 'whatsapp') {
    if (e instanceof SendError && e.code === '131026')
      await db.query('update guests set whatsapp_ok = false where restaurant_id = $1 and phone = $2', [m.restaurant_id, m.recipient]);
    if (giveUp || attempts >= SMS_FALLBACK_AFTER) {
      const r = (await db.query<Restaurant>('select * from restaurants where id = $1', [m.restaurant_id])).rows[0];
      if (await smsFallback(db, deps, r, m)) giveUp = true; // SMS preuzima, WhatsApp se više ne pokušava
    }
  }
  const retryAt = new Date(now.getTime() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000);
  await db.query(
    'update outbox set attempts = $2, last_error = $3, failed_at = $4, send_after = $5 where id = $1',
    [m.id, attempts, String(e?.message ?? e).slice(0, 1000), giveUp ? now : null, giveUp ? m.send_after : retryAt],
  );
  if (giveUp) console.error(`[outbox] odustajem od ${m.channel} #${m.id}:`, String(e?.message ?? e).slice(0, 300));
}

/**
 * Status WhatsApp poruke iz Meta webhooka: dostavljeno = broj ima WhatsApp; neuspjelo = rezervni SMS.
 * Meta greške javlja i ovdje, ne samo pri slanju (npr. 131026 za broj bez WhatsAppa).
 */
export async function onWhatsAppStatus(
  db: Db, deps: Deps, r: Restaurant,
  st: { id?: string; status?: string; recipient_id?: string; errors?: { code?: number }[] },
) {
  if (!st.id || !st.status) return;
  const m = (await db.query<any>(
    `update outbox set delivery_status = $3 where restaurant_id = $1 and channel = 'whatsapp' and provider_id = $2 returning *`,
    [r.id, st.id, st.status],
  )).rows[0];
  if (!m) return;
  if (st.status === 'delivered' || st.status === 'read') {
    await db.query('update guests set whatsapp_ok = true where restaurant_id = $1 and phone = $2', [r.id, m.recipient]);
  } else if (st.status === 'failed') {
    if (st.errors?.some((x) => x.code === 131026))
      await db.query('update guests set whatsapp_ok = false where restaurant_id = $1 and phone = $2', [r.id, m.recipient]);
    await smsFallback(db, deps, r, m);
  }
}
