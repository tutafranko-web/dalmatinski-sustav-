// SMS: priprema teksta (GSM-7, broj dijelova) i zaštita od troška (samo mobiteli, dopuštene zemlje, dnevni limit).
import type { Db } from '../db.js';
import type { Restaurant } from './types.js';

/**
 * Zemlje u koje se smije slati SMS. Javni obrazac za rezervaciju može upisati bilo koji broj,
 * pa bez popisa netko može slati poruke na skupe brojeve na naš račun (SMS pumping).
 * +1 namjerno nije tu: obuhvaća i karipske države koje su česta meta prijevara, a SAD ionako ne prima alfanumeričkog pošiljatelja.
 */
export const SMS_DEFAULT_PREFIXES = [
  '+385', '+386', '+387', '+381', '+382', '+389', '+355', // HR i susjedi
  '+43', '+49', '+41', '+39', '+33', '+34', '+351', '+31', '+32', '+352', '+44', '+353',
  '+45', '+46', '+47', '+358', '+354', '+48', '+420', '+421', '+36', '+40', '+359', '+30', '+357', '+356', '+370', '+371', '+372',
];
export const SMS_PER_RECIPIENT_DAILY = 5;

/** Hrvatski broj mora biti mobitel (09x); fiksni broj ne prima SMS. Za strane brojeve to ne znamo pa pokušavamo. */
export function isMobile(phone: string): boolean {
  return phone.startsWith('+385') ? /^\+3859\d{7,8}$/.test(phone) : true;
}

/** Vraća razlog zašto se SMS ne šalje, ili null ako smije. */
export async function smsBlocked(db: Db, r: Restaurant, phone: string, prefixes = SMS_DEFAULT_PREFIXES): Promise<string | null> {
  if (r.sms_mode !== 'fallback') return 'sms_off';
  if (!isMobile(phone)) return 'not_mobile';
  if (!prefixes.some((p) => phone.startsWith(p))) return 'country_not_allowed';
  const { rows } = await db.query<{ total: number; same: number }>(
    `select count(*)::int as total, count(*) filter (where recipient = $2)::int as same from outbox
      where restaurant_id = $1 and channel = 'sms' and created_at > now() - interval '1 day'`,
    [r.id, phone],
  );
  if (rows[0].total >= r.sms_daily_limit) return 'daily_limit';
  if (rows[0].same >= SMS_PER_RECIPIENT_DAILY) return 'recipient_limit';
  return null;
}

// GSM-7: osnovni skup + proširenje (znakovi iz proširenja broje se dvostruko)
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';
const REPLACE: Record<string, string> = {
  'č': 'c', 'ć': 'c', 'š': 's', 'ž': 'z', 'đ': 'dj', 'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Ž': 'Z', 'Đ': 'Dj',
  '–': '-', '—': '-', '‘': "'", '’': "'", '„': '"', '“': '"', '”': '"', '…': '...', '·': '-', ' ': ' ',
};

/**
 * Tekst u GSM-7: č, ć, š, ž i đ bi inače cijelu poruku prebacili u Unicode (70 umjesto 160 znakova po dijelu, 2–3 puta skuplje).
 * Njemački ä ö ü ß su u GSM-7 i ostaju.
 */
export function toGsm7(text: string): string {
  let out = '';
  for (const ch of text) {
    if (GSM_BASIC.includes(ch) || GSM_EXT.includes(ch)) { out += ch; continue; }
    if (REPLACE[ch] !== undefined) { out += REPLACE[ch]; continue; }
    const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += [...plain].every((c) => GSM_BASIC.includes(c)) ? plain : '?';
  }
  return out;
}

/** Broj SMS dijelova za GSM-7 tekst (160 znakova jedan, 153 po dijelu kad ih je više). */
export function smsSegments(gsmText: string): number {
  let len = 0;
  for (const ch of gsmText) len += GSM_EXT.includes(ch) ? 2 : 1;
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

/** Ime pošiljatelja: do 11 slova i brojki (alfanumerički pošiljatelj). */
export function smsSender(r: Pick<Restaurant, 'sms_sender' | 'name'>, override?: string): string {
  if (override) return override;
  if (r.sms_sender) return r.sms_sender;
  return toGsm7(r.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'Restoran';
}
