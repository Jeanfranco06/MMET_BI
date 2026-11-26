import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type SemaforoEstado = 'BUENO' | 'REGULAR' | 'MALO' | 'SIN_DATOS' | 'SUPRIMIDO';

interface FiltrosQuery {
  corte: string;
  idPrograma?: number;
  idPractica?: number;
  facultad?: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  private semaforoPss(pares: number, red: number | null): SemaforoEstado {
    if (pares === 0 || red === null) return 'SIN_DATOS';
    if (pares < 5) return 'SUPRIMIDO';
    if (red >= 4) return 'BUENO';
    if (red >= 0) return 'REGULAR';
    return 'MALO';
  }

  private semaforoPcl(pares: number, red: number | null): SemaforoEstado {
    if (pares === 0 || red === null) return 'SIN_DATOS';
    if (pares < 5) return 'SUPRIMIDO';
    if (red >= 10) return 'BUENO';
    if (red >= 0) return 'REGULAR';
    return 'MALO';
  }

  private semaforoContinuidad(evaluables: number, tasa: number | null): SemaforoEstado {
    if (evaluables === 0 || tasa === null) return 'SIN_DATOS';
    if (evaluables < 5) return 'SUPRIMIDO';
    if (tasa >= 80) return 'BUENO';
    if (tasa >= 60) return 'REGULAR';
    return 'MALO';
  }

  private semaforoCumplimiento(elegibles: number, tasa: number | null): SemaforoEstado {
    if (elegibles === 0 || tasa === null) return 'SIN_DATOS';
    if (elegibles < 5) return 'SUPRIMIDO';
    if (tasa >= 90) return 'BUENO';
    if (tasa >= 70) return 'REGULAR';
    return 'MALO';
  }

  private semaforoMetaPracticas(evaluables: number, tasa: number | null): SemaforoEstado {
    if (evaluables === 0 || tasa === null) return 'SIN_DATOS';
    if (tasa >= 80) return 'BUENO';
    if (tasa >= 60) return 'REGULAR';
    return 'MALO';
  }

  /**
   * Resuelve la fecha de corte solicitada a la clave sustituta `sk_tiempo`
   * disponible en el Data Mart (exacta o el corte cargado inmediato anterior).
   */
  private async resolveCorteDm(corte: string): Promise<{ skCorte: number; fechaAplicada: string }> {
    const clean = /^\d{4}-\d{2}-\d{2}$/.test(corte) ? corte : '2026-11-23';
    const targetSk = Number(clean.replace(/-/g, ''));

    const rows = await this.db.queryDm<{ sk_tiempo: number; fecha: string }>(
      `
      SELECT t.sk_tiempo,
        to_char(t.fecha, 'YYYY-MM-DD') AS fecha
      FROM dm.DimTiempo t
      WHERE t.sk_tiempo IN (SELECT DISTINCT sk_tiempo_corte FROM dm.HechoContinuidad)
        AND t.sk_tiempo <= @targetSk
      ORDER BY t.sk_tiempo DESC LIMIT 1`,
      { targetSk },
    );

    if (rows.length > 0) {
      return { skCorte: Number(rows[0].sk_tiempo), fechaAplicada: rows[0].fecha };
    }

    const latest = await this.db.queryDm<{ sk_tiempo: number; fecha: string }>(
      `
      SELECT t.sk_tiempo,
        to_char(t.fecha, 'YYYY-MM-DD') AS fecha
      FROM dm.DimTiempo t
      WHERE t.sk_tiempo IN (SELECT DISTINCT sk_tiempo_corte FROM dm.HechoContinuidad)
      ORDER BY t.sk_tiempo DESC LIMIT 1`,
    );

    if (latest.length > 0) {
      return { skCorte: Number(latest[0].sk_tiempo), fechaAplicada: latest[0].fecha };
    }

    return { skCorte: targetSk, fechaAplicada: clean };
  }

  async getFiltros() {
    const [
      practicas,
      programas,
      facultades,
      ciclos,
      gruposEtarios,
      sexos,
      categoriasEvento,
      cortesDisponibles,
      rangoFechas,
    ] = await Promise.all([
      this.db.queryDm(`
        SELECT
          id_practica,
          codigo_practica,
          nombre_practica,
          tipo_practica,
          es_mixto
        FROM dm.DimPractica
        ORDER BY id_practica
      `),
      this.db.queryDm(`
        WITH prog_pract AS (
          SELECT DISTINCT sk_programa, sk_practica
          FROM dm.HechoContinuidad
        )
        SELECT
          p.id_programa,
          p.codigo_programa,
          p.nombre_programa,
          p.periodo_academico,
          pr.id_practica AS id_practica_principal,
          pr.codigo_practica,
          pr.nombre_practica,
          to_char(p.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
          to_char(p.fecha_cierre, 'YYYY-MM-DD') AS fecha_cierre,
          p.estado_programa
        FROM dm.DimPrograma p
        LEFT JOIN prog_pract pp ON pp.sk_programa = p.sk_programa
        LEFT JOIN dm.DimPractica pr ON pr.sk_practica = pp.sk_practica
        ORDER BY p.fecha_inicio, p.id_programa
      `),
      this.db.queryDm(`
        SELECT DISTINCT facultad_o_area AS facultad
        FROM dm.DimEstudiante
        ORDER BY facultad_o_area
      `),
      this.db.queryDm(`
        SELECT DISTINCT ciclo_academico
        FROM dm.DimEstudiante
        ORDER BY ciclo_academico
      `),
      this.db.queryDm(`
        SELECT DISTINCT grupo_etario
        FROM dm.DimEstudiante
        ORDER BY grupo_etario
      `),
      this.db.queryDm(`
        SELECT DISTINCT sexo_codificado
        FROM dm.DimEstudiante
        ORDER BY sexo_codificado
      `),
      this.db.queryDm(`
        SELECT DISTINCT
          codigo_categoria,
          nombre_categoria
        FROM dm.DimEventoIndice
        WHERE es_no_aplica = 0
        ORDER BY codigo_categoria
      `),
      this.db.queryDm(`
        SELECT to_char(t.fecha, 'YYYY-MM-DD') AS fecha_corte
        FROM dm.DimTiempo t
        WHERE t.sk_tiempo IN (SELECT DISTINCT sk_tiempo_corte FROM dm.HechoContinuidad)
        ORDER BY t.fecha DESC
      `),
      this.db.queryDm(`
        SELECT
          to_char(MIN(fecha_inicio), 'YYYY-MM-DD') AS fecha_min,
          to_char(MAX(fecha_cierre), 'YYYY-MM-DD') AS fecha_max
        FROM dm.DimPrograma
      `),
    ]);

    return {
      practicas,
      programas,
      facultades: facultades.map((f) => f.facultad),
      ciclos: ciclos.map((c) => Number(c.ciclo_academico)),
      gruposEtarios: gruposEtarios.map((g) => g.grupo_etario),
      sexos: sexos.map((s) => s.sexo_codificado),
      categoriasEvento,
      cortesDisponibles: cortesDisponibles.map((c) => c.fecha_corte),
      semestres: Array.from(new Set(programas.map((p: any) => p.periodo_academico))),
      rangoFechas: rangoFechas[0] || { fecha_min: '2026-08-10', fecha_max: '2026-12-17' },
    };
  }

