'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Award,
  ClipboardCheck,
  Database,
  HeartPulse,
  ShieldCheck,
  Users,
  UserPlus,
} from 'lucide-react';
import { api, type FiltrosResponse, type ResumenResponse } from '@/lib/api';
import { EvolucionReport } from './EvolucionReport';
import { EfectividadPracticaReport } from './EfectividadPracticaReport';
import { ContinuidadReport } from './ContinuidadReport';
import { CumplimientoReport } from './CumplimientoReport';
import { OperacionView } from './OperacionView';
import { StudentEvaluations } from './StudentEvaluations';
import { AdminStudentAccounts } from './AdminStudentAccounts';

type SeccionId = 'evolucion' | 'practicas' | 'continuidad' | 'cumplimiento' | 'operacion' | 'usuarios';

const NAV_ITEMS: Array<{ id: SeccionId; label: string; subtitle: string; Icon: typeof Activity }> = [
  { id: 'evolucion', label: 'RG-01 · Evolución PSS-10 y PCL-5', subtitle: 'KPI-01 y KPI-02', Icon: Activity },
  { id: 'practicas', label: 'RG-02 · Efectividad por Práctica', subtitle: 'KPI-05 · Meta operativa', Icon: Award },
  { id: 'continuidad', label: 'RO-01 · Continuidad y Abandono', subtitle: 'KPI-03 · Por estudiante', Icon: Users },
  { id: 'cumplimiento', label: 'RO-02 · Control de Evaluaciones', subtitle: 'KPI-04 · Cumplimiento', Icon: ClipboardCheck },
  { id: 'operacion', label: 'Operación OLTP & ETL', subtitle: 'Captura y Data Mart SQL Server', Icon: Database },
];

