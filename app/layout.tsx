import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { Providers } from './components/Providers';

export const metadata: Metadata = {
  title: 'Smart Grocery IL - השוואת סלי קניות אלגוריתמית',
  description: 'מערכת אלגוריתמית חכמה להשוואת מחירי סופרמרקטים בישראל בזמן אמת',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="he" dir="rtl">
      <body suppressHydrationWarning className="bg-slate-950 text-slate-100 min-h-screen font-sans selection:bg-blue-600/30 selection:text-blue-200">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
