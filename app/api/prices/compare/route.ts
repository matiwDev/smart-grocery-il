import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// POST /api/prices/compare
// Body: { items: [{ product_id: string, quantity: number }] }
// Returns total cost per chain + per-item breakdown
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items } = body as {
      items: Array<{ product_id: string; quantity: number }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    const productIds = items.map((i) => i.product_id);
    const supabase = createServerClient();

    // Get latest prices for all products in the basket
    const { data: prices, error } = await supabase
      .from('latest_prices')
      .select('product_id, chain_id, price, unit_qty, unit_type, is_sale, captured_at')
      .in('product_id', productIds);

    if (error) throw error;

    // Get chain info
    const { data: chains } = await supabase
      .from('chains')
      .select('id, name_he, name_en, color_hex');

    // Build price map: priceMap[product_id][chain_id] = price
    const priceMap: Record<string, Record<string, number>> = {};
    for (const p of prices ?? []) {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = {};
      priceMap[p.product_id][p.chain_id] = p.price;
    }

    // Get unique chain ids that appear in the price data
    const chainIds = [...new Set((prices ?? []).map((p) => p.chain_id))];

    // For each chain: compute total, track which items are missing (not sold there)
    const comparison: Record<
      string,
      {
        chain_id: string;
        name_he: string;
        name_en: string;
        color_hex: string;
        total: number;
        available_items: number;
        missing_items: string[]; // product_ids not found at this chain
        breakdown: Array<{ product_id: string; price: number | null; quantity: number; line_total: number | null }>;
      }
    > = {};

    for (const chainId of chainIds) {
      const chain = chains?.find((c) => c.id === chainId);
      let total = 0;
      let availableCount = 0;
      const missingItems: string[] = [];
      const breakdown = [];

      for (const item of items) {
        const price = priceMap[item.product_id]?.[chainId] ?? null;
        const lineTotal = price !== null ? price * item.quantity : null;

        if (price !== null) {
          total += lineTotal!;
          availableCount++;
        } else {
          missingItems.push(item.product_id);
        }

        breakdown.push({
          product_id: item.product_id,
          price,
          quantity: item.quantity,
          line_total: lineTotal,
        });
      }

      comparison[chainId] = {
        chain_id: chainId,
        name_he: chain?.name_he ?? chainId,
        name_en: chain?.name_en ?? chainId,
        color_hex: chain?.color_hex ?? '#6366f1',
        total: Math.round(total * 100) / 100,
        available_items: availableCount,
        missing_items: missingItems,
        breakdown,
      };
    }

    // Sort by total ascending (cheapest first)
    const sorted = Object.values(comparison).sort((a, b) => a.total - b.total);
    const cheapest = sorted[0] ?? null;
    const savings = sorted.length > 1 ? sorted[sorted.length - 1].total - sorted[0].total : 0;

    return NextResponse.json({
      comparison: sorted,
      cheapest_chain: cheapest?.chain_id ?? null,
      max_savings: Math.round(savings * 100) / 100,
      item_count: items.length,
      chains: chains ?? [],
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Compare failed';
    console.error('[prices/compare]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
