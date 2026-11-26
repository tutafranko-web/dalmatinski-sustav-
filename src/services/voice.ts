// AI telefon: JEDAN Retell agent služi sve restorane. Restoran se prepoznaje po broju koji je gost nazvao (call.to_number).
import type { Db } from '../db.js';
import { normalizePhone } from './reservations.js';
import { AppError, isServiceActive, type Restaurant } from './types.js';
import { TOOL_DEFINITIONS } from '../ai/tools.js';

export async function restaurantByVoiceNumber(db: Db, toNumber: string | null | undefined): Promise<Restaurant> {
  const n = normalizePhone(toNumber ?? '');
  if (!n) throw new AppError(400, 'no_number', 'Nedostaje broj restorana (to_number)');
  const r = (await db.query<Restaurant>('select * from restaurants where voice_number = $1', [n])).rows[0];
  if (!r) throw new AppError(404, 'restaurant_not_found', `Nijedan restoran nema broj ${n}`);
  if (!isServiceActive(r)) throw new AppError(402, 'subscription_inactive', 'Pretplata restorana nije aktivna');
  return r;
}

/** Retell webhook (call_ended / call_analyzed): zapis trajanja poziva za obračun minuta. */
export async function recordCall(db: Db, event: any): Promise<boolean> {
  if (!['call_ended', 'call_analyzed'].includes(event?.event)) return false;
  const c = event.call ?? {};
  if (!c.call_id || !c.start_timestamp) return false;
  const n = normalizePhone(c.to_number ?? '');
  const r = n ? (await db.query<{ id: number }>('select id from restaurants where voice_number = $1', [n])).rows[0] : null;
  if (!r) return false;
  const end = Number(c.end_timestamp ?? c.start_timestamp);
  const seconds = Math.max(0, Math.round((end - Number(c.start_timestamp)) / 1000));
  await db.query(
    `insert into voice_calls (restaurant_id, call_id, from_number, started_at, duration_seconds) values ($1,$2,$3,$4,$5)
     on conflict (call_id) do update set duration_seconds = greatest(voice_calls.duration_seconds, excluded.duration_seconds)`,
    [r.id, c.call_id, c.from_number ?? null, new Date(Number(c.start_timestamp)), seconds],
  );
  return true;
}

// ---------------- Retell API (postavljanje agenta i brojeva) ----------------

export const VOICE_PROMPT = `Ti si AI asistent restorana {{restaurant_name}}. Danas je {{today}}, sada je {{now_time}}.
Govori kratko, jednom do dvije rečenice. Ako gost govori engleski ili njemački, prebaci se na taj jezik.
Pravila:
- Nikad ne izmišljaj slobodne termine — uvijek pozovi check_availability.
- Za rezervaciju trebaš datum, vrijeme, broj osoba i ime. Broj mobitela već imaš od poziva; pitaj samo "Da vam potvrdu pošaljemo na ovaj broj?". Ako gost želi drugi broj, pošalji ga u polju phone.
- Prije create_reservation ponovi dan, vrijeme, broj osoba i ime i pričekaj potvrdu.
- Ako termin nije slobodan, ponudi dva-tri najbliža iz rezultata alata.
- Šifru rezervacije sriči slovo po slovo.
- Za otkaz ili izmjenu pozovi find_reservations (broj pozivatelja se koristi automatski).
- Za grupe veće od {{max_party_size}}, događaje, pritužbe ili kad gost traži osobu: reci da nazovu {{restaurant_phone}}.
- Za alergije navedi alergene iz menija (get_restaurant_info) i reci da obavezno upozore konobara.`;

export interface RetellSetupResult { llmId: string; agentId: string }

async function retell(apiKey: string, path: string, body: unknown, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`https://api.retellai.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Retell ${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

/** Napravi zajednički LLM + agenta sa svim alatima. Pokreće se jednom: `npm run retell:setup`. */
export async function createSharedAgent(opts: {
  apiKey: string; publicBaseUrl: string; voiceSecret: string; voiceId: string; languages: string[]; fetchImpl?: typeof fetch;
}): Promise<RetellSetupResult> {
  const base = opts.publicBaseUrl.replace(/\/$/, '');
  const tools = TOOL_DEFINITIONS.map((t) => ({
    type: 'custom',
    name: t.name,
    description: t.description,
    url: `${base}/voice/retell`,
    method: 'POST',
    headers: { 'x-opsis-secret': opts.voiceSecret },
    parameters: t.input_schema,
    speak_during_execution: false,
    timeout_ms: 10000,
  }));
  const llm = await retell(opts.apiKey, '/create-retell-llm', {
    start_speaker: 'agent',
    begin_message: 'Dobar dan, {{restaurant_name}}, ovdje AI asistent. Kako vam mogu pomoći?',
    general_prompt: VOICE_PROMPT,
    general_tools: [{ type: 'end_call', name: 'end_call', description: 'Završi poziv kad se gost pozdravi.' }, ...tools],
    default_dynamic_variables: { restaurant_name: 'restoran', today: '', now_time: '', restaurant_phone: '', max_party_size: '10' },
  }, opts.fetchImpl);
  const agent = await retell(opts.apiKey, '/create-agent', {
    agent_name: 'Opsis Restoran (svi restorani)',
    response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
    voice_id: opts.voiceId,
    language: opts.languages.length === 1 ? opts.languages[0] : opts.languages,
    webhook_url: `${base}/voice/retell/events`,
  }, opts.fetchImpl);
  return { llmId: llm.llm_id, agentId: agent.agent_id };
}

/** Uvezi broj (SIP trunk, npr. Twilio HR broj) u Retell, veži ga na zajedničkog agenta i postavi inbound webhook. */
export async function importNumber(opts: {
  apiKey: string; phoneNumber: string; terminationUri: string; agentId: string; nickname: string;
  inboundWebhookUrl: string; sipUsername?: string; sipPassword?: string; fetchImpl?: typeof fetch;
}) {
  return retell(opts.apiKey, '/import-phone-number', {
    phone_number: opts.phoneNumber,
    termination_uri: opts.terminationUri,
    inbound_agents: [{ agent_id: opts.agentId, weight: 1 }],
    inbound_webhook_url: opts.inboundWebhookUrl,
    nickname: opts.nickname,
    ...(opts.sipUsername ? { sip_trunk_auth_username: opts.sipUsername, sip_trunk_auth_password: opts.sipPassword } : {}),
  }, opts.fetchImpl);
}
