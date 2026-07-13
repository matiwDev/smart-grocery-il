import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// Dev-only: get-or-create a fixed, pre-confirmed test account so local auth
// testing never sends a real email. Never reachable outside development.
const DEV_EMAIL = 'dev@smartgrocery.local';
const DEV_PASSWORD = 'DevLogin123!';
const DEV_NICKNAME = 'Dev Tester';

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  try {
    const supabase = createServerClient();

    const { data: list, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    let user = list.users.find((u) => u.email === DEV_EMAIL);

    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
        email_confirm: true,
        user_metadata: { nickname: DEV_NICKNAME },
      });
      if (error) throw error;
      user = data.user;
    }

    if (!user) throw new Error('Failed to get or create dev user');

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      email: DEV_EMAIL,
      nickname: DEV_NICKNAME,
      phone_number: '050-0000000',
      selected_skin: 'warm-rose',
    });
    if (profileError) throw profileError;

    return NextResponse.json({ email: DEV_EMAIL, password: DEV_PASSWORD, nickname: DEV_NICKNAME });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Dev login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
