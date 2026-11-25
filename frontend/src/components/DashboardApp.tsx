'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Calendar,
  ChevronRight,
  ClipboardCheck,
  DatabaseZap,
  Edit3,
  Filter,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { BrandLogo } from './BrandLogo';
import { LoginScreen } from './LoginScreen';
import { ResumenEjecutivoView } from './ResumenEjecutivoView';
import { TableroVisualView } from './TableroVisualView';
import { EvolucionReport } from './EvolucionReport';
import { EfectividadPracticaReport } from './EfectividadPracticaReport';
import { ContinuidadReport } from './ContinuidadReport';
import { CumplimientoReport } from './CumplimientoReport';
import { OperacionView, type OpTab } from './OperacionView';
import { StudentEvaluations } from './StudentEvaluations';
import { AdminStudentAccounts } from './AdminStudentAccounts';

type SeccionId =
  | 'resumen'
  | 'tablero'
  | 'evolucion'
  | 'practicas'
  | 'continuidad'
  | 'cumplimiento'
  | 'oltp-estudiantes'
  | 'oltp-asistencias'
  | 'oltp-sesiones'
  | 'oltp-correcciones'
  | 'etl-control'
  | 'usuarios';

interface NavItem {
  id: SeccionId;
  label: string;
  shortLabel: string;
  subtitle: string;
  section: string;
  Icon: typeof Activity;
  allowedRoles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'resumen',
    label: 'Resumen Ejecutivo',
    shortLabel: 'Resumen',
    subtitle: 'KPI-01 a KPI-05',
    section: 'Analítica BI',
    Icon: LayoutDashboard,
  },
  {
    id: 'tablero',
    label: 'Tablero Visual BI',
    shortLabel: 'Tablero BI',
    subtitle: 'Gráficos · Cross-Filter',
    section: 'Analítica BI',
    Icon: BarChart3,
  },
  {
    id: 'evolucion',
    label: 'RG-01 · Evolución Estrés y Trauma',
    shortLabel: 'RG-01 · Evolución',
    subtitle: 'KPI-01 · KPI-02 · Tabla',
    section: 'Reportes Gerenciales',
    Icon: Activity,
  },
  {
    id: 'practicas',
    label: 'RG-02 · Efectividad por Práctica',
    shortLabel: 'RG-02 · Prácticas',
    subtitle: 'KPI-05 · Tabla',
    section: 'Reportes Gerenciales',
    Icon: Award,
  },
  {
    id: 'continuidad',
    label: 'RO-01 · Continuidad y Abandono',
    shortLabel: 'RO-01 · Continuidad',
    subtitle: 'KPI-03 · Tabla',
    section: 'Reportes Operativos',
    Icon: Users,
  },
  {
    id: 'cumplimiento',
    label: 'RO-02 · Control de Evaluaciones',
    shortLabel: 'RO-02 · Evaluaciones',
    subtitle: 'KPI-04 · Tabla',
    section: 'Reportes Operativos',
    Icon: ClipboardCheck,
  },
  {
    id: 'oltp-estudiantes',
    label: 'Estudiantes e Inscripciones',
    shortLabel: 'Estudiantes',
    subtitle: 'Padrón y matrícula dbo.estudiantes',
    section: 'Operación Transaccional (OLTP)',
    Icon: GraduationCap,
    allowedRoles: ['ADMIN', 'COORDINACION'],
  },
  {
    id: 'oltp-asistencias',
    label: 'Asistencias',
    shortLabel: 'Asistencias',
    subtitle: 'Registro en dbo.asistencias',
    section: 'Operación Transaccional (OLTP)',
    Icon: UserCheck,
    allowedRoles: ['ADMIN', 'COORDINACION'],
  },
  {
    id: 'oltp-sesiones',
    label: 'Sesiones',
    shortLabel: 'Sesiones',
    subtitle: 'Programación dbo.sesiones',
    section: 'Operación Transaccional (OLTP)',
    Icon: Calendar,
    allowedRoles: ['ADMIN', 'COORDINACION', 'EVALUACION'],
  },
  {
    id: 'oltp-correcciones',
    label: 'Correcciones',
    shortLabel: 'Correcciones',
    subtitle: 'Versiones dbo.resultados',
    section: 'Operación Transaccional (OLTP)',
    Icon: Edit3,
    allowedRoles: ['ADMIN', 'EVALUACION'],
  },
  {
    id: 'etl-control',
    label: 'Control ETL & Calidad',
    shortLabel: 'Control ETL',
    subtitle: 'Carga a dm.* e incidencias',
    section: 'Gobierno de Datos & ETL',
    Icon: DatabaseZap,
    allowedRoles: ['ADMIN'],
  },
  {
    id: 'usuarios',
    label: 'Cuentas Estudiantiles',
    shortLabel: 'Cuentas',
    subtitle: 'Acceso PSS-10 / PCL-5',
    section: 'Gobierno de Datos & ETL',
    Icon: UserPlus,
    allowedRoles: ['ADMIN'],
  },
];