  async getResumen(f: FiltrosQuery) {
    const { skCorte, fechaAplicada } = await this.resolveCorteDm(f.corte);
    const params: Record<string, any> = {
      skCorte,
      idPrograma: f.idPrograma ?? null,
      idPractica: f.idPractica ?? null,
      facultad: f.facultad ?? null,
    };

    // 1. KPI-01 (PSS-10) y KPI-02 (PCL-5) desde dm.HechoResultadosEvaluacion (estrictamente separados)
    const [paresRows, contRows, cumpRows, totalesRows] = await Promise.all([
      this.db.queryDm(
        `
        SELECT
          i.codigo_instrumento,
          SUM(CAST(h.ParesValidos AS INT)) AS pares_validos,
          CAST(SUM(CAST(h.SumaInicial AS DECIMAL(12,4))) / NULLIF(SUM(CAST(h.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_inicial,
          CAST(SUM(CAST(h.SumaFinal AS DECIMAL(12,4))) / NULLIF(SUM(CAST(h.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_final,
          CAST(SUM(CAST(h.PuntosReduccion AS DECIMAL(12,4))) / NULLIF(SUM(CAST(h.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS reduccion_promedio,
          SUM(CAST(h.EsReduccion AS INT)) AS disminuyeron,
          SUM(CAST(h.EsSinCambio AS INT)) AS sin_cambio,
          SUM(CAST(h.EsIncremento AS INT)) AS aumentaron
        FROM dm.HechoResultadosEvaluacion h
        JOIN dm.DimInstrumento i ON i.sk_instrumento = h.sk_instrumento
        JOIN dm.DimPrograma    p ON p.sk_programa    = h.sk_programa
        JOIN dm.DimPractica   pr ON pr.sk_practica   = h.sk_practica
        JOIN dm.DimEstudiante  e ON e.sk_estudiante  = h.sk_estudiante
        WHERE h.sk_tiempo_corte = @skCorte
          AND (@idPrograma IS NULL OR p.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR pr.id_practica = @idPractica)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
        GROUP BY i.codigo_instrumento
        `,
        params,
      ),
      // 2. KPI-03 (Continuidad — D02) desde dm.HechoContinuidad
      this.db.queryDm(
        `
        SELECT
          COALESCE(SUM(CAST(h.EsEvaluable AS INT)), 0) AS evaluables,
          COALESCE(SUM(CAST(h.Continua AS INT)), 0) AS continuan,
          COALESCE(SUM(CASE WHEN ec.codigo_estado = 'ACTIVO' THEN 1 ELSE 0 END), 0) AS activos,
          COALESCE(SUM(CASE WHEN ec.codigo_estado = 'EN_RIESGO' THEN 1 ELSE 0 END), 0) AS en_riesgo,
          COALESCE(SUM(CASE WHEN ec.codigo_estado = 'ABANDONO' THEN 1 ELSE 0 END), 0) AS abandono,
          COALESCE(SUM(CASE WHEN ec.codigo_estado = 'RETIRADO' AND h.EsEvaluable = 1 THEN 1 ELSE 0 END), 0) AS retirados_evaluables,
          COALESCE(SUM(CASE WHEN ec.codigo_estado = 'RETIRADO' THEN 1 ELSE 0 END), 0) AS retirados,
          COALESCE(SUM(CASE WHEN h.EsEvaluable = 0 THEN 1 ELSE 0 END), 0) AS no_evaluables
        FROM dm.HechoContinuidad h
        JOIN dm.DimPrograma          p  ON p.sk_programa           = h.sk_programa
        JOIN dm.DimPractica          pr ON pr.sk_practica          = h.sk_practica
        JOIN dm.DimEstudiante        e  ON e.sk_estudiante         = h.sk_estudiante
        JOIN dm.DimEstadoContinuidad ec ON ec.sk_estado_continuidad = h.sk_estado_continuidad
        WHERE h.sk_tiempo_corte = @skCorte
          AND (@idPrograma IS NULL OR p.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR pr.id_practica = @idPractica)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
        `,
        params,
      ),
      // 3. KPI-04 (Cumplimiento — D01) desde dm.HechoCumplimientoEvaluaciones
      this.db.queryDm(
        `
        SELECT
          COUNT(*) AS oportunidades_abiertas,
          COALESCE(SUM(CAST(h.EsElegible AS INT)), 0) AS elegibles,
          COALESCE(SUM(CAST(h.EsCompletadaElegible AS INT)), 0) AS completadas,
          COALESCE(SUM(CAST(h.EsEnVentana AS INT)), 0) AS completadas_en_ventana,
          COALESCE(SUM(CAST(h.EsTardia AS INT)), 0) AS completadas_tardias,
          COALESCE(SUM(CAST(h.EsVencida AS INT)), 0) AS vencidas,
          COALESCE(SUM(CAST(h.EsPendiente AS INT)), 0) AS pendientes_en_ventana
        FROM dm.HechoCumplimientoEvaluaciones h
        JOIN dm.DimPrograma   p  ON p.sk_programa   = h.sk_programa
        JOIN dm.DimPractica   pr ON pr.sk_practica  = h.sk_practica
        JOIN dm.DimEstudiante e  ON e.sk_estudiante = h.sk_estudiante
        WHERE h.sk_tiempo_corte = @skCorte
          AND (@idPrograma IS NULL OR p.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR pr.id_practica = @idPractica)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
        `,
        params,
      ),
      // 4. Totales institucionales desde dimensiones y hechos del DM
      this.db.queryDm(
        `
        SELECT
          (SELECT COUNT(*) FROM dm.DimEstudiante) AS total_estudiantes,
          (SELECT COUNT(*) FROM dm.DimPrograma) AS total_programas,
          (SELECT COALESCE(SUM(SesionesExigibles), 0) FROM dm.HechoContinuidad WHERE sk_tiempo_corte = @skCorte) AS sesiones_realizadas,
          (SELECT COALESCE(SUM(Asistencias), 0) FROM dm.HechoContinuidad WHERE sk_tiempo_corte = @skCorte) AS total_asistencias
        `,
        { skCorte },
      ),
    ]);

    const pssRow = paresRows.find((r) => r.codigo_instrumento === 'PSS-10');
    const pclRow = paresRows.find((r) => r.codigo_instrumento === 'PCL-5');

    const cont = contRows[0] || {};
    const evaluables = Number(cont.evaluables || 0);
    const continuan = Number(cont.continuan || 0);
    const tasaContinuidad = evaluables > 0 ? Number(((continuan / evaluables) * 100).toFixed(1)) : null;

    const cump = cumpRows[0] || {};
    const elegibles = Number(cump.elegibles || 0);
    const completadas = Number(cump.completadas || 0);
    const tasaCumplimiento = elegibles > 0 ? Number(((completadas / elegibles) * 100).toFixed(1)) : null;

    const pssPares = Number(pssRow?.pares_validos || 0);
    const pssRed = pssPares >= 5 ? Number(pssRow.reduccion_promedio) : null;
    const pclPares = Number(pclRow?.pares_validos || 0);
    const pclRed = pclPares >= 5 ? Number(pclRow.reduccion_promedio) : null;

    return {
      corte: fechaAplicada,
      fuente_datos: 'Data Mart (dm.*)',
      totales: totalesRows[0] || {
        total_estudiantes: 0,
        total_programas: 0,
        sesiones_realizadas: 0,
        total_asistencias: 0,
      },
      kpi01_pss10: {
        pares_validos: pssPares,
        suprimido: pssPares > 0 && pssPares < 5,
        promedio_inicial: pssPares >= 5 ? Number(pssRow.promedio_inicial) : null,
        promedio_final: pssPares >= 5 ? Number(pssRow.promedio_final) : null,
        reduccion_promedio: pssRed,
        reduccion_pct:
          pssPares >= 5 && Number(pssRow.promedio_inicial) > 0
            ? Number(((Number(pssRow.reduccion_promedio) / Number(pssRow.promedio_inicial)) * 100).toFixed(1))
            : null,
        disminuyeron: pssPares >= 5 ? Number(pssRow.disminuyeron) : null,
        sin_cambio: pssPares >= 5 ? Number(pssRow.sin_cambio) : null,
        aumentaron: pssPares >= 5 ? Number(pssRow.aumentaron) : null,
        meta_operativa: '≥ 4.0 pts',
        semaforo: this.semaforoPss(pssPares, pssRed),
      },
      kpi02_pcl5: {
        pares_validos: pclPares,
        suprimido: pclPares > 0 && pclPares < 5,
        promedio_inicial: pclPares >= 5 ? Number(pclRow.promedio_inicial) : null,
        promedio_final: pclPares >= 5 ? Number(pclRow.promedio_final) : null,
        reduccion_promedio: pclRed,
        reduccion_pct:
          pclPares >= 5 && Number(pclRow.promedio_inicial) > 0
            ? Number(((Number(pclRow.reduccion_promedio) / Number(pclRow.promedio_inicial)) * 100).toFixed(1))
            : null,
        disminuyeron: pclPares >= 5 ? Number(pclRow.disminuyeron) : null,
        sin_cambio: pclPares >= 5 ? Number(pclRow.sin_cambio) : null,
        aumentaron: pclPares >= 5 ? Number(pclRow.aumentaron) : null,
        meta_operativa: '≥ 10.0 pts',
        semaforo: this.semaforoPcl(pclPares, pclRed),
      },
      kpi03_continuidad: {
        evaluables,
        continuan: evaluables >= 5 ? continuan : null,
        activos: evaluables >= 5 ? Number(cont.activos || 0) : null,
        en_riesgo: evaluables >= 5 ? Number(cont.en_riesgo || 0) : null,
        abandono: evaluables >= 5 ? Number(cont.abandono || 0) : null,
        retirados: evaluables >= 5 ? Number(cont.retirados || 0) : null,
        retirados_evaluables: evaluables >= 5 ? Number(cont.retirados_evaluables || 0) : null,
        no_evaluables: Number(cont.no_evaluables || 0),
        tasa_continuidad: evaluables >= 5 ? tasaContinuidad : null,
        suprimido: evaluables > 0 && evaluables < 5,
        meta_operativa: '≥ 80.0 %',
        semaforo: this.semaforoContinuidad(evaluables, tasaContinuidad),
      },
      kpi04_cumplimiento: {
        oportunidades_abiertas: Number(cump.oportunidades_abiertas || 0),
        elegibles,
        completadas: elegibles >= 5 ? completadas : null,
        completadas_en_ventana: elegibles >= 5 ? Number(cump.completadas_en_ventana || 0) : null,
        completadas_tardias: elegibles >= 5 ? Number(cump.completadas_tardias || 0) : null,
        vencidas: elegibles >= 5 ? Number(cump.vencidas || 0) : null,
        pendientes_en_ventana: elegibles >= 5 ? Number(cump.pendientes_en_ventana || 0) : null,
        tasa_cumplimiento: elegibles >= 5 ? tasaCumplimiento : null,
        suprimido: elegibles > 0 && elegibles < 5,
        meta_operativa: '≥ 90.0 %',
        semaforo: this.semaforoCumplimiento(elegibles, tasaCumplimiento),
      },
    };
  }

