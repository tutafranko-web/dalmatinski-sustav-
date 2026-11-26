// Jednokratno: napravi ZAJEDNIČKOG Retell agenta za sve restorane.
// Pokreni: RETELL_API_KEY=... PUBLIC_BASE_URL=https://... VOICE_SHARED_SECRET=... RETELL_VOICE_ID=... npm run retell:setup
// Ispisani RETELL_AGENT_ID upiši u .env. Novi restoran = samo uvezi njegov broj (PUT /api/super/restaurants/SLUG/voice).
import { createSharedAgent } from '../services/voice.js';

const env = process.env;
for (const k of ['RETELL_API_KEY', 'PUBLIC_BASE_URL', 'VOICE_SHARED_SECRET', 'RETELL_VOICE_ID']) {
  if (!env[k]) {
    console.error(`Nedostaje ${k}`);
    process.exit(1);
  }
}
const languages = (env.RETELL_LANGUAGES ?? 'hr-HR').split(',').map((s) => s.trim()).filter(Boolean);
const res = await createSharedAgent({
  apiKey: env.RETELL_API_KEY!, publicBaseUrl: env.PUBLIC_BASE_URL!, voiceSecret: env.VOICE_SHARED_SECRET!,
  voiceId: env.RETELL_VOICE_ID!, languages,
});
console.log('Gotovo. Upiši u .env:');
console.log(`RETELL_AGENT_ID=${res.agentId}`);
console.log(`(LLM: ${res.llmId})`);
console.log('Inbound webhook se postavlja sam kod uvoza svakog broja (PUT /api/super/restaurants/SLUG/voice).');
