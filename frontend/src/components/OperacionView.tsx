'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  DatabaseZap,
  Edit3,
  GraduationCap,
  RefreshCw,
  Search,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { api, type EstudianteOltpRow, type FiltrosResponse } from '@/lib/api';
import { ResponsiveTable, type TableColumn } from './ResponsiveTable';
import { ModalDialog } from './ModalDialog';
import { TableSkeleton } from './UiStates';

export type OpTab = 'estudiantes' | 'asistencias' | 'sesiones' | 'correcciones' | 'etl';

interface OperacionViewProps {
  activeTab: OpTab;
  filtros: FiltrosResponse | null;
  userRole: string;
  onDataMutated: () => void;
}

const TAB_HEADER_META: Record<
  OpTab,
  {
    layer: 'OLTP' | 'ETL';
    layerBadge: string;
    title: string;
    description: string;
  }
> = {
  estudiantes: {
    layer: 'OLTP',
    layerBadge: 'Capa Transaccional · OLTP (dbo.*)',
    title: 'Estudiantes e Inscripciones',
    description:
      'Padrón universitario (dbo.estudiantes) y matrícula en uno o múltiples programas (dbo.asignaciones) con generación automática de oportunidades PSS-10.',
  },
  asistencias: {
    layer: 'OLTP',
    layerBadge: 'Capa Transaccional · OLTP (dbo.*)',
    title: 'Registro de Asistencias',
    description: 'Captura y actualización auditada de asistencia estudiantil por sesión en dbo.asistencias.',
  },
  sesiones: {
    layer: 'OLTP',
    layerBadge: 'Capa Transaccional · OLTP (dbo.*)',
    title: 'Programación y Control de Sesiones',
    description: 'Calendario operativo de sesiones, modalidad y práctica técnica registrada en dbo.sesiones.',
  },
  correcciones: {
    layer: 'OLTP',
    layerBadge: 'Capa Transaccional · OLTP (dbo.*)',
    title: 'Corrección Versionada de Evaluaciones',
    description: 'Gestión de nuevas versiones con motivo de auditoría en dbo.resultados_evaluacion.',
  },
  etl: {
    layer: 'ETL',
    layerBadge: 'Capa Analítica · ETL hacia Data Mart (dm.*)',
    title: 'Control ETL & Calidad del Data Mart',
    description: 'Ejecución idempotente de dm.usp_ejecutar_etl, métricas de carga y monitoreo de incidencias en dm.*.',
  },
};

