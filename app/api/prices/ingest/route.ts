import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
