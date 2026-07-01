import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'My Google AI Studio App',
  description: 'My Google AI Studio App',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-slate-950 text-slate-50 antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