  async getEvolucion(f: {
    corte: string;
    semestre?: string;
    facultad?: string;
    idPrograma?: number;
    idPractica?: number;
    grupoEtario?: string;
    sexo?: string;
    instrumento?: 'PSS-10' | 'PCL-5';
    categoriaEvento?: string;
    agruparPor?: 'programa' | 'facultad' | 'grupo_etario';
    page?: number;
    pageSize?: number;
  }) {
    const { skCorte, fechaAplicada } = await this.resolveCorteDm(f.corte);
    const agruparPor = f.agruparPor ?? 'programa';
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const params: Record<string, any> = {
      skCorte,
      semestre: f.semestre ?? null,
      facultad: f.facultad ?? null,
      idPrograma: f.idPrograma ?? null,
      idPractica: f.idPractica ?? null,
      grupoEtario: f.grupoEtario ?? null,
      sexo: f.sexo ?? null,
      instrumento: f.instrumento ?? null,
      categoriaEvento: f.categoriaEvento ?? null,
      offset,
      pageSize,
    };

    const dimSelect =
      agruparPor === 'facultad'
        ? `facultad_o_area AS dim_clave, facultad_o_area AS dim_subtitulo, '' AS codigo_practica, '' AS estado_programa`
        : agruparPor === 'grupo_etario'
          ? `grupo_etario AS dim_clave, 'Grupo etario (' || grupo_etario || ' años)' AS dim_subtitulo, '' AS codigo_practica, '' AS estado_programa`
          : `codigo_programa AS dim_clave, codigo_practica || ' · ' || nombre_practica AS dim_subtitulo, codigo_practica, estado_programa`;

    const dimGroup =
      agruparPor === 'facultad'
        ? `facultad_o_area`
        : agruparPor === 'grupo_etario'
          ? `grupo_etario`
          : `codigo_programa, codigo_practica, nombre_practica, estado_programa`;

    const baseCte = `
      WITH pares AS (
        SELECT
          i.codigo_instrumento,
          i.version_instrumento,
          p.id_programa,
          p.codigo_programa,
          p.estado_programa,
          pr.codigo_practica,
          pr.nombre_practica,
          e.facultad_o_area,
          e.grupo_etario,
          e.sexo_codificado,
          h.ParesValidos,
          h.SumaInicial,
          h.SumaFinal,
          h.PuntosReduccion,
          h.EsReduccion,
          h.EsSinCambio,
          h.EsIncremento
        FROM dm.HechoResultadosEvaluacion h
        JOIN dm.DimInstrumento  i  ON i.sk_instrumento   = h.sk_instrumento
        JOIN dm.DimPrograma     p  ON p.sk_programa      = h.sk_programa
        JOIN dm.DimPractica     pr ON pr.sk_practica     = h.sk_practica
        JOIN dm.DimEstudiante   e  ON e.sk_estudiante    = h.sk_estudiante
        JOIN dm.DimEventoIndice ev ON ev.sk_evento_indice = h.sk_evento_indice
        WHERE h.sk_tiempo_corte = @skCorte
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
          AND (@idPrograma IS NULL OR p.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR pr.id_practica = @idPractica)
          AND (@grupoEtario IS NULL OR e.grupo_etario = @grupoEtario)
          AND (@sexo IS NULL OR e.sexo_codificado = @sexo)
          AND (@instrumento IS NULL OR i.codigo_instrumento = @instrumento)
          AND (@categoriaEvento IS NULL OR (ev.es_no_aplica = 0 AND ev.codigo_categoria = @categoriaEvento))
      ),
      agrupado AS (
        SELECT
          codigo_instrumento,
          MAX(version_instrumento) AS version_instrumento,
          ${dimSelect},
          SUM(CAST(ParesValidos AS INT)) AS pares_validos,
          CAST(SUM(CAST(SumaInicial AS DECIMAL(12,4))) / NULLIF(SUM(CAST(ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_inicial,
          CAST(SUM(CAST(SumaFinal AS DECIMAL(12,4))) / NULLIF(SUM(CAST(ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_final,
          CAST(SUM(CAST(PuntosReduccion AS DECIMAL(12,4))) / NULLIF(SUM(CAST(ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS reduccion_promedio,
          SUM(CAST(EsReduccion AS INT)) AS disminuyeron,
          SUM(CAST(EsSinCambio AS INT)) AS sin_cambio,
          SUM(CAST(EsIncremento AS INT)) AS aumentaron
        FROM pares
        GROUP BY codigo_instrumento, ${dimGroup}
      )
    `;

    const [totalesInst, countRow, filasRaw] = await Promise.all([
      this.db.queryDm(
        `
        ${baseCte}
        SELECT
          codigo_instrumento,
          SUM(CAST(ParesValidos AS INT)) AS pares_validos,
          CAST(SUM(CAST(SumaInicial AS DECIMAL(12,4))) / NULLIF(SUM(CAST(ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_inicial,
          CAST(SUM(CAST(SumaFinal AS DECIMAL(12,4))) / NULLIF(SUM(CAST(ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_final,
          CAST(SUM(CAST(PuntosReduccion AS DECIMAL(12,4))) / NULLIF(SUM(CAST(ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS reduccion_promedio,
          SUM(CAST(EsReduccion AS INT)) AS disminuyeron,
          SUM(CAST(EsSinCambio AS INT)) AS sin_cambio,
          SUM(CAST(EsIncremento AS INT)) AS aumentaron
        FROM pares
        GROUP BY codigo_instrumento
        ORDER BY CASE WHEN codigo_instrumento = 'PSS-10' THEN 1 ELSE 2 END
        `,
        params,
      ),
      this.db.queryDm(`${baseCte} SELECT COUNT(*) AS total_registros FROM agrupado`, params),
      this.db.queryDm(
        `
        ${baseCte}
        SELECT *
        FROM agrupado
        ORDER BY
          CASE WHEN codigo_instrumento = 'PSS-10' THEN 1 ELSE 2 END,
          dim_clave ASC
        LIMIT @pageSize OFFSET @offset
        `,
        params,
      ),
    ]);

    const mapRow = (r: any) => {
      const n = Number(r.pares_validos || 0);
      const red = n >= 5 ? Number(r.reduccion_promedio) : null;
      const sem =
        r.codigo_instrumento === 'PSS-10'
          ? this.semaforoPss(n, red)
          : this.semaforoPcl(n, red);
      return {
        ...r,
        pares_validos: n,
        suprimido: n > 0 && n < 5,
        promedio_inicial: n >= 5 ? Number(r.promedio_inicial) : null,
        promedio_final: n >= 5 ? Number(r.promedio_final) : null,
        reduccion_promedio: red,
        disminuyeron: n >= 5 ? Number(r.disminuyeron) : null,
        sin_cambio: n >= 5 ? Number(r.sin_cambio) : null,
        aumentaron: n >= 5 ? Number(r.aumentaron) : null,
        meta_operativa: r.codigo_instrumento === 'PSS-10' ? '≥ 4.0 pts' : '≥ 10.0 pts',
        semaforo: sem,
      };
    };

    const totalRegistros = Number(countRow[0]?.total_registros || 0);

    return {
      corte: fechaAplicada,
      agrupar_por: agruparPor,
      totales_por_instrumento: totalesInst.map(mapRow),
      paginacion: {
        page,
        pageSize,
        totalRegistros,
        totalPaginas: Math.max(1, Math.ceil(totalRegistros / pageSize)),
      },
      filas: filasRaw.map(mapRow),
    };
  }