export function DashboardApp() {
  const [authState, setAuthState] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id_usuario: number; id_estudiante: number | null; nombre_usuario: string; rol: string } | null>(null);
  const [seccion, setSeccion] = useState<SeccionId>('evolucion');
  const [semestre, setSemestre] = useState<string>('2026-II');
  const [corte] = useState<string>('2026-11-23');
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const [filtros, setFiltros] = useState<FiltrosResponse | null>(null);
  const [totales, setTotales] = useState<ResumenResponse['totales'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((user) => { setCurrentUser(user); setAuthState('signed-in'); }).catch(() => setAuthState('signed-out'));
  }, []);

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const result = await api.login({ username: loginName, password: loginPassword });
      setCurrentUser(result.user);
      setLoginPassword('');
      setAuthState('signed-in');
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const cargarCabecera = useCallback(async () => {
    setError(null);
    try {
      const [f, res] = await Promise.all([api.getFiltros(), api.getResumen({ corte })]);
      setFiltros(f);
      setTotales(res.totales);
    } catch (e: any) {
      setError(`No se pudo conectar al backend NestJS: ${e.message}`);
    }
  }, [corte]);

  useEffect(() => {
    if (authState === 'signed-in') cargarCabecera();
  }, [cargarCabecera, authState]);

  const handleDataMutated = () => {
    setRefreshTick((t) => t + 1);
    cargarCabecera();
  };

  const navItems = currentUser?.rol === 'ADMIN'
    ? [...NAV_ITEMS, { id: 'usuarios' as const, label: 'Cuentas de estudiantes', subtitle: 'Acceso a formularios', Icon: UserPlus }]
    : NAV_ITEMS;

  if (authState !== 'signed-in') {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-100 p-5">
        <form onSubmit={submitLogin} className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="login-title">
          <div>
            <h1 id="login-title" className="text-xl font-bold text-slate-900">MMET · Bienestar BI</h1>
            <p className="mt-1 text-sm text-slate-600">Inicia sesión para consultar el sistema.</p>
          </div>
          {authState === 'checking' ? <p role="status">Verificando sesión…</p> : <>
            <div className="mwg-field">
              <label htmlFor="login-name" className="block text-sm font-medium text-slate-800">Usuario</label>
              <input id="login-name" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={loginName} onChange={(e) => setLoginName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="mwg-field">
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-800">Contraseña</label>
              <input id="login-password" name="password" type="password" autoComplete="current-password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            {loginError && <p role="alert" className="text-sm text-rose-800">{loginError}</p>}
            <button type="submit" disabled={loginBusy} className="w-full rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{loginBusy ? 'Ingresando…' : 'Ingresar'}</button>
          </>}
        </form>
      </main>
    );
  }

  if (currentUser?.rol === 'ESTUDIANTE') {
    return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><div className="mx-auto max-w-4xl"><StudentEvaluations username={currentUser.nombre_usuario} onLogout={async () => { await api.logout(); setCurrentUser(null); setAuthState('signed-out'); }} /></div></main>;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Navegación lateral semántica */}
      <aside className="lg:w-72 bg-slate-900 text-slate-100 shrink-0 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">MMET · Bienestar BI</h1>
              <p className="text-xs text-slate-400">Trujillo · Semestre 2026-II</p>
            </div>
          </div>
        </div>

        <nav aria-label="Navegación principal" className="p-3 space-y-1 flex-1">
          {navItems.map(({ id, label, subtitle, Icon }) => {
            const active = seccion === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setSeccion(id)}
                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active
                    ? 'bg-teal-700/90 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold leading-tight">{label}</div>
                  <div className={`text-xs ${active ? 'text-teal-100' : 'text-slate-400'}`}>{subtitle}</div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center gap-1.5 text-teal-300 font-medium">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Ética y Privacidad Activas</span>
          </div>
          <p>Identificadores anonimizados · Supresión automática si n &lt; 5 · Sin diagnóstico clínico ni causalidad.</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {navItems.find((n) => n.id === seccion)?.label}
              </h2>
              <p className="text-xs text-slate-500">
                Conectado en vivo a SQL Server <code className="bg-slate-100 px-1.5 py-0.5 rounded">MMET_BI_OLTP</code>
                {totales && (
                  <>
                    {' · '}
                    {totales.total_estudiantes.toLocaleString()} estudiantes ·{' '}
                    {totales.total_asistencias.toLocaleString()} asistencias
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={async () => { await api.logout(); setAuthState('signed-out'); }} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700">Cerrar sesión</button>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <span>Semestre:</span>
                <select
                  aria-label="Seleccionar semestre académico"
                  value={semestre}
                  onChange={(e) => setSemestre(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-800"
                >
                  {(filtros?.semestres?.length ? filtros.semestres : ['2026-II']).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="">Todos</option>
                </select>
              </label>
            </div>
          </div>
        </header>

        <main id="main-content" className="p-6 space-y-6 flex-1">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <strong>Error de conexión:</strong> {error}
            </div>
          )}

          {/* REPORTE 1: EVOLUCIÓN DEL ESTRÉS PERCIBIDO Y SÍNTOMAS POSTRAUMÁTICOS (KPI-01 y KPI-02) */}
          {seccion === 'evolucion' && (
            <EvolucionReport key={`ev-${refreshTick}`} filtros={filtros} corteInicial={corte} semestre={semestre} />
          )}

          {/* REPORTE 2: COMPARATIVO DE EFECTIVIDAD Y CUMPLIMIENTO DE META POR PRÁCTICA (KPI-05) */}
          {seccion === 'practicas' && (
            <EfectividadPracticaReport
              key={`pr-${refreshTick}`}
              filtros={filtros}
              corteInicial={corte}
              semestre={semestre}
            />
          )}

          {/* REPORTE 3: SEGUIMIENTO DE CONTINUIDAD Y ABANDONO POR ESTUDIANTE (KPI-03) */}
          {seccion === 'continuidad' && (
            <ContinuidadReport
              key={`co-${refreshTick}`}
              filtros={filtros}
              corteInicial={corte}
              semestre={semestre}
            />
          )}

          {/* REPORTE 4: CONTROL DE EVALUACIONES PSICOLÓGICAS PENDIENTES Y COMPLETADAS (KPI-04) */}
          {seccion === 'cumplimiento' && (
            <CumplimientoReport
              key={`cu-${refreshTick}`}
              filtros={filtros}
              corteInicial={corte}
              semestre={semestre}
            />
          )}

          {/* OPERACIÓN TRANSACCIONAL OLTP */}
          {seccion === 'operacion' && (
            <OperacionView
              filtros={filtros}
              userRole={currentUser?.rol || ''}
              onDataMutated={handleDataMutated}
            />
          )}
          {seccion === 'usuarios' && currentUser?.rol === 'ADMIN' && <AdminStudentAccounts onLogout={async () => { await api.logout(); setCurrentUser(null); setAuthState('signed-out'); }} />}
        </main>
      </div>
    </div>
  );
}
