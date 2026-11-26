import { createMemDb, createPgDb, migrate } from './db.js';
import { anthropicLLM, consoleTransport, readSetupSession, realTransport, stripePayments, verifyStripeEvent } from './adapters.js';
import { buildApp } from './server.js';
import { startScheduler } from './jobs/scheduler.js';
import { httpsCisSender } from './fiscal/cis.js';
import { resendFailed } from './fiscal/invoices.js';
import { purgeOldChats } from './ai/chatbot.js';
import type { Deps } from './deps.js';
import { seedDemo } from './demo.js';
import { checkProductionEnv, pemFromEnv } from './config.js';

const env = process.env;

async function main() {
  if (env.NODE_ENV === 'production') {
    const { errors, warnings } = checkProductionEnv(env);
    for (const w of warnings) console.warn('⚠', w);
    if (errors.length) {
      for (const e of errors) console.error('✖', e);
      console.error('Server se ne pokreće dok se .env ne popravi.');
      process.exit(1);
    }
  }

  const db = env.DATABASE_URL ? createPgDb(env.DATABASE_URL, pemFromEnv(env.DATABASE_CA_PEM)) : await createMemDb();
  if (!env.DATABASE_URL) console.warn('⚠ DATABASE_URL nije postavljen — koristi se baza u memoriji (podaci se gube kod restarta)');
  await migrate(db);
  if (!env.DATABASE_URL || env.SEED_DEMO === 'true') await seedDemo(db);

  const deps: Deps = {
    config: {
      publicBaseUrl: (env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
      anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
      voiceSharedSecret: env.VOICE_SHARED_SECRET ?? '',
      retellApiKey: env.RETELL_API_KEY ?? '',
      metaVerifyToken: env.META_VERIFY_TOKEN ?? '',
      metaAppSecret: env.META_APP_SECRET ?? '',
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
      superAdminKey: env.SUPER_ADMIN_KEY ?? '',
      smsSenderOverride: env.SMS_SENDER || undefined,
    },
    payments: env.STRIPE_SECRET_KEY ? stripePayments(env.STRIPE_SECRET_KEY) : null,
    transport: env.SMTP_URL || env.META_ACCESS_TOKEN || env.INFOBIP_API_KEY
      ? realTransport({
          smtpUrl: env.SMTP_URL, mailFrom: env.MAIL_FROM, metaAccessToken: env.META_ACCESS_TOKEN, graphVersion: env.META_GRAPH_VERSION,
          infobipApiKey: env.INFOBIP_API_KEY, infobipBaseUrl: env.INFOBIP_BASE_URL,
        })
      : consoleTransport(),
    llm: env.ANTHROPIC_API_KEY ? anthropicLLM(env.ANTHROPIC_API_KEY) : null,
    now: () => new Date(),
  };

  const cisSender = env.FISCAL_ENABLED === 'true' ? httpsCisSender(pemFromEnv(env.FISCAL_CA_PEM)) : null;
  const app = await buildApp(db, deps, {
    logger: true,
    cisSender,
    stripeWebhook: env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
      ? async (raw, sig) => readSetupSession(env.STRIPE_SECRET_KEY!, verifyStripeEvent(env.STRIPE_SECRET_KEY!, env.STRIPE_WEBHOOK_SECRET!, raw, sig))
      : null,
  });

  const stopScheduler = startScheduler(db, deps);
  const timers = [setInterval(() => purgeOldChats(db).catch(console.error), 6 * 3600_000)];
  if (cisSender) timers.push(setInterval(() => resendFailed(db, { send: cisSender }).catch(console.error), 10 * 60_000));

  await app.listen({ port: Number(env.PORT ?? 3000), host: '0.0.0.0' });

  // docker stop / nova verzija: dovrši zahtjeve i poruke koje su u tijeku, pa ugasi
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`${signal}: gasim server`);
    setTimeout(() => process.exit(1), 9_000).unref(); // docker nakon 10 s ionako ubija proces
    timers.forEach((t) => clearInterval(t));
    await stopScheduler();
    await app.close();
    await Promise.allSettled([...app.pending]);
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