  async getImpactoPracticas(q: {
    instrumento: 'PSS-10' | 'PCL-5';
    corte: string;
    semestre?: string;
    facultad?: string;
  }) {
    const { skCorte, fechaAplicada } = await this.resolveCorteDm(q.corte);
    const metaPts = q.instrumento === 'PSS-10' ? 4.0 : 10.0;
    const params = {
      instrumento: q.instrumento,
      skCorte,
      semestre: q.semestre ?? null,
      facultad: q.facultad ?? null,
      facultadVista: q.facultad ?? 'TODAS',
    };

    // RG-02: Lee directamente desde dm.vw_HechoEfectividadPractica filtrando por Facultad/Área
    // ANTES de agrupar por Práctica × Instrumento y exigiendo ParesValidos >= 5.
    const [porPracticaRaw, porProgramaRaw] = await Promise.all([
      this.db.queryDm(
        `
        SELECT
          pr.id_practica,
          v.codigo_practica,
          v.nombre_practica,
          v.tipo_practica,
          pr.es_mixto,
          v.ParesValidos        AS pares_validos,
          v.PromedioInicial     AS promedio_inicial,
          v.PromedioFinal       AS promedio_final,
          v.ReduccionPromedio   AS reduccion_promedio,
          v.EsPracticaEvaluable AS es_evaluable_practica,
          v.CumpleMetaOperativa AS cumple_meta_vista,
          v.EstadoSemaforo      AS semaforo_vista,
          COALESCE(det.disminuyeron, 0) AS disminuyeron,
          COALESCE(det.sin_cambio, 0)   AS sin_cambio,
          COALESCE(det.aumentaron, 0)   AS aumentaron
        FROM dm.vw_HechoEfectividadPractica v
        JOIN dm.DimPractica pr ON pr.sk_practica = v.sk_practica
        LEFT JOIN (
          SELECT
            h.sk_practica,
            SUM(CAST(h.EsReduccion AS INT)) AS disminuyeron,
            SUM(CAST(h.EsSinCambio AS INT)) AS sin_cambio,
            SUM(CAST(h.EsIncremento AS INT)) AS aumentaron
          FROM dm.HechoResultadosEvaluacion h
          JOIN dm.DimInstrumento i ON i.sk_instrumento = h.sk_instrumento
          JOIN dm.DimEstudiante  e ON e.sk_estudiante  = h.sk_estudiante
          JOIN dm.DimPrograma    p ON p.sk_programa    = h.sk_programa
          WHERE h.sk_tiempo_corte = @skCorte
            AND i.codigo_instrumento = @instrumento
            AND (@semestre IS NULL OR p.periodo_academico = @semestre)
            AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
          GROUP BY h.sk_practica
        ) det ON det.sk_practica = v.sk_practica
        WHERE v.sk_tiempo_corte = @skCorte
          AND v.codigo_instrumento = @instrumento
          AND v.facultad_o_area = @facultadVista
          AND (@semestre IS NULL OR v.periodo_academico = @semestre)
        ORDER BY
          CASE WHEN v.ParesValidos >= 5 THEN 0 ELSE 1 END,
          v.ReduccionPromedio DESC,
          v.codigo_practica ASC
        `,
        params,
      ),
      this.db.queryDm(
        `
        SELECT
          p.id_programa,
          p.codigo_programa,
          p.nombre_programa,
          pr.codigo_practica,
          pr.nombre_practica,
          p.estado_programa,
          SUM(CAST(h.ParesValidos AS INT)) AS pares_validos,
          CAST(SUM(CAST(h.SumaInicial AS DECIMAL(12,4))) / NULLIF(SUM(CAST(h.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_inicial,
          CAST(SUM(CAST(h.SumaFinal AS DECIMAL(12,4))) / NULLIF(SUM(CAST(h.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS promedio_final,
          CAST(SUM(CAST(h.PuntosReduccion AS DECIMAL(12,4))) / NULLIF(SUM(CAST(h.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) AS reduccion_promedio,
          SUM(CAST(h.EsReduccion AS INT)) AS disminuyeron,
          SUM(CAST(h.EsSinCambio AS INT)) AS sin_cambio,
          SUM(CAST(h.EsIncremento AS INT)) AS aumentaron
        FROM dm.HechoResultadosEvaluacion h
        JOIN dm.DimInstrumento i  ON i.sk_instrumento = h.sk_instrumento
        JOIN dm.DimPrograma    p  ON p.sk_programa    = h.sk_programa
        JOIN dm.DimPractica    pr ON pr.sk_practica   = h.sk_practica
        JOIN dm.DimEstudiante  e  ON e.sk_estudiante  = h.sk_estudiante
        WHERE h.sk_tiempo_corte = @skCorte
          AND i.codigo_instrumento = @instrumento
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
        GROUP BY p.id_programa, p.codigo_programa, p.nombre_programa, pr.codigo_practica, pr.nombre_practica, p.estado_programa
        ORDER BY
          CASE WHEN SUM(CAST(h.ParesValidos AS INT)) >= 5 THEN 0 ELSE 1 END,
          CAST(SUM(CAST(h.PuntosReduccion AS DECIMAL(12,4))) / NULLIF(SUM(CAST(h.ParesValidos AS DECIMAL(12,4))), 0) AS DECIMAL(6,2)) DESC
        `,
        params,
      ),
    ]);

    const mapRow = (r: any) => {
      const n = Number(r.pares_validos || 0);
      const red = n >= 5 && r.reduccion_promedio !== null ? Number(r.reduccion_promedio) : null;
      const sem =
        q.instrumento === 'PSS-10' ? this.semaforoPss(n, red) : this.semaforoPcl(n, red);
      const cumpleMeta = red !== null ? red >= metaPts : null;
      return {
        ...r,
        pares_validos: n,
        suprimido: n > 0 && n < 5,
        promedio_inicial: n >= 5 && r.promedio_inicial !== null ? Number(r.promedio_inicial) : null,
        promedio_final: n >= 5 && r.promedio_final !== null ? Number(r.promedio_final) : null,
        reduccion_promedio: red,
        disminuyeron: n >= 5 ? Number(r.disminuyeron) : null,
        sin_cambio: n >= 5 ? Number(r.sin_cambio) : null,
        aumentaron: n >= 5 ? Number(r.aumentaron) : null,
        meta_operativa_pts: metaPts,
        cumple_meta: cumpleMeta,
        semaforo: sem,
      };
    };

    const porPractica = porPracticaRaw.map(mapRow);
    const practicasEvaluables = porPractica.filter((p) => p.pares_validos >= 5).length;
    const practicasCumplen = porPractica.filter((p) => p.cumple_meta === true).length;
    const tasaCumplimientoMeta =
      practicasEvaluables > 0
        ? Number(((practicasCumplen / practicasEvaluables) * 100).toFixed(1))
        : null;

    return {
      instrumento: q.instrumento,
      corte: fechaAplicada,
      facultad: q.facultad ?? 'TODAS',
      meta_operativa_pts: metaPts,
      kpi05_meta_practicas: {
        practicas_evaluables: practicasEvaluables,
        practicas_cumplen_meta: practicasCumplen,
        tasa_cumplimiento_meta: tasaCumplimientoMeta,
        meta_operativa: '≥ 80.0 %',
        semaforo: this.semaforoMetaPracticas(practicasEvaluables, tasaCumplimientoMeta),
      },
      por_practica: porPractica,
      por_programa: porProgramaRaw.map(mapRow),
    };
  }