export function OperacionView({ activeTab, filtros, userRole, onDataMutated }: OperacionViewProps) {
  const canManageSessions = userRole === 'ADMIN' || userRole === 'COORDINACION';
  const canCorrectEval = userRole === 'ADMIN' || userRole === 'EVALUACION';
  const isAdmin = userRole === 'ADMIN';

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

  // 0. Estudiantes e Inscripciones (RQ-BI-01)
  const [estudiantes, setEstudiantes] = useState<EstudianteOltpRow[]>([]);
  const [estPaginacion, setEstPaginacion] = useState({ page: 1, pageSize: 15, totalRegistros: 0, totalPaginas: 1 });
  const [estBuscar, setEstBuscar] = useState('');
  const [estFacultad, setEstFacultad] = useState('');
  const [estPage, setEstPage] = useState(1);
  const [estLoading, setEstLoading] = useState(false);

  // Modal: Registrar Estudiante
  const [estModalOpen, setEstModalOpen] = useState(false);
  const [neCodigo, setNeCodigo] = useState('');
  const [neNombres, setNeNombres] = useState('');
  const [neApellidos, setNeApellidos] = useState('');
  const [neCorreo, setNeCorreo] = useState('');
  const [neEdad, setNeEdad] = useState('20');
  const [neSexo, setNeSexo] = useState<'F' | 'M' | 'NO_ESPECIFICADO'>('F');
  const [neFacultad, setNeFacultad] = useState('Ingeniería');
  const [neCarrera, setNeCarrera] = useState('Ingeniería de Sistemas');
  const [neCiclo, setNeCiclo] = useState('5');
  const [neBusy, setNeBusy] = useState(false);

  // Modal: Inscribir en Programa
  const [asigModalOpen, setAsigModalOpen] = useState(false);
  const [naEstudianteId, setNaEstudianteId] = useState('');
  const [naProgramaId, setNaProgramaId] = useState('');
  const [naFecha, setNaFecha] = useState('2026-11-25');
  const [naBusy, setNaBusy] = useState(false);

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

  const cargarEstudiantes = async (pageToLoad = estPage) => {
    if (!canManageSessions) return;
    setEstLoading(true);
    try {
      const res = await api.getEstudiantes({
        buscar: estBuscar.trim() || undefined,
        facultad: estFacultad || undefined,
        page: pageToLoad,
        pageSize: 15,
      });
      setEstudiantes(res.estudiantes);
      setEstPaginacion(res.paginacion);
    } catch (e: any) {
      showToast('error', e.message || 'Error al cargar el padrón de estudiantes.');
    } finally {
      setEstLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPrograma]);

  useEffect(() => {
    if (activeTab === 'estudiantes' && canManageSessions) {
      cargarEstudiantes(estPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, estPage, estFacultad]);

  const handleCrearEstudiante = async (e: React.FormEvent) => {
    e.preventDefault();
    setNeBusy(true);
    try {
      const res = await api.crearEstudiante({
        codigo_estudiante: neCodigo.trim(),
        nombres: neNombres.trim(),
        apellidos: neApellidos.trim(),
        correo_institucional: neCorreo.trim(),
        edad_anios: Number(neEdad),
        sexo_codificado: neSexo,
        facultad_o_area: neFacultad.trim(),
        carrera: neCarrera.trim(),
        ciclo_academico: Number(neCiclo),
      });
      showToast('success', res.mensaje);
      setEstModalOpen(false);
      setNeCodigo('');
      setNeNombres('');
      setNeApellidos('');
      setNeCorreo('');
      setEstPage(1);
      await cargarEstudiantes(1);
      onDataMutated();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setNeBusy(false);
    }
  };

  const openInscribirModal = (est?: EstudianteOltpRow) => {
    setNaEstudianteId(est ? String(est.id_estudiante) : String(estudiantes[0]?.id_estudiante || ''));
    const activeProg = filtros?.programas.find((p) => p.estado_programa === 'ACTIVO') || filtros?.programas[0];
    setNaProgramaId(String(activeProg?.id_programa || ''));
    setAsigModalOpen(true);
  };

  const handleCrearAsignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setNaBusy(true);
    try {
      const res = await api.crearAsignacion({
        id_estudiante: Number(naEstudianteId),
        id_programa: Number(naProgramaId),
        fecha_inscripcion: naFecha || undefined,
      });
      showToast('success', res.mensaje);
      setAsigModalOpen(false);
      await cargarEstudiantes(estPage);
      onDataMutated();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setNaBusy(false);
    }
  };

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
    {
      key: 'est',
      header: 'Estudiante',
      isRowHeader: true,
      render: (r) => (
        <div className="min-w-0">
          <div className="font-mono font-semibold text-slate-900 text-xs">{r.codigo_estudiante}</div>
          {(r.nombres || r.apellidos) && (
            <div className="text-[11px] text-slate-500 truncate">
              {r.nombres} {r.apellidos}
            </div>
          )}
        </div>
      ),
    },
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

  const estCols: TableColumn<EstudianteOltpRow>[] = [
    {
      key: 'cod',
      header: 'Código',
      isRowHeader: true,
      render: (r) => <span className="font-mono font-bold text-slate-900 text-xs">{r.codigo_estudiante}</span>,
    },
    {
      key: 'nom',
      header: 'Nombres y Apellidos',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-xs">
            {r.apellidos}, {r.nombres}
          </div>
          <div className="text-[11px] text-slate-500 truncate">{r.correo_institucional}</div>
        </div>
      ),
    },
    {
      key: 'fac',
      header: 'Facultad / Carrera',
      render: (r) => (
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-800">{r.facultad_o_area}</div>
          <div className="text-[11px] text-slate-500">{r.carrera}</div>
        </div>
      ),
    },
    {
      key: 'ciclo',
      header: 'Ciclo / Edad',
      render: (r) => (
        <span className="text-xs text-slate-700">
          Ciclo {r.ciclo_academico} · {r.edad_anios} años
        </span>
      ),
    },
    {
      key: 'progs',
      header: 'Programas inscritos',
      render: (r) => (
        <div className="space-y-1">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              r.programas_inscritos > 0
                ? 'bg-teal-50 text-teal-800 border-teal-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {r.programas_inscritos} programa(s)
          </span>
          {r.programas_codigos.length > 0 && (
            <div className="text-[10px] font-mono text-slate-500 max-w-[220px] truncate" title={r.programas_codigos.join(', ')}>
              {r.programas_codigos.join(', ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'acc',
      header: 'Matrícula',
      render: (r) => (
        <button
          type="button"
          onClick={() => openInscribirModal(r)}
          className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
          Inscribir
        </button>
      ),
    },
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
  const headerMeta = TAB_HEADER_META[activeTab];
  const isEtlLayer = headerMeta.layer === 'ETL';

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
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase border ${
                  isEtlLayer
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-teal-50 text-teal-800 border-teal-200'
                }`}
              >
                {headerMeta.layerBadge}
              </span>
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {headerMeta.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {headerMeta.description}
            </p>
          </div>
          {!isEtlLayer && activeTab === 'estudiantes' && canManageSessions && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setNeFacultad(filtros?.facultades?.[0] || 'Ingeniería');
                  setEstModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                Registrar Estudiante
              </button>

              <button
                type="button"
                onClick={() => openInscribirModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Inscribir en Programa
              </button>

              <button
                type="button"
                onClick={() => cargarEstudiantes(estPage)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${estLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Actualizar
              </button>
            </div>
          )}

          {!isEtlLayer && activeTab !== 'estudiantes' && (
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
          )}
        </div>
      </section>

      {/* TAB 0: ESTUDIANTES E INSCRIPCIONES (RQ-BI-01) */}
      {activeTab === 'estudiantes' && canManageSessions && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/80 flex items-center justify-center">
                <GraduationCap className="w-4 h-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Padrón de Estudiantes ({estPaginacion.totalRegistros.toLocaleString('es-PE')})
                </h3>
                <p className="text-xs text-slate-500">
                  Datos completos de <code>dbo.estudiantes</code> y programas matriculados en <code>dbo.asignaciones</code>.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEstPage(1);
                cargarEstudiantes(1);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Buscar código, nombre, correo…"
                  value={estBuscar}
                  onChange={(e) => setEstBuscar(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-teal-500 focus:outline-none w-56"
                />
              </div>

              <select
                aria-label="Filtrar por facultad"
                value={estFacultad}
                onChange={(e) => {
                  setEstFacultad(e.target.value);
                  setEstPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="">Todas las facultades</option>
                {(filtros?.facultades || []).map((fac) => (
                  <option key={fac} value={fac}>
                    {fac}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
              >
                Buscar
              </button>
            </form>
          </div>

          {estLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <>
              <ResponsiveTable
                caption="Padrón de estudiantes registrados en dbo.estudiantes"
                columns={estCols}
                rows={estudiantes}
                rowKey={(r) => r.id_estudiante}
              />

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
                <span>
                  Página <strong>{estPaginacion.page}</strong> de <strong>{estPaginacion.totalPaginas}</strong> ·{' '}
                  {estPaginacion.totalRegistros.toLocaleString('es-PE')} registros
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={estPaginacion.page <= 1}
                    onClick={() => setEstPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={estPaginacion.page >= estPaginacion.totalPaginas}
                    onClick={() => setEstPage((p) => Math.min(estPaginacion.totalPaginas, p + 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

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

      {/* Modal: Registrar Estudiante (RQ-BI-01) */}
      <ModalDialog
        open={estModalOpen}
        onClose={() => setEstModalOpen(false)}
        title="Registrar Estudiante"
        subtitle="Inserta un nuevo registro universitario en dbo.estudiantes (edad >= 18, ciclo 1–14)."
      >
        <form onSubmit={handleCrearEstudiante} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Código de estudiante</span>
              <input
                type="text"
                required
                minLength={3}
                maxLength={50}
                placeholder="Ej. UNT26-EST-1001"
                value={neCodigo}
                onChange={(e) => setNeCodigo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Correo institucional</span>
              <input
                type="email"
                required
                maxLength={150}
                placeholder="Ej. est1001@unitru.edu.pe"
                value={neCorreo}
                onChange={(e) => setNeCorreo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Nombres</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                placeholder="Ej. Valeria Sofía"
                value={neNombres}
                onChange={(e) => setNeNombres(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Apellidos</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                placeholder="Ej. Paredes Mendoza"
                value={neApellidos}
                onChange={(e) => setNeApellidos(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Facultad o área</span>
              <select
                required
                value={neFacultad}
                onChange={(e) => setNeFacultad(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                {(
                  filtros?.facultades?.length
                    ? filtros.facultades
                    : [
                        'Ingeniería',
                        'Ciencias Médicas',
                        'Ciencias Sociales',
                        'Educación y Ciencias de la Comunicación',
                        'Derecho y Ciencias Políticas',
                        'Ciencias Económicas',
                        'Ciencias Biológicas',
                        'Farmacia y Bioquímica',
                      ]
                ).map((fac) => (
                  <option key={fac} value={fac}>
                    {fac}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Carrera / Escuela profesional</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                placeholder="Ej. Ingeniería de Sistemas"
                value={neCarrera}
                onChange={(e) => setNeCarrera(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Edad (18–99)</span>
              <input
                type="number"
                required
                min={18}
                max={99}
                value={neEdad}
                onChange={(e) => setNeEdad(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Ciclo (1–14)</span>
              <input
                type="number"
                required
                min={1}
                max={14}
                value={neCiclo}
                onChange={(e) => setNeCiclo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Sexo</span>
              <select
                value={neSexo}
                onChange={(e) => setNeSexo(e.target.value as 'F' | 'M' | 'NO_ESPECIFICADO')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="F">F</option>
                <option value="M">M</option>
                <option value="NO_ESPECIFICADO">No especificado</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEstModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={neBusy}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {neBusy ? 'Registrando…' : 'Registrar estudiante'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal: Inscribir en Programa (RQ-BI-01) */}
      <ModalDialog
        open={asigModalOpen}
        onClose={() => setAsigModalOpen(false)}
        title="Inscribir Estudiante en Programa"
        subtitle="Registra matrícula en dbo.asignaciones (permite múltiples programas por estudiante)."
      >
        <form onSubmit={handleCrearAsignacion} className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Estudiante</span>
            <select
              required
              value={naEstudianteId}
              onChange={(e) => setNaEstudianteId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="">Selecciona un estudiante…</option>
              {estudiantes.map((e) => (
                <option key={e.id_estudiante} value={e.id_estudiante}>
                  {e.codigo_estudiante} — {e.apellidos}, {e.nombres} ({e.programas_inscritos} prog.)
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Programa</span>
            <select
              required
              value={naProgramaId}
              onChange={(e) => setNaProgramaId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="">Selecciona un programa…</option>
              {(filtros?.programas || []).map((p) => (
                <option key={p.id_programa} value={p.id_programa}>
                  {p.codigo_programa} · {p.codigo_practica} [{p.estado_programa}]
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Fecha de inscripción</span>
            <input
              type="date"
              required
              value={naFecha}
              onChange={(e) => setNaFecha(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
          </label>

          <div className="rounded-xl bg-teal-50/70 border border-teal-200/80 p-3 text-[11px] text-teal-900">
            Si el programa seleccionado está en estado <strong>ACTIVO</strong> o <strong>PLANIFICADO</strong> con ventanas vigentes, se crearán automáticamente sus oportunidades de evaluación <strong>PSS-10 (INICIAL y FINAL)</strong>.
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAsigModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={naBusy}
              className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {naBusy ? 'Inscribiendo…' : 'Confirmar inscripción'}
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
            ? `${corrTarget.codigo_estudiante}${corrTarget.nombres || corrTarget.apellidos ? ` (${[corrTarget.nombres, corrTarget.apellidos].filter(Boolean).join(' ')})` : ''} · ${corrTarget.codigo_programa} · Se creará una nueva versión auditada`
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
