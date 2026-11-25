'use client';

import { useEffect, useState } from 'react';
import {
  CalendarPlus,
  ClipboardCheck,
  DatabaseZap,
  Edit3,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { ResponsiveTable, type TableColumn } from './ResponsiveTable';
import { ModalDialog } from './ModalDialog';

interface OperacionViewProps {
  filtros: FiltrosResponse | null;
  userRole: string;
  onDataMutated: () => void;
}

export function OperacionView({ filtros, userRole, onDataMutated }: OperacionViewProps) {
  const [idPrograma, setIdPrograma] = useState<string>('');
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // 1. Formulario de asistencia
  const [asisSesionId, setAsisSesionId] = useState<string>('');
  const [asisAsignacionId, setAsisAsignacionId] = useState<string>('');
  const [asisEstado, setAsisEstado] = useState<'ASISTIO' | 'INASISTENCIA' | 'RETIRO_BAJA'>('ASISTIO');
  const [asisMinutos, setAsisMinutos] = useState<string>('45');
  const [asisBusy, setAsisBusy] = useState(false);

  // 2. Modal de nueva sesión
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

  // 3. Modal de corrección de evaluación (ADMIN / EVALUACION)
  const [corrTarget, setCorrTarget] = useState<any | null>(null);
  const [corrFecha, setCorrFecha] = useState<string>('2026-11-23');
  const [corrMotivo, setCorrMotivo] = useState<string>('');
  const [corrRespuestas, setCorrRespuestas] = useState<Record<number, number>>({});
  const [corrBusy, setCorrBusy] = useState(false);

  // 4. Botón ETL (ADMIN)
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

  const canManageSessions = userRole === 'ADMIN' || userRole === 'COORDINACION';
  const canCorrectEval = userRole === 'ADMIN' || userRole === 'EVALUACION';
  const isAdmin = userRole === 'ADMIN';

  const practicasUnicomponente = (filtros?.practicas || []).filter((p) => !p.es_mixto);

  const cargar = async () => {
    setLoading(true);
    try {
      const [ses, ops] = await Promise.all([
        api.getSesiones(idPrograma || undefined),
        canCorrectEval
          ? api.getOportunidadesAbiertas(idPrograma || undefined)
          : Promise.resolve([]),
      ]);
      setSesiones(ses);
      setOportunidades(ops);
      setError(null);
    } catch (e: any) {
      setError(e.message);
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
    setError(null);
    setStatusMsg(null);
    setAsisBusy(true);
    try {
      const res = await api.registrarAsistencia({
        id_sesion: Number(asisSesionId),
        id_asignacion: Number(asisAsignacionId),
        estado_asistencia: asisEstado,
        minutos_asistidos: asisEstado === 'ASISTIO' ? Number(asisMinutos) : 0,
      });
      setStatusMsg(res.mensaje);
      setAsisAsignacionId('');
      await cargar();
      onDataMutated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAsisBusy(false);
    }
  };

  const handleCrearSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
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
      setStatusMsg(`${res.mensaje} (${res.sesion?.codigo_programa} · Sesión #${res.sesion?.numero_sesion})`);
      setSesionModalOpen(false);
      await cargar();
      onDataMutated();
    } catch (err: any) {
      setError(err.message);
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
    setError(null);
    setStatusMsg(null);
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
      setStatusMsg(
        `Corrección v${res.version} registrada (${corrTarget.codigo_instrumento}: ${res.puntaje_total} pts). ${res.mensaje}`,
      );
      setCorrTarget(null);
      await cargar();
      onDataMutated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCorrBusy(false);
    }
  };

  const handleEjecutarEtl = async () => {
    setError(null);
    setStatusMsg(null);
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
        setStatusMsg(
          `ETL ejecutado correctamente al corte ${res.ejecucion.fecha_corte} (${res.ejecucion.filas_continuidad} continuidad, ${res.ejecucion.filas_cumplimiento} cumplimiento, ${res.ejecucion.filas_resultados} pares).`,
        );
      }
      onDataMutated();
    } catch (err: any) {
      setError(err.message);
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
          <span className="text-emerald-700 font-medium">
            v{r.numero_version}: {r.puntaje_total} pts {r.en_ventana ? '(En ventana)' : '(Tardía)'}
          </span>
        ) : (
          <span className="text-amber-800 font-medium">Pendiente</span>
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
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            r.estado_sesion === 'REALIZADA'
              ? 'bg-emerald-50 text-emerald-800'
              : r.estado_sesion === 'CANCELADA'
                ? 'bg-slate-100 text-slate-700'
                : 'bg-sky-50 text-sky-800'
          }`}
        >
          {r.estado_sesion}
        </span>
      ),
    },
    { key: 'asis', header: 'Asistieron / Faltaron', render: (r) => `${r.total_asistieron} / ${r.total_faltaron}` },
  ];

  const sesionesRealizadas = sesiones.filter((s) => s.estado_sesion === 'REALIZADA');

  return (
    <div className="space-y-6">
      {/* Cabecera de filtros y acciones rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Operación Transaccional OLTP y Data Mart</h2>
          <p className="text-sm text-slate-600">
            Registro auditado de asistencias, programación de sesiones, corrección versionada y carga ETL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="op-prog-filter" className="text-sm font-medium text-slate-700">
            Programa:
          </label>
          <select
            id="op-prog-filter"
            value={idPrograma}
            onChange={(e) => setIdPrograma(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              Programar sesión
            </button>
          )}
          <button
            type="button"
            onClick={cargar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      )}
      {statusMsg && (
        <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
          {statusMsg}
        </p>
      )}

      {/* Panel ETL para ADMIN */}
      {isAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-slate-900">Actualización del Data Mart (ETL)</h3>
                <p className="text-xs text-slate-600">
                  Invoca <code>dm.usp_ejecutar_etl</code> de forma idempotente y refresca los 4 reportes BI.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <span>Corte:</span>
                <input
                  type="date"
                  value={etlCorte}
                  onChange={(e) => setEtlCorte(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </label>
              <button
                type="button"
                disabled={etlBusy}
                onClick={handleEjecutarEtl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <DatabaseZap className={`w-3.5 h-3.5 ${etlBusy ? 'animate-pulse' : ''}`} aria-hidden="true" />
                {etlBusy ? 'Ejecutando ETL…' : 'Ejecutar ETL / Actualizar Data Mart'}
              </button>
            </div>
          </div>

          {etlInfo && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100 text-xs">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <div className="text-slate-500">Última actualización</div>
                <div className="font-semibold text-slate-900">
                  {new Date(etlInfo.fin_ejecucion).toLocaleString('es-PE')}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <div className="text-slate-500">Continuidad</div>
                <div className="font-semibold text-slate-900 tabular-nums">{etlInfo.filas_continuidad}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <div className="text-slate-500">Cumplimiento</div>
                <div className="font-semibold text-slate-900 tabular-nums">{etlInfo.filas_cumplimiento}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <div className="text-slate-500">Pares válidos</div>
                <div className="font-semibold text-slate-900 tabular-nums">{etlInfo.filas_resultados}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <div className="text-slate-500">Incidencias</div>
                <div className="font-semibold text-slate-900 tabular-nums">{etlInfo.incidencias_detectadas}</div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Formulario interactivo de registro de asistencia */}
      {canManageSessions && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h3 className="font-semibold text-slate-900">Registrar / Actualizar Asistencia (con auditoría temporal)</h3>
          </div>
          <form onSubmit={handleRegistrarAsistencia} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <label className="block lg:col-span-2">
              <span className="block text-xs font-medium text-slate-600 mb-1">Sesión REALIZADA</span>
              <select
                required
                value={asisSesionId}
                onChange={(e) => setAsisSesionId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
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
              <span className="block text-xs font-medium text-slate-600 mb-1">ID Asignación</span>
              <input
                type="number"
                min={1}
                required
                placeholder="Ej. 101"
                value={asisAsignacionId}
                onChange={(e) => setAsisAsignacionId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Estado</span>
              <select
                value={asisEstado}
                onChange={(e) => setAsisEstado(e.target.value as 'ASISTIO' | 'INASISTENCIA' | 'RETIRO_BAJA')}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
              >
                <option value="ASISTIO">ASISTIO</option>
                <option value="INASISTENCIA">INASISTENCIA</option>
                <option value="RETIRO_BAJA">RETIRO_BAJA</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              {asisEstado === 'ASISTIO' && (
                <label className="block w-24">
                  <span className="block text-xs font-medium text-slate-600 mb-1">Minutos</span>
                  <input
                    type="number"
                    min={1}
                    max={480}
                    required
                    value={asisMinutos}
                    onChange={(e) => setAsisMinutos(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white"
                  />
                </label>
              )}
              <button
                type="submit"
                disabled={asisBusy}
                className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {asisBusy ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <h3 className="font-semibold text-slate-900">Cuestionarios completos (PSS-10 y PCL-5)</h3>
        </div>
        <p className="mt-1.5 text-sm text-slate-600">
          Los puntajes se calculan en el servidor a partir de respuestas por ítem. Las correcciones de roles autorizados crean una nueva versión conservando el historial.
        </p>
      </section>

      {canCorrectEval && (
        <ResponsiveTable
          caption="Oportunidades de evaluación aplicables y su estado actual"
          columns={opCols}
          rows={oportunidades}
          rowKey={(r) => r.id_oportunidad}
        />
      )}

      <ResponsiveTable
        caption="Programación y estado de sesiones (solo sesiones REALIZADA computan asistencias)"
        columns={sesCols}
        rows={sesiones}
        rowKey={(r) => r.id_sesion}
      />

      {/* Modal ligero: Programar nueva sesión */}
      <ModalDialog
        open={sesionModalOpen}
        onClose={() => setSesionModalOpen(false)}
        title="Programar nueva sesión"
        subtitle="Cada sesión debe usar una técnica concreta (P-01 a P-04), nunca MIXTO."
      >
        <form onSubmit={handleCrearSesion} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="block text-xs font-medium text-slate-700 mb-1">Programa</span>
              <select
                required
                value={nsProgramaId}
                onChange={(e) => setNsProgramaId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                {filtros?.programas.map((p) => (
                  <option key={p.id_programa} value={p.id_programa}>
                    {p.codigo_programa} · {p.nombre_programa}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Número de sesión</span>
              <input
                type="number"
                min={1}
                required
                value={nsNumero}
                onChange={(e) => setNsNumero(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Técnica (P-01 a P-04)</span>
              <select
                required
                value={nsPracticaId}
                onChange={(e) => setNsPracticaId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                {practicasUnicomponente.map((p) => (
                  <option key={p.id_practica} value={p.id_practica}>
                    {p.codigo_practica} · {p.nombre_practica}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Modalidad</span>
              <select
                value={nsModalidad}
                onChange={(e) => setNsModalidad(e.target.value as 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="PRESENCIAL">PRESENCIAL</option>
                <option value="VIRTUAL">VIRTUAL</option>
                <option value="HIBRIDA">HIBRIDA</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Duración (min)</span>
              <input
                type="number"
                min={5}
                max={480}
                required
                value={nsDuracion}
                onChange={(e) => setNsDuracion(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Fecha</span>
              <input
                type="date"
                required
                value={nsFecha}
                onChange={(e) => setNsFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Hora de inicio</span>
              <input
                type="time"
                required
                value={nsHora}
                onChange={(e) => setNsHora(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="block text-xs font-medium text-slate-700 mb-1">Estado inicial</span>
              <select
                value={nsEstado}
                onChange={(e) => setNsEstado(e.target.value as 'PROGRAMADA' | 'REALIZADA')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="PROGRAMADA">PROGRAMADA</option>
                <option value="REALIZADA">REALIZADA</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setSesionModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={nsBusy}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {nsBusy ? 'Guardando…' : 'Guardar sesión'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal: Corregir evaluación con motivo (ADMIN / EVALUACION) */}
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
                <span className="block text-xs font-medium text-slate-700 mb-1">Fecha de realización</span>
                <input
                  type="date"
                  required
                  value={corrFecha}
                  onChange={(e) => setCorrFecha(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-700 mb-1">
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-700 mb-2">
                Respuestas por ítem (escala 0 a 4 · el servidor aplica inversión automática en PSS-10):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.keys(corrRespuestas)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map((num) => (
                    <label
                      key={num}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-medium text-slate-700">Ítem {num}</span>
                      <select
                        value={corrRespuestas[num]}
                        onChange={(e) =>
                          setCorrRespuestas((old) => ({ ...old, [num]: Number(e.target.value) }))
                        }
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
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

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCorrTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={corrBusy}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
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