  async getContinuidad(f: {
    corte: string;
    semestre?: string;
    idPrograma?: number;
    idPractica?: number;
    facultad?: string;
    ciclo?: number;
    estado?: string;
    buscar?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skCorte, fechaAplicada } = await this.resolveCorteDm(f.corte);
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const params = {
      skCorte,
      semestre: f.semestre ?? null,
      idPrograma: f.idPrograma ?? null,
      idPractica: f.idPractica ?? null,
      facultad: f.facultad ?? null,
      ciclo: f.ciclo ?? null,
      estado: f.estado ?? null,
      buscar: f.buscar ? `%${f.buscar}%` : null,
      offset,
      pageSize,
    };

    const baseCte = `
      WITH filtrado AS (
        SELECT
          h.id_asignacion,
          e.codigo_estudiante,
          e.facultad_o_area,
          e.ciclo_academico,
          p.id_programa,
          p.codigo_programa,
          p.nombre_programa,
          pr.codigo_practica,
          pr.nombre_practica,
          h.SesionesExigibles AS sesiones_exigibles,
          h.Asistencias       AS asistencias,
          h.Inasistencias     AS inasistencias,
          CAST(ROUND((CAST(h.Asistencias AS NUMERIC) / NULLIF(h.SesionesExigibles, 0)) * 100.0, 1) AS DECIMAL(5,1)) AS asistencia_pct,
          h.fecha_primera_asistencia AS primera_asistencia,
          h.fecha_ultima_asistencia  AS ultima_asistencia,
          h.EsEvaluable       AS es_evaluable,
          h.Continua          AS continua,
          ec.codigo_estado    AS estado_continuidad,
          ec.nombre_estado    AS nombre_estado_continuidad,
          ec.orden_visual
        FROM dm.HechoContinuidad h
        JOIN dm.DimEstudiante        e  ON e.sk_estudiante          = h.sk_estudiante
        JOIN dm.DimPrograma          p  ON p.sk_programa            = h.sk_programa
        JOIN dm.DimPractica          pr ON pr.sk_practica           = h.sk_practica
        JOIN dm.DimEstadoContinuidad ec ON ec.sk_estado_continuidad = h.sk_estado_continuidad
        WHERE h.sk_tiempo_corte = @skCorte
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@idPrograma IS NULL OR p.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR pr.id_practica = @idPractica)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
          AND (@ciclo IS NULL OR e.ciclo_academico = @ciclo)
          AND (@estado IS NULL OR ec.codigo_estado = @estado)
          AND (@buscar IS NULL OR e.codigo_estudiante LIKE @buscar)
      )
    `;

    const [totalesRows, estudiantesRows, porProgramaRaw] = await Promise.all([
      this.db.queryDm(
        `${baseCte}
        SELECT
          COUNT(*) AS total_registros,
          COALESCE(SUM(CAST(es_evaluable AS INT)), 0) AS evaluables,
          COALESCE(SUM(CAST(continua AS INT)), 0) AS continuan,
          COALESCE(SUM(sesiones_exigibles), 0) AS sesiones_exigibles,
          COALESCE(SUM(asistencias), 0) AS asistencias,
          COALESCE(SUM(inasistencias), 0) AS inasistencias,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'ACTIVO' THEN 1 ELSE 0 END), 0) AS activos,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'EN_RIESGO' THEN 1 ELSE 0 END), 0) AS en_riesgo,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'ABANDONO' THEN 1 ELSE 0 END), 0) AS abandono,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'RETIRADO' THEN 1 ELSE 0 END), 0) AS retirados,
          COALESCE(SUM(CASE WHEN es_evaluable = 0 THEN 1 ELSE 0 END), 0) AS no_evaluables
        FROM filtrado`,
        params,
      ),
      this.db.queryDm(
        `${baseCte}
        SELECT
          id_asignacion,
          codigo_estudiante,
          facultad_o_area,
          ciclo_academico,
          codigo_programa,
          codigo_practica,
          nombre_practica,
          sesiones_exigibles,
          asistencias,
          inasistencias,
          asistencia_pct,
          to_char(primera_asistencia, 'YYYY-MM-DD') AS primera_asistencia,
          to_char(ultima_asistencia, 'YYYY-MM-DD') AS ultima_asistencia,
          es_evaluable,
          estado_continuidad
        FROM filtrado
        ORDER BY
          CASE estado_continuidad
            WHEN 'EN_RIESGO' THEN 1
            WHEN 'ABANDONO' THEN 2
            WHEN 'RETIRADO' THEN 3
            WHEN 'ACTIVO' THEN 4
            ELSE 5
          END,
          codigo_estudiante ASC
        LIMIT @pageSize OFFSET @offset`,
        params,
      ),
      this.db.queryDm(
        `${baseCte}
        SELECT
          id_programa, codigo_programa, nombre_programa, codigo_practica, nombre_practica,
          COALESCE(SUM(CAST(es_evaluable AS INT)), 0) AS evaluables,
          COALESCE(SUM(CAST(continua AS INT)), 0) AS continuan,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'ACTIVO' THEN 1 ELSE 0 END), 0) AS activos,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'EN_RIESGO' THEN 1 ELSE 0 END), 0) AS en_riesgo,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'ABANDONO' THEN 1 ELSE 0 END), 0) AS abandono,
          COALESCE(SUM(CASE WHEN estado_continuidad = 'RETIRADO' THEN 1 ELSE 0 END), 0) AS retirados,
          COALESCE(SUM(CASE WHEN es_evaluable = 0 THEN 1 ELSE 0 END), 0) AS no_evaluables
        FROM filtrado
        GROUP BY id_programa, codigo_programa, nombre_programa, codigo_practica, nombre_practica
        ORDER BY id_programa`,
        params,
      ),
    ]);

    const t = totalesRows[0] || {};
    const totalRegistros = Number(t.total_registros || 0);
    const evaluables = Number(t.evaluables || 0);
    const continuan = Number(t.continuan || 0);
    const totalExigibles = Number(t.sesiones_exigibles || 0);
    const totalAsistencias = Number(t.asistencias || 0);
    const asistenciaPct =
      totalExigibles > 0 ? Number(((totalAsistencias / totalExigibles) * 100).toFixed(1)) : null;
    const tasaContinuidad =
      evaluables > 0 ? Number(((continuan / evaluables) * 100).toFixed(1)) : null;

    return {
      corte: fechaAplicada,
      resumen_total: {
        total_registros: totalRegistros,
        evaluables,
        continuan,
        sesiones_exigibles: totalExigibles,
        asistencias: totalAsistencias,
        inasistencias: Number(t.inasistencias || 0),
        asistencia_pct: asistenciaPct,
        activos: Number(t.activos || 0),
        en_riesgo: Number(t.en_riesgo || 0),
        abandono: Number(t.abandono || 0),
        retirados: Number(t.retirados || 0),
        no_evaluables: Number(t.no_evaluables || 0),
        tasa_continuidad: evaluables >= 5 ? tasaContinuidad : null,
        suprimido: evaluables > 0 && evaluables < 5,
        semaforo: this.semaforoContinuidad(evaluables, tasaContinuidad),
      },
      paginacion: {
        page,
        pageSize,
        totalRegistros,
        totalPaginas: Math.max(1, Math.ceil(totalRegistros / pageSize)),
      },
      estudiantes: estudiantesRows.map((r) => ({
        ...r,
        es_evaluable: Boolean(r.es_evaluable),
        asistencia_pct: r.asistencia_pct != null ? Number(r.asistencia_pct) : 0,
      })),
      por_programa: porProgramaRaw.map((r) => {
        const evals = Number(r.evaluables || 0);
        const cont = Number(r.continuan || 0);
        const tasa = evals > 0 ? Number(((cont / evals) * 100).toFixed(1)) : null;
        return {
          ...r,
          evaluables: evals,
          tasa_continuidad: evals >= 5 ? tasa : null,
          suprimido: evals > 0 && evals < 5,
          semaforo: this.semaforoContinuidad(evals, tasa),
        };
      }),
    };
  }

