import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MindMetrics BI · Bienestar Universitario & Analítica Clínica (2026-II)',
  description:
    'Plataforma de Inteligencia de Negocios y gestión operativa para el seguimiento de estrés percibido (PSS-10), síntomas postraumáticos (PCL-5) y continuidad en programas universitarios de meditación y mindfulness.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${plusJakarta.variable}`}>
      <body className="font-sans antialiased min-h-screen bg-[#F1F5F9] text-slate-900 selection:bg-teal-500/20 selection:text-teal-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-teal-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:shadow-lg focus:text-sm focus:font-semibold"
        >
          Saltar al contenido principal
        </a>
        {children}
      </body>
    </html>
  );
}
