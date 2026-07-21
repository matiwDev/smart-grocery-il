import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { runIngestion } from '@/scripts/ingest-prices';

// Cron-triggered real ingestion (Phase 6). Runs the same Shufersal/Rami-Levy
// pipeline as `npm run ingest` (scripts/ingest-prices.ts) in-process.
//
// Auth accepts either header, since the two schedulers that hit this route
// send different ones:
//   - x-cron-secret: <CRON_SECRET>        (GitHub Actions / manual calls)
//   - Authorization: Bearer <CRON_SECRET> (Vercel Cron's own auto-injected
//     header for requests it triggers — see vercel.json's `crons` entry;
//     Vercel does not support sending a custom x-cron-secret header, so
//     checking only the first form would 401 Vercel's own cron invocation)
function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('authorization');
  return provided === secret || authHeader === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runIngestion();
    return NextResponse.json({
      results: results.map((r) => ({
        chain: r.chainId,
        fetched: r.fetched,
        matched: r.matched,
        inserted: r.inserted,
        error: r.errorText,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Initialize Supabase service role client for backend operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const body = await req.json();
    const { product_name, store_name, price, webhook_secret } = body;

    // Secure the webhook endpoint
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (expectedSecret && webhook_secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!product_name || !store_name || price === undefined) {
      return NextResponse.json({ error: 'Missing required payload fields' }, { status: 400 });
    }

    // Prepare the update object based on the store name
    const updateObj: Record<string, any> = {
      product_name: product_name,
      snapshot_date: new Date().toISOString()
    };

    switch (store_name.toLowerCase()) {
      case 'shufersal':
        updateObj.shufersal_price = price;
        break;
      case 'yohananof':
        updateObj.yohananof_price = price;
        break;
      case 'victory':
        updateObj.victory_price = price;
        break;
      default:
        return NextResponse.json({ error: 'Unknown store_name' }, { status: 400 });
    }

    // Insert a new snapshot row to track historical variations
    const { data, error } = await supabase
      .from('price_snapshots')
      .insert(updateObj)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // By having Realtime enabled on 'price_snapshots' in Supabase, 
    // dropping a row here cleanly broadcasts data changes to connected clients.
    
    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error('Ingest error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
