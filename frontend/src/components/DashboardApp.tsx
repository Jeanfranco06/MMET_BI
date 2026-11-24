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
} from 'lucide-react';
import { api, type FiltrosResponse, type ResumenResponse } from '@/lib/api';
import { EvolucionReport } from './EvolucionReport';
import { EfectividadPracticaReport } from './EfectividadPracticaReport';
import { ContinuidadReport } from './ContinuidadReport';
import { CumplimientoReport } from './CumplimientoReport';
import { OperacionView } from './OperacionView';

type SeccionId = 'evolucion' | 'practicas' | 'continuidad' | 'cumplimiento' | 'operacion';

const NAV_ITEMS: Array<{ id: SeccionId; label: string; subtitle: string; Icon: typeof Activity }> = [
  { id: 'evolucion', label: '1. Evolución PSS-10 y PCL-5', subtitle: 'KPI-01 y KPI-02', Icon: Activity },
  { id: 'practicas', label: '2. Efectividad por Práctica', subtitle: 'KPI-05 · Meta operativa', Icon: Award },
  { id: 'continuidad', label: '3. Continuidad y Abandono', subtitle: 'KPI-03 · Por estudiante', Icon: Users },
  { id: 'cumplimiento', label: '4. Control de Evaluaciones', subtitle: 'KPI-04 · Cumplimiento', Icon: ClipboardCheck },
  { id: 'operacion', label: 'Operación OLTP', subtitle: 'Captura en vivo SQL Server', Icon: Database },
];

export function DashboardApp() {
  const [seccion, setSeccion] = useState<SeccionId>('evolucion');
  const [semestre, setSemestre] = useState<string>('2026-II');
  const [corte] = useState<string>('2026-11-23');
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const [filtros, setFiltros] = useState<FiltrosResponse | null>(null);
  const [totales, setTotales] = useState<ResumenResponse['totales'] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    cargarCabecera();
  }, [cargarCabecera]);

  const handleDataMutated = () => {
    setRefreshTick((t) => t + 1);
    cargarCabecera();
  };

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
          {NAV_ITEMS.map(({ id, label, subtitle, Icon }) => {
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
                {NAV_ITEMS.find((n) => n.id === seccion)?.label}
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
          {seccion === 'operacion' && <OperacionView filtros={filtros} onDataMutated={handleDataMutated} />}
        </main>
      </div>
    </div>
  );
}