const SECCION_TO_OP_TAB: Partial<Record<SeccionId, OpTab>> = {
  'oltp-estudiantes': 'estudiantes',
  'oltp-asistencias': 'asistencias',
  'oltp-sesiones': 'sesiones',
  'oltp-correcciones': 'correcciones',
  'etl-control': 'etl',
};

function getInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase() || 'US';
}

export function DashboardApp() {
  const [authState, setAuthState] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    id_usuario: number;
    id_estudiante: number | null;
    nombre_usuario: string;
    rol: string;
  } | null>(null);

  const [seccion, setSeccion] = useState<SeccionId>('resumen');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [globalFiltersOpen, setGlobalFiltersOpen] = useState(false);

  // Global context filters
  const [semestre, setSemestre] = useState<string>('2026-II');
  const [corte, setCorte] = useState<string>('2026-11-23');
  const [facultadGlobal, setFacultadGlobal] = useState<string>('');
  const [practicaGlobal, setPracticaGlobal] = useState<string>('');
  const [programaGlobal, setProgramaGlobal] = useState<string>('');
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const [filtros, setFiltros] = useState<FiltrosResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mobileDrawerRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    api
      .me()
      .then((user) => {
        setCurrentUser(user);
        setAuthState('signed-in');
      })
      .catch(() => setAuthState('signed-out'));
  }, []);

  // Sync native <dialog> for mobile nav drawer
  useEffect(() => {
    const dialog = mobileDrawerRef.current;
    if (!dialog) return;
    if (mobileNavOpen && !dialog.open) {
      dialog.showModal();
    } else if (!mobileNavOpen && dialog.open) {
      dialog.close();
    }
  }, [mobileNavOpen]);

  useEffect(() => {
    const dialog = mobileDrawerRef.current;
    if (!dialog) return;
    const onClose = () => {
      dialog.returnValue = '';
      setMobileNavOpen(false);
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setLoginError(null);
    setLoginBusy(true);
    try {
      const result = await api.login({ username, password });
      setCurrentUser(result.user);
      setAuthState('signed-in');
    } catch (e: any) {
      setLoginError(e.message || 'Credenciales inválidas.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setAuthState('signed-out');
  };

  const cargarCabecera = useCallback(async () => {
    setError(null);
    try {
      const f = await api.getFiltros();
      setFiltros(f);
    } catch (e: any) {
      setError(`No se pudo conectar al backend NestJS: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    if (authState === 'signed-in' && currentUser?.rol !== 'ESTUDIANTE') {
      cargarCabecera();
    }
  }, [cargarCabecera, authState, currentUser?.rol]);

  const handleDataMutated = () => {
    setRefreshTick((t) => t + 1);
    cargarCabecera();
  };

  const globalFilterCount = [
    semestre !== '2026-II' ? semestre || 'ALL' : '',
    corte !== '2026-11-23' ? corte : '',
    facultadGlobal,
    practicaGlobal,
    programaGlobal,
  ].filter(Boolean).length;

  const clearGlobalFilters = () => {
    setSemestre('2026-II');
    setCorte('2026-11-23');
    setFacultadGlobal('');
    setPracticaGlobal('');
    setProgramaGlobal('');
  };

  if (authState !== 'signed-in') {
    return (
      <LoginScreen
        checking={authState === 'checking'}
        busy={loginBusy}
        error={loginError}
        onSubmit={handleLogin}
      />
    );
  }

  if (currentUser?.rol === 'ESTUDIANTE') {
    return <StudentEvaluations username={currentUser.nombre_usuario} onLogout={handleLogout} />;
  }

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.allowedRoles || item.allowedRoles.includes(currentUser?.rol || ''),
  );
  const groupedSections = Array.from(new Set(visibleNavItems.map((i) => i.section)));
  const activeNav = visibleNavItems.find((n) => n.id === seccion) || visibleNavItems[0];

  const renderSidebarNav = (isMobile = false) => (
    <div className="flex flex-col h-full bg-[#0B1220] text-slate-200 select-none">
      {/* Brand Header */}
      <div
        className={`h-16 px-4 border-b border-slate-800/80 flex items-center ${
          !isMobile && sidebarCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        <BrandLogo variant="dark" compact={!isMobile && sidebarCollapsed} subtitle="UNT · 2026-II" />
        {isMobile ? (
          <button
            type="button"
            autoFocus
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar menú de navegación"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : !sidebarCollapsed ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Colapsar barra lateral"
            title="Colapsar sidebar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* Expand button when collapsed */}
      {!isMobile && sidebarCollapsed && (
        <div className="px-2 pt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expandir barra lateral"
            title="Expandir sidebar"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Navigation Groups */}
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groupedSections.map((groupName) => {
          const items = visibleNavItems.filter((i) => i.section === groupName);
          return (
            <div key={groupName} className="space-y-1">
              {(!sidebarCollapsed || isMobile) && (
                <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {groupName}
                </div>
              )}
              {items.map(({ id, shortLabel, subtitle, Icon }) => {
                const active = seccion === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    title={!isMobile && sidebarCollapsed ? shortLabel : undefined}
                    onClick={() => {
                      setSeccion(id);
                      if (isMobile) setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all ${
                      !isMobile && sidebarCollapsed ? 'justify-center' : ''
                    } ${
                      active
                        ? 'bg-teal-500/15 text-teal-300 border border-teal-400/25 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${active ? 'text-teal-400' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                    {(!sidebarCollapsed || isMobile) && (
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate leading-tight">{shortLabel}</div>
                        <div className={`text-[10px] truncate mt-0.5 ${active ? 'text-teal-200/80' : 'text-slate-500'}`}>
                          {subtitle}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer: Data Mart status + User Profile + Logout */}
      <div className="border-t border-slate-800/80 p-3 space-y-3">
        {(!sidebarCollapsed || isMobile) && (
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-teal-300">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" aria-hidden="true" />
                Data Mart Activo
              </span>
              <span className="font-mono text-[10px] text-slate-400">dm.*</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Último corte cargado: <strong className="text-slate-200">{corte}</strong>
            </div>
          </div>
        )}

        <div
          className={`flex items-center gap-2.5 ${
            !isMobile && sidebarCollapsed ? 'flex-col' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
              {getInitials(currentUser?.nombre_usuario || 'US')}
            </div>
            {(!sidebarCollapsed || isMobile) && (
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {currentUser?.nombre_usuario}
                </div>
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-teal-300">
                  {currentUser?.rol}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="rounded-xl p-2 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F1F5F9]">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:block sticky top-0 h-screen shrink-0 transition-all duration-200 border-r border-slate-800/80 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {renderSidebarNav(false)}
      </aside>

      {/* Mobile Native Slide-Over Drawer */}
      <dialog
        ref={mobileDrawerRef}
        aria-label="Menú de navegación"
        {...({ closedby: 'any' } as Record<string, string>)}
        className="mwg-nav-drawer lg:hidden"
      >
        {renderSidebarNav(true)}
      </dialog>

      {/* Main App Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Contextual Topbar */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between gap-3">
            {/* Left: Mobile Menu + Breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Abrir menú de navegación"
                className="lg:hidden rounded-xl p-2 text-slate-600 hover:bg-slate-100"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </button>

              <nav aria-label="Ruta actual" className="flex items-center gap-1.5 text-xs min-w-0">
                <span className="hidden sm:inline text-slate-400 font-medium">{activeNav.section}</span>
                <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />
                <span className="font-display text-sm sm:text-[15px] font-bold text-slate-900 truncate">
                  {activeNav.label}
                </span>
              </nav>
            </div>

            {/* Right: Context Pills + Global Filters + Refresh */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200/80 px-3 py-1 text-xs font-semibold text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                <span>{semestre || 'Todos'}</span>
                <span className="text-slate-300">·</span>
                <span className="tabular-nums text-slate-600">{corte}</span>
              </div>

              <button
                type="button"
                onClick={() => setGlobalFiltersOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  globalFiltersOpen || globalFilterCount > 0
                    ? 'border-teal-300 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Filtros globales</span>
                {globalFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-[10px] font-bold text-white">
                    {globalFilterCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleDataMutated}
                aria-label="Recargar datos del Data Mart"
                title="Recargar datos"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-teal-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Collapsible Global Filters Panel */}
          {globalFiltersOpen && (
            <div className="pb-4 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-3">
              <label className="block min-w-[140px]">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">Semestre</span>
                <select
                  value={semestre}
                  onChange={(e) => setSemestre(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                >
                  {(filtros?.semestres?.length ? filtros.semestres : ['2026-II']).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="">Todos los semestres</option>
                </select>
              </label>

              <label className="block min-w-[150px]">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">Corte global</span>
                <input
                  type="date"
                  value={corte}
                  onChange={(e) => setCorte(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                />
              </label>

              {(seccion === 'resumen' || seccion === 'tablero') && (
                <>
                  <label className="block min-w-[170px]">
                    <span className="block text-[11px] font-semibold text-slate-500 mb-1">Facultad / Área</span>
                    <select
                      value={facultadGlobal}
                      onChange={(e) => setFacultadGlobal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      <option value="">Todas las facultades</option>
                      {filtros?.facultades.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block min-w-[170px]">
                    <span className="block text-[11px] font-semibold text-slate-500 mb-1">Práctica</span>
                    <select
                      value={practicaGlobal}
                      onChange={(e) => setPracticaGlobal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      <option value="">Todas las prácticas</option>
                      {filtros?.practicas.map((p) => (
                        <option key={p.id_practica} value={p.id_practica}>
                          {p.codigo_practica} · {p.nombre_practica}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {globalFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearGlobalFilters}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  Restablecer
                </button>
              )}
            </div>
          )}
        </header>

        {/* Main Content Canvas */}
        <main id="main-content" className="p-4 sm:p-6 lg:p-7 space-y-6 flex-1 max-w-[1600px] w-full mx-auto">
          {error && (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <strong>Error de conexión:</strong> {error}
            </div>
          )}

          {seccion === 'resumen' && (
            <ResumenEjecutivoView
              key={`res-${refreshTick}`}
              filtros={filtros}
              corte={corte}
              semestre={semestre}
              facultadGlobal={facultadGlobal}
              practicaGlobal={practicaGlobal}
              programaGlobal={programaGlobal}
              onNavigate={(target) => setSeccion(target)}
            />
          )}

          {seccion === 'tablero' && (
            <TableroVisualView
              key={`tab-${refreshTick}`}
              filtros={filtros}
              corte={corte}
              semestre={semestre}
              facultadGlobal={facultadGlobal}
              practicaGlobal={practicaGlobal}
              programaGlobal={programaGlobal}
              onNavigateReport={(target) => setSeccion(target)}
            />
          )}

          {seccion === 'evolucion' && (
            <EvolucionReport
              key={`ev-${refreshTick}-${corte}`}
              filtros={filtros}
              corteInicial={corte}
              semestre={semestre}
            />
          )}

          {seccion === 'practicas' && (
            <EfectividadPracticaReport
              key={`pr-${refreshTick}-${corte}`}
              filtros={filtros}
              corteInicial={corte}
              semestre={semestre}
            />
          )}

          {seccion === 'continuidad' && (
            <ContinuidadReport
              key={`co-${refreshTick}-${corte}`}
              filtros={filtros}
              corteInicial={corte}
              semestre={semestre}
            />
          )}

          {seccion === 'cumplimiento' && (
            <CumplimientoReport
              key={`cu-${refreshTick}-${corte}`}
              filtros={filtros}
              corteInicial={corte}
              semestre={semestre}
            />
          )}

          {SECCION_TO_OP_TAB[seccion] && (
            <OperacionView
              activeTab={SECCION_TO_OP_TAB[seccion]!}
              filtros={filtros}
              userRole={currentUser?.rol || ''}
              onDataMutated={handleDataMutated}
            />
          )}

          {seccion === 'usuarios' && currentUser?.rol === 'ADMIN' && (
            <AdminStudentAccounts onLogout={handleLogout} />
          )}
        </main>
      </div>
    </div>
  );
}
