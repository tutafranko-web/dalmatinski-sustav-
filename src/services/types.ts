export interface OpeningPeriod { weekday: number; open: string; close: string }

export interface Restaurant {
  id: number;
  slug: string;
  name: string;
  timezone: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  default_language: string;
  opening_hours: OpeningPeriod[];
  closed_dates: string[];
  slot_minutes: number;
  default_duration_minutes: number;
  max_party_size: number;
  guarantee_mode: 'none' | 'card';
  guarantee_min_party: number;
  no_show_fee_cents: number;
  stripe_account_id: string | null;
  google_review_url: string | null;
  review_mode: 'approval' | 'auto' | 'off';
  whatsapp_phone_number_id: string | null;
  instagram_account_id: string | null;
  admin_api_key: string;
  info_text: string;
  fiscal_config: Record<string, any>;
  subscription_status: 'pending' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'manual';
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  voice_number: string | null;
  included_voice_minutes: number;
  overage_cents_per_minute: number;
  whatsapp_waba_id: string | null;
  whatsapp_token: string | null;
}

/** Restoran radi za goste ako pretplata nije istekla ili otkazana. */
export function isServiceActive(r: Pick<Restaurant, 'subscription_status'>): boolean {
  return ['trialing', 'active', 'past_due', 'manual'].includes(r.subscription_status);
}

export interface DiningTable {
  id: number;
  restaurant_id: number;
  label: string;
  zone: string;
  min_capacity: number;
  max_capacity: number;
  active: boolean;
  qr_token: string;
  /** Spojeni stolovi: ID-jevi stvarnih stolova; null za običan stol. */
  combo_of: number[] | null;
}

export type ReservationStatus =
  | 'pending_guarantee' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show' | 'expired';

/** Statusi koji zauzimaju stol. */
export const BLOCKING_STATUSES: ReservationStatus[] = ['pending_guarantee', 'confirmed', 'seated'];

export interface Reservation {
  id: number;
  code: string;
  restaurant_id: number;
  guest_id: number;
  table_id: number | null;
  party_size: number;
  start_at: Date;
  end_at: Date;
  status: ReservationStatus;
  source: string;
  notes: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_method_id: string | null;
  no_show_charge_id: string | null;
  guarantee_expires_at: Date | null;
  reminder_sent_at: Date | null;
  review_request_sent_at: Date | null;
  review_decision: 'approved' | 'declined' | null;
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
