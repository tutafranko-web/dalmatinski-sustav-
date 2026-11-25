import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Pokreće funkciju u transakciji. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** Više SQL naredbi odjednom (migracije). */
  exec?(sql: string): Promise<unknown>;
}

/**
 * TLS prema bazi: lokalna baza bez TLS-a, svaka udaljena uvijek šifrirano.
 * Supabase potpisuje certifikat vlastitim CA-om, pa se identitet servera provjerava samo ako je zadan caPem
 * (Supabase → Database → SSL Configuration → Download certificate).
 */
export function pgSsl(connectionString: string, caPem?: string): { ca?: string; rejectUnauthorized: boolean } | undefined {
  const url = new URL(connectionString);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return undefined;
  if (url.searchParams.has('sslmode')) return undefined; // izričito zadano u adresi
  return caPem ? { ca: caPem, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

/** Produkcija: Supabase / bilo koji Postgres preko DATABASE_URL. */
export function createPgDb(connectionString: string, caPem?: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10, ssl: pgSsl(connectionString, caPem), connectionTimeoutMillis: 10_000 });
  // bez ovoga prekid veze prema bazi (npr. restart poolera) ruši cijeli proces
  pool.on('error', (e) => console.error('[db] prekinuta veza u mirovanju:', e.message));
  const wrap = (client: pg.PoolClient): Db => ({
    query: (sql, params) => client.query(sql, params as any[]) as any,
    tx: (fn) => fn(wrap(client)), // već smo u transakciji
    close: async () => {},
  });
  return {
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const res = await fn(wrap(client));
        await client.query('commit');
        return res;
      } catch (e) {
        await client.query('rollback').catch(() => {}); // ako je veza pala, bitna je izvorna greška
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Testovi i lokalni razvoj: pravi Postgres u memoriji (PGlite).
 * loadDataDir = snimka već migrirane baze (dump()): diže se oko 8 puta brže nego prazna baza.
 */
export async function createMemDb(loadDataDir?: Blob): Promise<Db & { dump(): Promise<Blob> }> {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(loadDataDir ? { loadDataDir } : {});
  let inTx = false;
  const db: Db & { dump(): Promise<Blob> } = {
    query: (sql, params) => lite.query(sql, params as any[]) as any,
    async tx(fn) {
      if (inTx) return fn(db);
      inTx = true;
      try {
        return await lite.transaction(async (t) => {
          const tdb: Db = {
            query: (sql, params) => t.query(sql, params as any[]) as any,
            tx: (f) => f(tdb),
            close: async () => {},
          };
          return fn(tdb);
        });
      } finally {
        inTx = false;
      }
    },
    close: () => lite.close(),
    exec: (sql) => lite.exec(sql),
    dump: () => lite.dumpDataDir('none'),
  };
  return db;
}

export async function migrate(db: Db): Promise<void> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  await db.query(`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`);
  const done = new Set((await db.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    // PGlite i pg oboje podržavaju više naredbi kad nema parametara
    if (db.exec) await db.exec(sql);
    else await db.query(sql);
    await db.query('insert into _migrations(name) values ($1)', [file]);
  }
}
