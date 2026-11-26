// Prave implementacije vanjskih servisa: Stripe, SMTP, Meta (WhatsApp/Instagram), Anthropic.
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import Anthropic from '@anthropic-ai/sdk';
import { SendError, type LLM, type Payments, type Transport } from './deps.js';

/**
 * Stripe Connect: novac ide izravno restoranu (restaurant.stripe_account_id),
 * ti si platforma. Restoran se spaja preko Stripe Connect onboardinga (vidi docs/stripe.md).
 */
export function stripePayments(secretKey: string): Payments {
  const stripe = new Stripe(secretKey);
  return {
    async createGuaranteeSession({ restaurant, reservationCode, guestEmail, successUrl, cancelUrl, customerId }) {
      const opts = { stripeAccount: restaurant.stripe_account_id! };
      const customer = customerId ?? (await stripe.customers.create({ email: guestEmail ?? undefined, metadata: { reservationCode } }, opts)).id;
      const s = await stripe.checkout.sessions.create(
        {
          mode: 'setup',
          currency: 'eur',
          customer,
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: { reservationCode },
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        },
        opts,
      );
      return { id: s.id, url: s.url! };
    },
    async createOnboardingLink({ restaurant, returnUrl, refreshUrl }) {
      const accountId = restaurant.stripe_account_id ?? (await stripe.accounts.create({
        type: 'express',
        country: 'HR',
        email: restaurant.email ?? undefined,
        business_profile: { name: restaurant.name, mcc: '5812' }, // 5812 = restorani
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { slug: restaurant.slug },
      })).id;
      const link = await stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl });
      return { accountId, url: link.url };
    },
    async chargeNoShow({ restaurant, paymentMethodId, customerId, amountCents, reservationCode }) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'eur',
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description: `No-show ${reservationCode}`,
          metadata: { reservationCode },
        },
        { stripeAccount: restaurant.stripe_account_id! },
      );
      return pi.id;
    },
  };
}

/** Iz Stripe webhook eventa izvuče payment method i customer za checkout.session.completed (setup mode). */
export async function readSetupSession(secretKey: string, event: any): Promise<{ sessionId: string; paymentMethodId: string; customerId: string | null } | null> {
  if (event.type !== 'checkout.session.completed') return null;
  const session = event.data.object;
  if (session.mode !== 'setup' || !session.setup_intent) return null;
  const stripe = new Stripe(secretKey);
  const si = await stripe.setupIntents.retrieve(session.setup_intent, {}, event.account ? { stripeAccount: event.account } : undefined);
  return { sessionId: session.id, paymentMethodId: String(si.payment_method), customerId: session.customer ?? null };
}

export function verifyStripeEvent(secretKey: string, webhookSecret: string, rawBody: string | Buffer, signature: string) {
  return new Stripe(secretKey).webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/** Meta greške koje vrijedi ponoviti (preopterećenje, limit); sve ostale su trajne. Popis: Cloud API → Error codes. */
const META_TRANSIENT = new Set([1, 2, 4, 130429, 131000, 131016, 131049, 131056]);

/** Infobip SMS API v3 (POST /sms/3/messages). baseUrl je osobna adresa računa, npr. https://xxxxx.api.infobip.com */
export function infobipSms(o: { apiKey: string; baseUrl?: string }): NonNullable<Transport['sendSms']> {
  const base = (o.baseUrl || 'https://api.infobip.com').replace(/\/$/, '');
  return async ({ to, from, text }) => {
    let res: Response;
    try {
      res = await fetch(`${base}/sms/3/messages`, {
        method: 'POST',
        headers: { Authorization: `App ${o.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ messages: [{ sender: from, destinations: [{ to: to.replace(/^\+/, '') }], content: { text } }] }),
      });
    } catch (e: any) {
      throw new SendError(`Infobip nedostupan: ${e?.message ?? e}`, false);
    }
    const body = await res.text();
    if (!res.ok) throw new SendError(`Infobip ${res.status}: ${body.slice(0, 300)}`, res.status < 500 && res.status !== 429, String(res.status));
    const m = JSON.parse(body).messages?.[0];
    const group = m?.status?.groupName;
    if (group === 'REJECTED' || group === 'UNDELIVERABLE')
      throw new SendError(`Infobip ${m.status.name}: ${m.status.description ?? ''}`, true, m.status.name);
    return m?.messageId ?? null;
  };
}

export function realTransport(env: {
  smtpUrl?: string; mailFrom?: string; metaAccessToken?: string; graphVersion?: string;
  infobipApiKey?: string; infobipBaseUrl?: string;
}): Transport {
  const mailer = env.smtpUrl ? nodemailer.createTransport(env.smtpUrl) : null;
  const graph = `https://graph.facebook.com/${env.graphVersion ?? 'v26.0'}`;
  async function graphPost(path: string, body: unknown): Promise<any> {
    if (!env.metaAccessToken) throw new SendError('META_ACCESS_TOKEN nije postavljen', true);
    let res: Response;
    try {
      res = await fetch(`${graph}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.metaAccessToken}` },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      throw new SendError(`Meta nedostupna: ${e?.message ?? e}`, false);
    }
    const text = await res.text();
    if (!res.ok) {
      const err = (() => { try { return JSON.parse(text).error; } catch { return null; } })();
      const code = Number(err?.code);
      const permanent = res.status < 500 && res.status !== 429 && !META_TRANSIENT.has(code);
      throw new SendError(`Meta ${res.status} (${code || '?'}): ${err?.message ?? text.slice(0, 300)}`, permanent, code ? String(code) : undefined);
    }
    return text ? JSON.parse(text) : {};
  }
  return {
    sendSms: env.infobipApiKey ? infobipSms({ apiKey: env.infobipApiKey, baseUrl: env.infobipBaseUrl }) : undefined,
    async sendEmail({ to, subject, text, replyTo }) {
      if (!mailer) throw new Error('SMTP_URL nije postavljen');
      await mailer.sendMail({ from: env.mailFrom, to, subject, text, replyTo: replyTo ?? undefined });
    },
    async sendWhatsApp({ phoneNumberId, to, body }) {
      const payload =
        body.type === 'text'
          ? { messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'text', text: { body: body.text } }
          : {
              messaging_product: 'whatsapp',
              to: to.replace('+', ''),
              type: 'template',
              template: {
                name: body.name,
                language: { code: body.language },
                components: [{ type: 'body', parameters: body.params.map((t) => ({ type: 'text', text: t })) }],
              },
            };
      const out = await graphPost(`${phoneNumberId}/messages`, payload);
      return out?.messages?.[0]?.id ?? null;
    },
    async sendInstagram({ igAccountId, recipientId, text }) {
      await graphPost(`${igAccountId}/messages`, { recipient: { id: recipientId }, message: { text } });
    },
  };
}

export function anthropicLLM(apiKey: string): LLM {
  const client = new Anthropic({ apiKey });
  return {
    async create(params) {
      const res = await client.messages.create(params as any);
      return { content: res.content as any[], stop_reason: res.stop_reason };
    },
  };
}

/** Za razvoj: ispisuje poruke u konzolu umjesto slanja. */
export function consoleTransport(): Transport {
  return {
    async sendEmail(i) { console.log('[email]', i.to, i.subject); },
    async sendWhatsApp(i) { console.log('[whatsapp]', i.to, JSON.stringify(i.body)); return null; },
    async sendSms(i) { console.log('[sms]', i.to, i.from, i.text); return null; },
    async sendInstagram(i) { console.log('[instagram]', i.recipientId, i.text); },
  };
}
