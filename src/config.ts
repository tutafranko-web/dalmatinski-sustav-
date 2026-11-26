// Provjera varijabli okoline prije pokretanja u produkciji: bolje da se server ne digne nego da tiho radi krivo.

type Env = Record<string, string | undefined>;

export interface ConfigReport { errors: string[]; warnings: string[] }

/** Greške zaustavljaju pokretanje kad je NODE_ENV=production; upozorenja se samo ispišu. */
export function checkProductionEnv(env: Env): ConfigReport {
  const errors: string[] = [], warnings: string[] = [];

  if (!env.DATABASE_URL) errors.push('DATABASE_URL nije postavljen: sve rezervacije bi se izgubile kod restarta.');
  if ((env.SUPER_ADMIN_KEY ?? '').length < 24) errors.push('SUPER_ADMIN_KEY mora imati barem 24 znaka (npr. openssl rand -base64 36).');
  if (!/^https:\/\/[^/]+/.test(env.PUBLIC_BASE_URL ?? '')) errors.push('PUBLIC_BASE_URL mora biti puna https adresa: ide u poruke gostima i u Stripe.');
  if (env.META_ACCESS_TOKEN && !env.META_APP_SECRET) errors.push('META_APP_SECRET nedostaje: bez njega bi bilo tko mogao slati lažne WhatsApp poruke u sustav.');
  if (env.META_ACCESS_TOKEN && !env.META_VERIFY_TOKEN) errors.push('META_VERIFY_TOKEN nedostaje: Meta ne može potvrditi webhook.');
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) errors.push('STRIPE_WEBHOOK_SECRET nedostaje: garancije karticom se nikad ne bi potvrdile.');
  if (env.VOICE_SHARED_SECRET && env.VOICE_SHARED_SECRET.length < 16) errors.push('VOICE_SHARED_SECRET je prekratak (barem 16 znakova).');
  if (env.SMTP_URL && !env.MAIL_FROM) errors.push('MAIL_FROM nedostaje uz SMTP_URL.');

  if (!env.SMTP_URL && !env.META_ACCESS_TOKEN) warnings.push('Nema ni SMTP-a ni WhatsAppa: gosti neće dobivati potvrde.');
  if (!env.ANTHROPIC_API_KEY) warnings.push('ANTHROPIC_API_KEY nije postavljen: chatbot je isključen.');
  if (!env.VOICE_SHARED_SECRET && !env.RETELL_API_KEY) warnings.push('Nema VOICE_SHARED_SECRET ni RETELL_API_KEY: voice agent je isključen.');
  if (!env.INFOBIP_API_KEY) warnings.push('INFOBIP_API_KEY nije postavljen: SMS je isključen.');
  if (env.INFOBIP_API_KEY && !/^https:\/\//.test(env.INFOBIP_BASE_URL ?? 'https://')) errors.push('INFOBIP_BASE_URL mora biti https adresa (Infobip → API keys).');
  if (!env.STRIPE_SECRET_KEY) warnings.push('STRIPE_SECRET_KEY nije postavljen: garancija karticom je isključena.');
  if (env.SEED_DEMO === 'true') warnings.push('SEED_DEMO=true: demo restoran ima javno poznat ključ (demo-key).');
  if (env.FISCAL_ENABLED === 'true') warnings.push('FISCAL_ENABLED=true: fiskalizacija je uključena na serveru.');

  return { errors, warnings };
}

/** docker env_file ne podržava više redaka, pa se PEM upisuje u jednom retku s \n. */
export function pemFromEnv(value?: string): string | undefined {
  return value ? value.replace(/\\n/g, '\n') : undefined;
}
