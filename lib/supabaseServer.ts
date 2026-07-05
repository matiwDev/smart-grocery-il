import { createClient } from '@supabase/supabase-js';

// Use ONLY in API routes (server-side) — never import in client components
// This client bypasses RLS — it has full DB access
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase server credentials. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Type helpers matching our schema
export interface Product {
  id: string;
  barcode: string | null;
  name_he: string;
  name_en: string | null;
  category: string | null;
  image_url: string | null;
}

export interface Chain {
  id: string;
  name_he: string;
  name_en: string;
  color_hex: string;
}

export interface PriceEntry {
  product_id: string;
  chain_id: string;
  price: number;
  unit_qty: number;
  unit_type: string;
  is_sale: boolean;
  captured_at: string;
}

export interface ProductWithPrices extends Product {
  prices: Record<string, PriceEntry>; // keyed by chain_id
}

export interface Branch {
  id: string;
  chain_id: string;
  name_he: string;
  name_en: string | null;
  city_he: string | null;
  city_en: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}
