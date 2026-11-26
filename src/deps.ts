import type { Restaurant } from './services/types.js';

export interface Config {
  publicBaseUrl: string;            // npr. https://app.opsisdalmatia.com
  anthropicModel: string;
  voiceSharedSecret: string;        // tajni ključ za Retell funkcije (header x-opsis-secret)
  retellApiKey?: string;            // ako je postavljen, provjerava se i X-Retell-Signature
  metaVerifyToken: string;          // WhatsApp/Instagram webhook verify token
  metaAppSecret: string;            // za provjeru potpisa webhooka
  stripeWebhookSecret: string;
  superAdminKey: string;            // za tebe: kreiranje restorana
  smsSenderOverride?: string;       // SMS_SENDER: isti pošiljatelj za sve restorane (Infobip proba: ServiceSMS)
}

export interface Payments {
  /** Stripe Checkout u "setup" modu: gost ostavi karticu kao garanciju. */
  createGuaranteeSession(input: {
    restaurant: Restaurant; reservationCode: string; guestEmail?: string | null;
    successUrl: string; cancelUrl: string; customerId?: string | null;
  }): Promise<{ id: string; url: string }>;
  /** Stripe Connect: otvara (ili nastavlja) onboarding restorana. Vraća ID računa i link za unos podataka. */
  createOnboardingLink(input: { restaurant: Restaurant; returnUrl: string; refreshUrl: string }): Promise<{ accountId: string; url: string }>;
  /** Naplata no-showa sa spremljene kartice. Vraća ID naplate. */
  chargeNoShow(input: {
    restaurant: Restaurant; paymentMethodId: string; customerId: string;
    amountCents: number; reservationCode: string;
  }): Promise<string>;
}

export interface Transport {
  sendEmail(input: { to: string; subject: string; text: string; replyTo?: string | null }): Promise<void>;
  /** Vraća ID poruke (wamid) za praćenje dostave. */
  sendWhatsApp(input: { phoneNumberId: string; to: string; body: WhatsAppBody }): Promise<string | null>;
  sendInstagram(input: { igAccountId: string; recipientId: string; text: string }): Promise<void>;
  /** Nema ga ako SMS nije podešen na serveru. Vraća ID poruke kod dobavljača. */
  sendSms?(input: { to: string; from: string; text: string }): Promise<string | null>;
}

/** Greška slanja. permanent = ponovni pokušaj ne pomaže (broj nije na WhatsAppu, predložak ne postoji...). */
export class SendError extends Error {
  constructor(message: string, public permanent: boolean, public code?: string) {
    super(message);
  }
}

export type WhatsAppBody =
  | { type: 'text'; text: string }
  | { type: 'template'; name: string; language: string; params: string[] };

/** Minimalno sučelje prema Claude Messages API-ju (lako za mockati u testovima). */
export interface LLM {
  create(params: {
    model: string; max_tokens: number; system: string; messages: any[]; tools: any[];
  }): Promise<{ content: any[]; stop_reason: string | null }>;
}

export interface Deps {
  config: Config;
  payments: Payments | null;   // null = Stripe nije podešen
  transport: Transport;
  llm: LLM | null;             // null = chatbot isključen
  now: () => Date;
}
