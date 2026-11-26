// WhatsApp Embedded Signup: restoran u panelu klikne "Spoji WhatsApp", prođe Metin prozor,
// a mi dobijemo WABA ID, ID broja i jednokratni kod koji mijenjamo za token restorana.
import { randomInt } from 'node:crypto';
import type { Db } from '../db.js';
import type { Deps } from '../deps.js';
import { AppError, type Restaurant } from './types.js';

export async function connectWhatsApp(
  db: Db, deps: Deps, r: Restaurant, input: { code: string; wabaId: string; phoneNumberId: string },
) {
  if (!deps.meta) throw new AppError(503, 'meta_disabled', 'WhatsApp spajanje nije podešeno na serveru (META_APP_ID / META_APP_SECRET)');
  if (!input.code || !/^\d+$/.test(input.wabaId ?? '') || !/^\d+$/.test(input.phoneNumberId ?? ''))
    throw new AppError(400, 'bad_input', 'Nedostaju podaci iz Meta prozora');
  const token = await deps.meta.exchangeCode(input.code);
  await deps.meta.subscribeApp(input.wabaId, token);
  // PIN za dvostupanjsku provjeru broja; restoran ga ne treba znati za normalan rad
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await deps.meta.registerNumber(input.phoneNumberId, token, pin);
  await db.query(
    `update restaurants set whatsapp_phone_number_id = $2, whatsapp_waba_id = $3, whatsapp_token = $4 where id = $1`,
    [r.id, input.phoneNumberId, input.wabaId, token],
  );
  return { connected: true, phoneNumberId: input.phoneNumberId };
}