  async getCumplimiento(f: {
    corte: string;
    semestre?: string;
    idPrograma?: number;
    facultad?: string;
    instrumento?: 'PSS-10' | 'PCL-5';
    categoriaEvento?: string;
    estado?: string;
    buscar?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skCorte, fechaAplicada } = await this.resolveCorteDm(f.corte);
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const params: Record<string, any> = {
      skCorte,
      semestre: f.semestre ?? null,
      idPrograma: f.idPrograma ?? null,
      facultad: f.facultad ?? null,
      instrumento: f.instrumento ?? null,
      categoriaEvento: f.categoriaEvento ?? null,
      estado: f.estado ?? null,
      buscar: f.buscar ? `%${f.buscar}%` : null,
      offset,
      pageSize,
    };

    const baseCte = `
      WITH filtrado AS (
        SELECT
          h.id_oportunidad,
          p.id_programa,
          e.codigo_estudiante,
          e.facultad_o_area,
          p.codigo_programa,
          p.periodo_academico,
          pr.codigo_practica,
          i.codigo_instrumento,
          m.codigo_momento AS momento,
          CASE WHEN ev.es_no_aplica = 1 THEN NULL ELSE ev.codigo_evento_local END AS codigo_evento_local,
          CASE WHEN ev.es_no_aplica = 1 THEN NULL ELSE ev.codigo_categoria END AS categoria_evento,
          to_char(tp.fecha, 'YYYY-MM-DD') AS fecha_prevista,
          to_char(tr.fecha, 'YYYY-MM-DD') AS fecha_realizacion,
          h.PuntajeObtenido AS puntaje_total,
          h.NumeroVersion   AS numero_version,
          ee.codigo_estado  AS estado_evaluacion,
          h.EsElegible      AS es_elegible,
          h.EsCompletadaElegible AS es_completada_elegible,
          h.EsEnVentana,
          h.EsTardia,
          h.EsPendiente,
          h.EsVencida,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM dm.HechoResultadosEvaluacion hr
              WHERE hr.sk_tiempo_corte  = h.sk_tiempo_corte
                AND hr.sk_estudiante    = h.sk_estudiante
                AND hr.sk_programa      = h.sk_programa
                AND hr.sk_instrumento   = h.sk_instrumento
                AND hr.sk_evento_indice = h.sk_evento_indice
            ) THEN CAST(1 AS SMALLINT)
            ELSE CAST(0 AS SMALLINT)
          END AS par_valido
        FROM dm.HechoCumplimientoEvaluaciones h
        JOIN dm.DimEstudiante       e  ON e.sk_estudiante        = h.sk_estudiante
        JOIN dm.DimPrograma         p  ON p.sk_programa          = h.sk_programa
        JOIN dm.DimPractica         pr ON pr.sk_practica         = h.sk_practica
        JOIN dm.DimInstrumento      i  ON i.sk_instrumento       = h.sk_instrumento
        JOIN dm.DimEventoIndice     ev ON ev.sk_evento_indice    = h.sk_evento_indice
        JOIN dm.DimMomento          m  ON m.sk_momento           = h.sk_momento
        JOIN dm.DimEstadoEvaluacion ee ON ee.sk_estado_evaluacion = h.sk_estado_evaluacion
        JOIN dm.DimTiempo           tp ON tp.sk_tiempo           = h.sk_tiempo_previsto
        JOIN dm.DimTiempo           tr ON tr.sk_tiempo           = h.sk_tiempo_realizacion
        WHERE h.sk_tiempo_corte = @skCorte
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@idPrograma IS NULL OR p.id_programa = @idPrograma)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
          AND (@instrumento IS NULL OR i.codigo_instrumento = @instrumento)
          AND (@categoriaEvento IS NULL OR (ev.es_no_aplica = 0 AND ev.codigo_categoria = @categoriaEvento))
          AND (@estado IS NULL OR ee.codigo_estado = @estado)
          AND (@buscar IS NULL OR e.codigo_estudiante LIKE @buscar OR e.facultad_o_area LIKE @buscar)
      )
    `;

    const [totalesRow, oportunidadesRows] = await Promise.all([
      this.db.queryDm(
        `
        ${baseCte}
        SELECT
          COUNT(*) AS total_registros,
          COALESCE(SUM(CAST(es_elegible AS INT)), 0) AS elegibles,
          COALESCE(SUM(CAST(es_completada_elegible AS INT)), 0) AS elegibles_completadas,
          COALESCE(SUM(CAST(EsEnVentana AS INT)), 0) AS completadas_en_ventana,
          COALESCE(SUM(CAST(EsTardia AS INT)), 0) AS completadas_tardias,
          COALESCE(SUM(CAST(EsPendiente AS INT)), 0) AS pendientes_en_ventana,
          COALESCE(SUM(CAST(EsVencida AS INT)), 0) AS vencidas,
          COALESCE(SUM(CASE WHEN par_valido = 1 THEN 1 ELSE 0 END), 0) AS en_par_valido
        FROM filtrado
        `,
        params,
      ),
      this.db.queryDm(
        `
        ${baseCte}
        SELECT *
        FROM filtrado
        ORDER BY
          CASE WHEN codigo_instrumento = 'PSS-10' THEN 1 ELSE 2 END,
          codigo_estudiante ASC,
          id_programa ASC,
          CASE WHEN momento = 'INICIAL' THEN 1 ELSE 2 END
        LIMIT @pageSize OFFSET @offset
        `,
        params,
      ),
    ]);

    const t = totalesRow[0] || {};
    const totalRegistros = Number(t.total_registros || 0);
    const elegibles = Number(t.elegibles || 0);
    const elegiblesCompletadas = Number(t.elegibles_completadas || 0);
    const enVentana = Number(t.completadas_en_ventana || 0);
    const tardias = Number(t.completadas_tardias || 0);
    const pendientes = Number(t.pendientes_en_ventana || 0);
    const vencidas = Number(t.vencidas || 0);
    const tasaCumplimiento =
      elegibles > 0 ? Number(((elegiblesCompletadas / elegibles) * 100).toFixed(1)) : null;

    return {
      corte: fechaAplicada,
      resumen_total: {
        total_registros: totalRegistros,
        elegibles,
        elegibles_completadas: elegiblesCompletadas,
        completadas_en_ventana: enVentana,
        completadas_tardias: tardias,
        total_completadas: enVentana + tardias,
        pendientes_en_ventana: pendientes,
        vencidas,
        en_par_valido: Number(t.en_par_valido || 0),
        tasa_cumplimiento: elegibles >= 5 ? tasaCumplimiento : null,
        suprimido: elegibles > 0 && elegibles < 5,
        semaforo: this.semaforoCumplimiento(elegibles, tasaCumplimiento),
      },
      paginacion: {
        page,
        pageSize,
        totalRegistros,
        totalPaginas: Math.max(1, Math.ceil(totalRegistros / pageSize)),
      },
      oportunidades: oportunidadesRows.map((r) => ({
        ...r,
        es_elegible: Boolean(r.es_elegible),
        es_completada_elegible: Boolean(r.es_completada_elegible),
        par_valido: Boolean(r.par_valido),
      })),
    };
  }
}
