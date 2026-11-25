'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { api, type FiltrosResponse } from '@/lib/api';
import { ResponsiveTable, type TableColumn } from './ResponsiveTable';

interface OperacionViewProps {
  filtros: FiltrosResponse | null;
  onDataMutated: () => void;
}

export function OperacionView({ filtros }: OperacionViewProps) {
  const [idPrograma, setIdPrograma] = useState<string>('');
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [ses, ops] = await Promise.all([
        api.getSesiones(idPrograma || undefined),
        api.getOportunidadesAbiertas(idPrograma || undefined),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Operación Transaccional OLTP (En vivo)</h2>
          <p className="text-sm text-slate-600">Consulta sesiones y oportunidades asignadas. Las respuestas y correcciones se registran mediante formularios completos.</p>
        </div>
        <div className="flex items-center gap-3">
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

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-teal-700" aria-hidden="true" /><h3 className="font-semibold text-slate-900">Cuestionarios completos</h3></div>
        <p className="mt-2 text-sm text-slate-600">Los resultados ya no se registran mediante puntajes manuales. El estudiante responde el cuestionario asignado desde su cuenta; el servidor valida los ítems y calcula el total.</p>
      </section>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}

      <ResponsiveTable
        caption="Oportunidades de evaluación aplicables y su estado actual"
        columns={opCols}
        rows={oportunidades}
        rowKey={(r) => r.id_oportunidad}
      />

      <ResponsiveTable
        caption="Programación y estado de sesiones (solo sesiones REALIZADA computan asistencias)"
        columns={sesCols}
        rows={sesiones}
        rowKey={(r) => r.id_sesion}
      />
    </div>
  );
}
