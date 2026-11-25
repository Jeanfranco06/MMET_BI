'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  DatabaseZap,
  Edit3,
  RefreshCw,
  UserCheck,
  X,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { ResponsiveTable, type TableColumn } from './ResponsiveTable';
import { ModalDialog } from './ModalDialog';
import { TableSkeleton } from './UiStates';

interface OperacionViewProps {
  filtros: FiltrosResponse | null;
  userRole: string;
  onDataMutated: () => void;
}

type OpTab = 'asistencias' | 'sesiones' | 'correcciones' | 'etl';

export function OperacionView({ filtros, userRole, onDataMutated }: OperacionViewProps) {
  const canManageSessions = userRole === 'ADMIN' || userRole === 'COORDINACION';
  const canCorrectEval = userRole === 'ADMIN' || userRole === 'EVALUACION';
  const isAdmin = userRole === 'ADMIN';

  const defaultTab: OpTab = canManageSessions ? 'asistencias' : canCorrectEval ? 'correcciones' : 'sesiones';
  const [activeTab, setActiveTab] = useState<OpTab>(defaultTab);
  const [idPrograma, setIdPrograma] = useState<string>('');
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Toast notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(t);
  }, [toast]);

  // 1. Asistencia form
  const [asisSesionId, setAsisSesionId] = useState<string>('');
  const [asisAsignacionId, setAsisAsignacionId] = useState<string>('');
  const [asisEstado, setAsisEstado] = useState<'ASISTIO' | 'INASISTENCIA' | 'RETIRO_BAJA'>('ASISTIO');
  const [asisMinutos, setAsisMinutos] = useState<string>('45');
  const [asisBusy, setAsisBusy] = useState(false);

  // 2. Nueva sesión modal
  const [sesionModalOpen, setSesionModalOpen] = useState(false);
  const [nsProgramaId, setNsProgramaId] = useState<string>('');
  const [nsNumero, setNsNumero] = useState<string>('11');
  const [nsPracticaId, setNsPracticaId] = useState<string>('');
  const [nsModalidad, setNsModalidad] = useState<'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA'>('PRESENCIAL');
  const [nsDuracion, setNsDuracion] = useState<string>('45');
  const [nsFecha, setNsFecha] = useState<string>('2026-11-26');
  const [nsHora, setNsHora] = useState<string>('09:00');
  const [nsEstado, setNsEstado] = useState<'PROGRAMADA' | 'REALIZADA'>('PROGRAMADA');
  const [nsBusy, setNsBusy] = useState(false);

  // 3. Corrección modal
  const [corrTarget, setCorrTarget] = useState<any | null>(null);
  const [corrFecha, setCorrFecha] = useState<string>('2026-11-23');
  const [corrMotivo, setCorrMotivo] = useState<string>('');
  const [corrRespuestas, setCorrRespuestas] = useState<Record<number, number>>({});
  const [corrBusy, setCorrBusy] = useState(false);

  // 4. Control ETL (ADMIN)
  const [etlCorte, setEtlCorte] = useState<string>('2026-11-23');
  const [etlBusy, setEtlBusy] = useState(false);
  const [etlInfo, setEtlInfo] = useState<{
    fecha_corte: string;
    fin_ejecucion: string;
    filas_continuidad: number;
    filas_cumplimiento: number;
    filas_resultados: number;
    incidencias_detectadas: number;
  } | null>(null);

  const practicasUnicomponente = (filtros?.practicas || []).filter((p) => !p.es_mixto);

  const cargar = async () => {
    setLoading(true);
    try {
      const [ses, ops] = await Promise.all([
        api.getSesiones(idPrograma || undefined),
        canCorrectEval ? api.getOportunidadesAbiertas(idPrograma || undefined) : Promise.resolve([]),
      ]);
      setSesiones(ses);
      setOportunidades(ops);
    } catch (e: any) {
      showToast('error', e.message || 'Error al cargar datos operativos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPrograma]);

  const handleRegistrarAsistencia = async (e: React.FormEvent) => {
    e.preventDefault();
    setAsisBusy(true);
    try {
      const res = await api.registrarAsistencia({
        id_sesion: Number(asisSesionId),
        id_asignacion: Number(asisAsignacionId),
        estado_asistencia: asisEstado,
        minutos_asistidos: asisEstado === 'ASISTIO' ? Number(asisMinutos) : 0,
      });
      showToast('success', res.mensaje);
      setAsisAsignacionId('');
      await cargar();
      onDataMutated();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setAsisBusy(false);
    }
  };

  const handleCrearSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    setNsBusy(true);
    try {
      const res = await api.crearSesion({
        id_programa: Number(nsProgramaId),
        numero_sesion: Number(nsNumero),
        id_practica_tecnica: Number(nsPracticaId),
        modalidad: nsModalidad,
        duracion_programada_min: Number(nsDuracion),
        fecha_sesion: nsFecha,
        hora_inicio: nsHora,
        estado_sesion: nsEstado,
      });
      showToast(
        'success',
        `${res.mensaje} (${res.sesion?.codigo_programa} · Sesión #${res.sesion?.numero_sesion})`,
      );
      setSesionModalOpen(false);
      await cargar();
      onDataMutated();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setNsBusy(false);
    }
  };

  const openCorreccion = (op: any) => {
    const totalItems = op.codigo_instrumento === 'PSS-10' ? 10 : 20;
    const defaults: Record<number, number> = {};
    for (let i = 1; i <= totalItems; i += 1) defaults[i] = 2;
    setCorrRespuestas(defaults);
    setCorrFecha(op.fecha_realizacion || op.fecha_ventana_fin || '2026-11-23');
    setCorrMotivo('');
    setCorrTarget(op);
  };

  const handleCorregirEvaluacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrTarget) return;
    setCorrBusy(true);
    try {
      const respuestas = Object.entries(corrRespuestas).map(([numero_item, valor]) => ({
        numero_item: Number(numero_item),
        valor: Number(valor),
      }));
      const res = await api.corregirEvaluacion(corrTarget.id_oportunidad, {
        respuestas,
        fecha_realizacion: corrFecha,
        motivo_correccion: corrMotivo.trim(),
      });
      showToast(
        'success',
        `Corrección v${res.version} registrada (${corrTarget.codigo_instrumento}: ${res.puntaje_total} pts).`,
      );
      setCorrTarget(null);
      await cargar();
      onDataMutated();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setCorrBusy(false);
    }
  };

  const handleEjecutarEtl = async () => {
    setEtlBusy(true);
    try {
      const res = await api.ejecutarEtl(etlCorte);
      if (res.ejecucion) {
        setEtlInfo({
          fecha_corte: res.ejecucion.fecha_corte,
          fin_ejecucion: res.ejecucion.fin_ejecucion || new Date().toISOString(),
          filas_continuidad: res.ejecucion.filas_continuidad,
          filas_cumplimiento: res.ejecucion.filas_cumplimiento,
          filas_resultados: res.ejecucion.filas_resultados,
          incidencias_detectadas: res.ejecucion.incidencias_detectadas,
        });
        showToast(
          'success',
          `ETL ejecutado al corte ${res.ejecucion.fecha_corte}: ${res.ejecucion.filas_continuidad} continuidad, ${res.ejecucion.filas_cumplimiento} cumplimiento, ${res.ejecucion.filas_resultados} pares.`,
        );
      }
      onDataMutated();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setEtlBusy(false);
    }
  };

  const opCols: TableColumn<any>[] = [
    { key: 'est', header: 'Estudiante', isRowHeader: true, render: (r) => r.codigo_anonimizado },
    { key: 'prog', header: 'Programa', render: (r) => r.codigo_programa },
    { key: 'inst', header: 'Instrumento', render: (r) => `${r.codigo_instrumento} (${r.momento})` },
    { key: 'vent', header: 'Ventana', render: (r) => `${r.fecha_ventana_inicio} → ${r.fecha_ventana_fin}` },
    {
      key: 'res',
      header: 'Estado actual',
      render: (r) =>
        r.id_resultado ? (
          <span className="text-emerald-700 font-semibold">
            v{r.numero_version}: {r.puntaje_total} pts {r.en_ventana ? '(En ventana)' : '(Tardía)'}
          </span>
        ) : (
          <span className="text-amber-700 font-semibold">Pendiente</span>
        ),
    },
    ...(canCorrectEval
      ? [
          {
            key: 'acc',
            header: 'Acción',
            render: (r: any) =>
              r.id_resultado ? (
                <button
                  type="button"
                  onClick={() => openCorreccion(r)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                  Corregir
                </button>
              ) : (
                <span className="text-xs text-slate-400">Sin envío</span>
              ),
          },
        ]
      : []),
  ];

  const sesCols: TableColumn<any>[] = [
    { key: 'prog', header: 'Programa', isRowHeader: true, render: (r) => r.codigo_programa },
    { key: 'num', header: 'Sesión #', render: (r) => `#${r.numero_sesion}` },
    { key: 'tec', header: 'Técnica', render: (r) => `${r.codigo_practica} · ${r.nombre_practica}` },
    { key: 'mod', header: 'Modalidad', render: (r) => `${r.modalidad} (${r.duracion_programada_min} min)` },
    { key: 'fec', header: 'Fecha', render: (r) => r.fecha_sesion },
    {
      key: 'est',
      header: 'Estado',
      render: (r) => (
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
            r.estado_sesion === 'REALIZADA'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : r.estado_sesion === 'CANCELADA'
                ? 'bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-sky-50 text-sky-800 border-sky-200'
          }`}
        >
          {r.estado_sesion}
        </span>
      ),
    },
    { key: 'asis', header: 'Asistieron / Faltaron', render: (r) => `${r.total_asistieron} / ${r.total_faltaron}` },
  ];

  const sesionesRealizadas = sesiones.filter((s) => s.estado_sesion === 'REALIZADA');

  const allTabs: Array<{ id: OpTab; label: string; Icon: typeof UserCheck; visible: boolean }> = [
    { id: 'asistencias', label: 'Asistencias', Icon: UserCheck, visible: canManageSessions },
    { id: 'sesiones', label: 'Sesiones', Icon: Calendar, visible: true },
    { id: 'correcciones', label: 'Correcciones', Icon: ClipboardCheck, visible: canCorrectEval },
    { id: 'etl', label: 'Control ETL', Icon: DatabaseZap, visible: isAdmin },
  ];
  const tabs = allTabs.filter((t) => t.visible);

  return (
    <div className="space-y-5">
      {/* Floating Toast Notification */}
      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-40 max-w-md rounded-2xl border px-4 py-3.5 shadow-xl flex items-start gap-3 ${
            toast.type === 'success'
              ? 'bg-slate-900 border-teal-500/40 text-white'
              : 'bg-rose-950 border-rose-500/40 text-rose-50'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <p className="text-xs leading-relaxed flex-1">{toast.text}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Cerrar notificación"
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Header & Program Filter */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Operación Transaccional OLTP &amp; Control ETL
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Captura auditada en <code>dbo.*</code> y sincronización idempotente hacia el Data Mart <code>dm.*</code>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filtrar por programa"
              value={idPrograma}
              onChange={(e) => setIdPrograma(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="">Todos los programas</option>
              {filtros?.programas.map((p) => (
                <option key={p.id_programa} value={p.id_programa}>
                  {p.codigo_programa} ({p.codigo_practica})
                </option>
              ))}
            </select>

            {canManageSessions && (
              <button
                type="button"
                onClick={() => {
                  setNsProgramaId(idPrograma || String(filtros?.programas[0]?.id_programa || ''));
                  setNsPracticaId(String(practicasUnicomponente[0]?.id_practica || ''));
                  setSesionModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
              >
                <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
                Programar sesión
              </button>
            )}

            <button
              type="button"
              onClick={cargar}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Actualizar
            </button>
          </div>
        </div>

        {/* Clean Internal Tabs */}
        <div role="tablist" aria-label="Secciones de operación" className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* TAB 1: ASISTENCIAS */}
      {activeTab === 'asistencias' && canManageSessions && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/80 flex items-center justify-center">
              <UserCheck className="w-4 h-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Registrar o Actualizar Asistencia por Sesión
              </h3>
              <p className="text-xs text-slate-500">
                Solo admite sesiones en estado <code>REALIZADA</code>. Cada cambio genera auditoría temporal en <code>dbo.historial_asistencias</code>.
              </p>
            </div>
          </div>

          <form onSubmit={handleRegistrarAsistencia} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end pt-2">
            <label className="block lg:col-span-2">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">Sesión REALIZADA</span>
              <select
                required
                value={asisSesionId}
                onChange={(e) => setAsisSesionId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-teal-500 focus:outline-none"
              >
                <option value="">Seleccione una sesión realizada…</option>
                {sesionesRealizadas.map((s) => (
                  <option key={s.id_sesion} value={s.id_sesion}>
                    {s.codigo_programa} · #{s.numero_sesion} ({s.fecha_sesion} · {s.codigo_practica})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">ID Asignación</span>
              <input
                type="number"
                min={1}
                required
                placeholder="Ej. 101"
                value={asisAsignacionId}
                onChange={(e) => setAsisAsignacionId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs font-medium text-slate-800 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">Estado</span>
              <select
                value={asisEstado}
                onChange={(e) => setAsisEstado(e.target.value as 'ASISTIO' | 'INASISTENCIA' | 'RETIRO_BAJA')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs font-medium text-slate-800 focus:bg-white"
              >
                <option value="ASISTIO">ASISTIO</option>
                <option value="INASISTENCIA">INASISTENCIA</option>
                <option value="RETIRO_BAJA">RETIRO_BAJA</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              {asisEstado === 'ASISTIO' && (
                <label className="block w-20">
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Min.</span>
                  <input
                    type="number"
                    min={1}
                    max={480}
                    required
                    value={asisMinutos}
                    onChange={(e) => setAsisMinutos(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2.5 text-xs font-medium text-slate-800 focus:bg-white"
                  />
                </label>
              )}
              <button
                type="submit"
                disabled={asisBusy}
                className="flex-1 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {asisBusy ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 2: SESIONES */}
      {activeTab === 'sesiones' && (
        loading && !sesiones.length ? (
          <TableSkeleton rows={6} cols={7} />
        ) : (
          <ResponsiveTable
            caption="Programación y estado de sesiones (solo sesiones REALIZADA computan asistencias)"
            columns={sesCols}
            rows={sesiones}
            rowKey={(r) => r.id_sesion}
          />
        )
      )}

      {/* TAB 3: CORRECCIONES */}
      {activeTab === 'correcciones' && canCorrectEval && (
        loading && !oportunidades.length ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
          <ResponsiveTable
            caption="Oportunidades de evaluación PSS-10 / PCL-5 y corrección versionada"
            columns={opCols}
            rows={oportunidades}
            rowKey={(r) => r.id_oportunidad}
          />
        )
      )}

      {/* TAB 4: CONTROL ETL (ADMIN) */}
      {activeTab === 'etl' && isAdmin && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-slate-900 text-teal-400 flex items-center justify-center shrink-0">
                <DatabaseZap className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Sincronización Idempotente del Data Mart (ETL)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ejecuta <code>dm.usp_ejecutar_etl @fecha_corte</code>, actualiza dimensiones/hechos y registra incidencias de calidad.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span>Fecha de corte:</span>
                <input
                  type="date"
                  value={etlCorte}
                  onChange={(e) => setEtlCorte(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800"
                />
              </label>
              <button
                type="button"
                disabled={etlBusy}
                onClick={handleEjecutarEtl}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-600 disabled:opacity-50 transition-colors"
              >
                <DatabaseZap className={`w-4 h-4 ${etlBusy ? 'animate-pulse' : ''}`} aria-hidden="true" />
                {etlBusy ? 'Ejecutando ETL…' : 'Ejecutar ETL / Actualizar Data Mart'}
              </button>
            </div>
          </div>

          {etlInfo ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-slate-100">
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5">
                <div className="text-[11px] font-semibold text-slate-500">Última actualización</div>
                <div className="text-xs font-bold text-slate-900 mt-1">
                  {new Date(etlInfo.fin_ejecucion).toLocaleString('es-PE')}
                </div>
              </div>
              <div className="rounded-xl bg-emerald-50/60 border border-emerald-200/70 p-3.5">
                <div className="text-[11px] font-semibold text-emerald-800">Hecho Continuidad</div>
                <div className="font-display text-xl font-extrabold text-emerald-950 tabular-nums mt-0.5">
                  {etlInfo.filas_continuidad.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-indigo-50/60 border border-indigo-200/70 p-3.5">
                <div className="text-[11px] font-semibold text-indigo-800">Hecho Cumplimiento</div>
                <div className="font-display text-xl font-extrabold text-indigo-950 tabular-nums mt-0.5">
                  {etlInfo.filas_cumplimiento.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-teal-50/60 border border-teal-200/70 p-3.5">
                <div className="text-[11px] font-semibold text-teal-800">Pares Válidos</div>
                <div className="font-display text-xl font-extrabold text-teal-950 tabular-nums mt-0.5">
                  {etlInfo.filas_resultados.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-amber-50/60 border border-amber-200/70 p-3.5">
                <div className="text-[11px] font-semibold text-amber-800">Incidencias Calidad</div>
                <div className="font-display text-xl font-extrabold text-amber-950 tabular-nums mt-0.5">
                  {etlInfo.incidencias_detectadas.toLocaleString()}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-4 text-xs text-slate-500">
              Presiona <strong>Ejecutar ETL / Actualizar Data Mart</strong> para regenerar los hechos del corte seleccionado y consultar el log de carga e incidencias de calidad.
            </div>
          )}
        </section>
      )}

      {/* Modal: Programar nueva sesión */}
      <ModalDialog
        open={sesionModalOpen}
        onClose={() => setSesionModalOpen(false)}
        title="Programar nueva sesión"
        subtitle="Cada sesión debe usar una técnica concreta (P-01 a P-04), nunca MIXTO."
      >
        <form onSubmit={handleCrearSesion} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Programa</span>
              <select
                required
                value={nsProgramaId}
                onChange={(e) => setNsProgramaId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                {filtros?.programas.map((p) => (
                  <option key={p.id_programa} value={p.id_programa}>
                    {p.codigo_programa} · {p.nombre_programa}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Número de sesión</span>
              <input
                type="number"
                min={1}
                required
                value={nsNumero}
                onChange={(e) => setNsNumero(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Técnica (P-01 a P-04)</span>
              <select
                required
                value={nsPracticaId}
                onChange={(e) => setNsPracticaId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                {practicasUnicomponente.map((p) => (
                  <option key={p.id_practica} value={p.id_practica}>
                    {p.codigo_practica} · {p.nombre_practica}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Modalidad</span>
              <select
                value={nsModalidad}
                onChange={(e) => setNsModalidad(e.target.value as 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="PRESENCIAL">PRESENCIAL</option>
                <option value="VIRTUAL">VIRTUAL</option>
                <option value="HIBRIDA">HIBRIDA</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Duración (min)</span>
              <input
                type="number"
                min={5}
                max={480}
                required
                value={nsDuracion}
                onChange={(e) => setNsDuracion(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Fecha</span>
              <input
                type="date"
                required
                value={nsFecha}
                onChange={(e) => setNsFecha(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Hora de inicio</span>
              <input
                type="time"
                required
                value={nsHora}
                onChange={(e) => setNsHora(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Estado inicial</span>
              <select
                value={nsEstado}
                onChange={(e) => setNsEstado(e.target.value as 'PROGRAMADA' | 'REALIZADA')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="PROGRAMADA">PROGRAMADA</option>
                <option value="REALIZADA">REALIZADA</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setSesionModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={nsBusy}
              className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {nsBusy ? 'Guardando…' : 'Guardar sesión'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal: Corregir evaluación con motivo */}
      <ModalDialog
        open={Boolean(corrTarget)}
        onClose={() => setCorrTarget(null)}
        title={
          corrTarget
            ? `Corregir evaluación · ${corrTarget.codigo_instrumento} (${corrTarget.momento})`
            : 'Corregir evaluación'
        }
        subtitle={
          corrTarget
            ? `${corrTarget.codigo_anonimizado} · ${corrTarget.codigo_programa} · Se creará una nueva versión auditada`
            : undefined
        }
      >
        {corrTarget && (
          <form onSubmit={handleCorregirEvaluacion} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Fecha de realización</span>
                <input
                  type="date"
                  required
                  value={corrFecha}
                  onChange={(e) => setCorrFecha(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo de corrección (mín. 6 caracteres)
                </span>
                <input
                  type="text"
                  required
                  minLength={6}
                  maxLength={150}
                  placeholder="Ej. Rectificación validada por área de evaluación"
                  value={corrMotivo}
                  onChange={(e) => setCorrMotivo(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">
                Respuestas por ítem (escala 0 a 4 · el servidor aplica inversión automática en PSS-10):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.keys(corrRespuestas)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map((num) => (
                    <label
                      key={num}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-semibold text-slate-700">#{num}</span>
                      <select
                        value={corrRespuestas[num]}
                        onChange={(e) =>
                          setCorrRespuestas((old) => ({ ...old, [num]: Number(e.target.value) }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold"
                      >
                        {[0, 1, 2, 3, 4].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCorrTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={corrBusy}
                className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {corrBusy ? 'Registrando versión…' : 'Guardar corrección'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
