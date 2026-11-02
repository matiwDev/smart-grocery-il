import type { Metadata, Viewport } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css'; // Global styles

// Rubik: rounded and warm, with full Hebrew support (design refresh, Nov 2026).
const rubik = Rubik({ subsets: ['hebrew', 'latin'], variable: '--font-rubik', display: 'swap' });

export const metadata: Metadata = {
  title: 'Smart Grocery IL',
  description: 'הקניות של הבית, במקום אחד — רשימה משותפת, תכנון ארוחות ומתכונים.',
  appleWebApp: { capable: true, title: 'Smart Grocery', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBF7F1' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1613' },
  ],
};

const THEME_INIT_SCRIPT = `
  try {
    var theme = localStorage.getItem('sg_theme');
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
`;

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preload" as="image" href="/splash.webp" />
      </head>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
