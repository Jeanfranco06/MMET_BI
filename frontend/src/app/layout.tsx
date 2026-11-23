import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'MMET BI — Bienestar Universitario, Meditación y Mindfulness (2026-II)',
  description:
    'Sistema de Inteligencia de Negocios y gestión operativa para el análisis de cambios en el estrés percibido (PSS-10) y síntomas postraumáticos (PCL-5) en estudiantes universitarios.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans antialiased min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-teal-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-md"
        >
          Saltar al contenido principal
        </a>
        {children}
      </body>
    </html>
  );
}
