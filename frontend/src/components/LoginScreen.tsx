'use client';

import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Lock,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface LoginScreenProps {
  checking: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (username: string, password: string) => Promise<void>;
}

const KPI_HIGHLIGHTS = [
  { code: 'KPI-01 · PSS-10', desc: 'Reducción de estrés percibido (Meta ≥ 4.0 pts)', Icon: Activity },
  { code: 'KPI-02 · PCL-5', desc: 'Reducción síntomas postraumáticos (Meta ≥ 10.0 pts)', Icon: ShieldCheck },
  { code: 'KPI-03 · RO-01', desc: 'Continuidad en estudiantes evaluables (Meta ≥ 80%)', Icon: Users },
  { code: 'KPI-04 · RO-02', desc: 'Cumplimiento de evaluaciones elegibles (Meta ≥ 90%)', Icon: ClipboardCheck },
  { code: 'KPI-05 · RG-02', desc: 'Efectividad comparativa por práctica (P-01..P-04, MIXTO)', Icon: Award },
];

export function LoginScreen({ checking, busy, error, onSubmit }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSubmit(username, password);
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-12 bg-[#F1F5F9]">
      {/* Left Branding & Architecture Panel */}
      <section
        aria-label="Presentación de MindMetrics BI"
        className="relative hidden lg:flex lg:col-span-7 xl:col-span-7 flex-col justify-between bg-[#0B1220] text-slate-100 p-10 xl:p-14 overflow-hidden"
      >
        {/* Subtle ambient radial glows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -left-24 w-96 h-96 rounded-full bg-teal-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-0 w-[28rem] h-[28rem] rounded-full bg-indigo-500/15 blur-3xl"
        />
        {/* Subtle grid pattern */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 flex items-center justify-between">
          <BrandLogo variant="dark" subtitle="Plataforma de Inteligencia de Negocios · UNT 2026-II" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 px-3 py-1 text-xs font-medium text-teal-300">
            <Database className="w-3.5 h-3.5" aria-hidden="true" />
            Data Mart SQL Server
          </span>
        </div>

        <div className="relative z-10 my-auto py-8 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/15 border border-indigo-400/25 px-3 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Analítica de Bienestar + Asistente IA (RQ-BI-15)
          </div>

          <h1 className="font-display text-3xl xl:text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
            Claridad clínica y analítica para el bienestar universitario.
          </h1>
          <p className="text-sm xl:text-base text-slate-300/90 leading-relaxed">
            Monitorea la evolución del estrés percibido (<strong className="text-white">PSS-10</strong>) y síntomas postraumáticos (<strong className="text-white">PCL-5</strong>), evalúa la efectividad por práctica de mindfulness y controla la continuidad estudiantil con privacidad estadística garantizada.
          </p>

          <div className="grid grid-cols-1 gap-2.5 pt-2">
            {KPI_HIGHLIGHTS.map(({ code, desc, Icon }) => (
              <div
                key={code}
                className="flex items-center gap-3 rounded-xl bg-slate-900/70 border border-slate-800/90 px-3.5 py-2.5 backdrop-blur-sm"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-400/20 flex items-center justify-center text-teal-400 shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white tracking-tight">{code}</div>
                  <div className="text-xs text-slate-400 truncate">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/90 pt-5 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
            <span>Separación estricta PSS-10 / PCL-5 · Supresión automática si n &lt; 5</span>
          </div>
          <span className="text-slate-500">Semestre 2026-II · Trujillo</span>
        </div>
      </section>

      {/* Right Login Form Panel */}
      <section className="lg:col-span-5 xl:col-span-5 flex flex-col justify-center items-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandLogo variant="light" subtitle="Bienestar Universitario · 2026-II" />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-7 sm:p-8 shadow-card">
            <div className="mb-6">
              <h2 id="login-title" className="font-display text-2xl font-bold text-slate-900 tracking-tight">
                Iniciar sesión
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Ingresa con tu cuenta institucional para acceder a los reportes BI, operación OLTP o portal estudiantil.
              </p>
            </div>

            {checking ? (
              <div role="status" className="py-10 flex flex-col items-center gap-3 text-slate-500">
                <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
                <p className="text-sm font-medium">Verificando sesión activa…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby="login-title">
                <div className="mwg-field">
                  <label htmlFor="login-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nombre de usuario
                  </label>
                  <div className="relative">
                    <User
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="login-name"
                      name="username"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      placeholder="Ej. admin-local o UNT26-EST-0015"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                    />
                  </div>
                </div>

                <div className="mwg-field">
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      placeholder="••••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                    />
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50 transition-colors"
                >
                  <span>{busy ? 'Autenticando…' : 'Ingresar a la plataforma'}</span>
                  {!busy && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                </button>
              </form>
            )}

            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
              <span>Sesión segura mediante cookie HttpOnly y control de acceso por roles.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
