import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';
import { buildApp } from '../src/server.js';
import { checkProductionEnv, pemFromEnv } from '../src/config.js';
import { pgSsl } from '../src/db.js';

describe('produkcijska konfiguracija', () => {
  const good = {
    DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres', SUPER_ADMIN_KEY: 'x'.repeat(48),
    PUBLIC_BASE_URL: 'https://restoran.example.com', SMTP_URL: 'smtp://a:b@c:587', MAIL_FROM: 'a@b.hr',
  };

  it('ispravan .env prolazi, prazan ne', () => {
    expect(checkProductionEnv(good).errors).toEqual([]);
    const empty = checkProductionEnv({}).errors.join('\n');
    for (const k of ['DATABASE_URL', 'SUPER_ADMIN_KEY', 'PUBLIC_BASE_URL']) expect(empty).toContain(k);
  });

  it('servis s pola ključeva zaustavlja pokretanje', () => {
    expect(checkProductionEnv({ ...good, META_ACCESS_TOKEN: 't' }).errors.join()).toContain('META_APP_SECRET');
    expect(checkProductionEnv({ ...good, STRIPE_SECRET_KEY: 'sk' }).errors.join()).toContain('STRIPE_WEBHOOK_SECRET');
    expect(checkProductionEnv({ ...good, SUPER_ADMIN_KEY: 'kratko' }).errors.join()).toContain('SUPER_ADMIN_KEY');
    expect(checkProductionEnv({ ...good, PUBLIC_BASE_URL: 'http://x.hr' }).errors.join()).toContain('PUBLIC_BASE_URL');
  });

  it('veza prema udaljenoj bazi je uvijek šifrirana', () => {
    expect(pgSsl('postgresql://u:p@localhost:5432/x')).toBeUndefined();
    expect(pgSsl('postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:5432/postgres')).toEqual({ rejectUnauthorized: false });
    expect(pgSsl('postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:5432/postgres', 'PEM')).toEqual({ ca: 'PEM', rejectUnauthorized: true });
    expect(pemFromEnv('a\\nb')).toBe('a\nb');
  });
});

describe('baza', () => {
  it('svaka tablica ima uključen RLS (Supabase REST ne smije vidjeti goste)', async () => {
    const { db } = await setup();
    const open = (await db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )).rows.map((x: any) => x.relname);
    expect(open).toEqual([]);
  });
});

describe('server iza domene', () => {
  it('chat s weba restorana prolazi CORS, panel i webhook ne', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const preflight = (url: string) => app.inject({
      method: 'OPTIONS', url,
      headers: { origin: 'https://konoba-x.hr', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    const ok = await preflight('/api/r/konoba-test/chat');
    expect(ok.statusCode).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('https://konoba-x.hr');
    for (const url of ['/api/admin/konoba-test/settings', '/webhooks/meta', '/voice/retell/konoba-test'])
      expect((await preflight(url)).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('health provjerava i bazu', async () => {
    const { db, deps } = await setup();
    expect((await (await buildApp(db, deps)).inject({ url: '/health' })).statusCode).toBe(200);
    const broken = { ...db, query: async () => { throw new Error('nema baze'); } } as any;
    expect((await (await buildApp(broken, deps)).inject({ url: '/health' })).statusCode).toBe(503);
  });

  it('Meta webhook bez META_APP_SECRET ne prima ništa', async () => {
    const { db, deps } = await setup();
    deps.config.metaAppSecret = '';
    const app = await buildApp(db, deps);
    const r = await app.inject({ method: 'POST', url: '/webhooks/meta', payload: { object: 'whatsapp_business_account', entry: [] } });
    expect(r.statusCode).toBe(503);
  });
});
