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
    const { action, payload, userId } = body;

    // Validate request
    if (!action || !payload || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Process different sync actions from the frontend
    if (action === 'UPSERT_BASKET') {
      const { id, name, is_archived, household_id } = payload;
      
      const { data, error } = await supabase
        .from('baskets')
        .upsert({
          id: id,
          name: name,
          user_id: userId,
          household_id: household_id || null,
          is_archived: is_archived || false,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      
      return NextResponse.json({ success: true, data });
    } 
    
    else if (action === 'SYNC_ITEMS') {
      const { basket_id, items } = payload;
      
      if (!basket_id || !Array.isArray(items)) {
         return NextResponse.json({ error: 'Invalid items payload' }, { status: 400 });
      }

      // We'll perform a transaction-like update:
      // First, get existing items to compare (or just bulk upsert)
      
      // Delete items that are no longer in the payload for this basket
      // This is a naive sync approach for a simple list. In production, soft-deletes or delta-sync is better.
      const itemIds = items.map(item => item.id).filter(Boolean);
      if (itemIds.length > 0) {
        await supabase
          .from('basket_items')
          .delete()
          .eq('basket_id', basket_id)
          .not('id', 'in', `(${itemIds.join(',')})`);
      } else {
        await supabase
          .from('basket_items')
          .delete()
          .eq('basket_id', basket_id);
      }
      
      // Upsert provided items
      if (items.length > 0) {
        const itemsToUpsert = items.map(item => ({
          id: item.id, // Should be valid UUID from client, or Supabase generates if omitted/undefined
          basket_id: basket_id,
          product_name: item.product_name,
          quantity_description: item.quantity_description || '',
          quantity_value: item.quantity_value || 1,
          updated_at: new Date().toISOString()
        }));
        
        const { error } = await supabase
          .from('basket_items')
          .upsert(itemsToUpsert, { onConflict: 'id' });
          
        if (error) throw error;
      }
      
      // Fetch latest basket state
      const { data, error } = await supabase
        .from('basket_items')
        .select('*')
        .eq('basket_id', basket_id);
        
      if (error) throw error;
      
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Unknown sync action' }, { status: 400 });
    
  } catch (error: any) {
    console.error('Sync error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
