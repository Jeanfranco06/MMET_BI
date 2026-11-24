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

  async getFiltros() {
    const [practicas, programas, facultades, gruposEtarios, sexos, rangoFechas] = await Promise.all([
      this.db.query(`
        SELECT id_practica, codigo_practica, nombre_practica, descripcion, es_mixto
        FROM dbo.cat_practicas
        WHERE activo = 1
        ORDER BY id_practica
      `),
      this.db.query(`
        SELECT p.id_programa, p.codigo_programa, p.nombre_programa, p.periodo_academico,
               p.id_practica_principal, cp.codigo_practica, cp.nombre_practica,
               CONVERT(VARCHAR(10), p.fecha_inicio, 23) AS fecha_inicio,
               CONVERT(VARCHAR(10), p.fecha_cierre, 23) AS fecha_cierre,
               p.estado_programa
        FROM dbo.programas p
        JOIN dbo.cat_practicas cp ON cp.id_practica = p.id_practica_principal
        ORDER BY p.fecha_inicio, p.id_programa
      `),
      this.db.query(`
        SELECT DISTINCT facultad_o_area AS facultad
        FROM dbo.estudiantes
        ORDER BY facultad_o_area
      `),
      this.db.query(`
        SELECT DISTINCT grupo_etario
        FROM dbo.estudiantes
        ORDER BY grupo_etario
      `),
      this.db.query(`
        SELECT DISTINCT sexo_codificado
        FROM dbo.estudiantes
        ORDER BY sexo_codificado
      `),
      this.db.query(`
        SELECT CONVERT(VARCHAR(10), MIN(fecha_inicio), 23) AS fecha_min,
               CONVERT(VARCHAR(10), MAX(ventana_final_fin), 23) AS fecha_max
        FROM dbo.programas
      `),
    ]);

    return {
      practicas,
      programas,
      facultades: facultades.map((f) => f.facultad),
      gruposEtarios: gruposEtarios.map((g) => g.grupo_etario),
      sexos: sexos.map((s) => s.sexo_codificado),
      semestres: Array.from(new Set(programas.map((p: any) => p.periodo_academico))),
      rangoFechas: rangoFechas[0] || { fecha_min: '2026-08-01', fecha_max: '2026-12-31' },
    };
  }

  async getResumen(f: FiltrosQuery) {
    const params: Record<string, any> = {
      corte: f.corte,
      idPrograma: f.idPrograma ?? null,
      idPractica: f.idPractica ?? null,
      facultad: f.facultad ?? null,
    };

    // 1. Pares válidos PSS-10 y PCL-5 (en_ventana = 1, es_vigente = 1, fecha_realizacion <= corte)
    const paresRows = await this.db.query(
      `
      WITH pares AS (
        SELECT
          op_ini.codigo_instrumento,
          r_ini.puntaje_total AS ini_pts,
          r_fin.puntaje_total AS fin_pts,
          (r_ini.puntaje_total - r_fin.puntaje_total) AS delta_pts
        FROM dbo.oportunidades_evaluacion op_ini
        JOIN dbo.resultados_evaluacion r_ini
          ON r_ini.id_oportunidad = op_ini.id_oportunidad
         AND r_ini.es_vigente = 1 AND r_ini.estado_validez = N'VALIDO'
         AND r_ini.en_ventana = 1 AND r_ini.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.oportunidades_evaluacion op_fin
          ON op_fin.id_asignacion = op_ini.id_asignacion
         AND op_fin.id_instrumento = op_ini.id_instrumento
         AND op_fin.momento = N'FINAL'
         AND (
              (op_ini.codigo_instrumento = N'PSS-10' AND op_fin.id_evento_indice IS NULL)
              OR
              (op_ini.codigo_instrumento = N'PCL-5' AND op_fin.id_evento_indice = op_ini.id_evento_indice)
             )
        JOIN dbo.resultados_evaluacion r_fin
          ON r_fin.id_oportunidad = op_fin.id_oportunidad
         AND r_fin.es_vigente = 1 AND r_fin.estado_validez = N'VALIDO'
         AND r_fin.en_ventana = 1 AND r_fin.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.programas p ON p.id_programa = op_ini.id_programa
        JOIN dbo.estudiantes e ON e.id_estudiante = op_ini.id_estudiante
        WHERE op_ini.momento = N'INICIAL'
          AND op_ini.aplicable = 1 AND op_fin.aplicable = 1
          AND (@idPrograma IS NULL OR op_ini.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR p.id_practica_principal = @idPractica)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
      )
      SELECT
        codigo_instrumento,
        COUNT(*) AS pares_validos,
        CAST(AVG(CAST(ini_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_inicial,
        CAST(AVG(CAST(fin_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_final,
        CAST(AVG(CAST(delta_pts AS FLOAT)) AS DECIMAL(6,2)) AS reduccion_promedio,
        SUM(CASE WHEN delta_pts > 0 THEN 1 ELSE 0 END) AS disminuyeron,
        SUM(CASE WHEN delta_pts = 0 THEN 1 ELSE 0 END) AS sin_cambio,
        SUM(CASE WHEN delta_pts < 0 THEN 1 ELSE 0 END) AS aumentaron
      FROM pares
      GROUP BY codigo_instrumento
      `,
      params,
    );

    const pssRow = paresRows.find((r) => r.codigo_instrumento === 'PSS-10');
    const pclRow = paresRows.find((r) => r.codigo_instrumento === 'PCL-5');

    // 2. Continuidad Estudiantil (KPI-03) al corte C
    const contRows = await this.db.query(
      `
      WITH ses_corte AS (
        SELECT id_sesion, id_programa, fecha_sesion, numero_sesion
        FROM dbo.sesiones
        WHERE estado_sesion = N'REALIZADA'
          AND fecha_sesion <= CAST(@corte AS DATE)
      ),
      primera_asis AS (
        SELECT asis.id_asignacion, MIN(sc.fecha_sesion) AS fecha_primera
        FROM dbo.asistencias asis
        JOIN ses_corte sc ON sc.id_sesion = asis.id_sesion
        WHERE asis.estado_asistencia = N'ASISTIO'
        GROUP BY asis.id_asignacion
      ),
      ses_post_inicio AS (
        SELECT
          a.id_asignacion,
          a.fecha_retiro,
          sc.id_sesion,
          sc.fecha_sesion,
          asis.estado_asistencia,
          ROW_NUMBER() OVER (PARTITION BY a.id_asignacion ORDER BY sc.fecha_sesion DESC, sc.numero_sesion DESC) AS rn_reciente,
          COUNT(*) OVER (PARTITION BY a.id_asignacion) AS sesiones_desde_inicio
        FROM dbo.asignaciones a
        JOIN dbo.programas p ON p.id_programa = a.id_programa
        JOIN dbo.estudiantes e ON e.id_estudiante = a.id_estudiante
        JOIN primera_asis pa ON pa.id_asignacion = a.id_asignacion
        JOIN ses_corte sc ON sc.id_programa = a.id_programa AND sc.fecha_sesion >= pa.fecha_primera
        LEFT JOIN dbo.asistencias asis ON asis.id_asignacion = a.id_asignacion AND asis.id_sesion = sc.id_sesion
        WHERE (@idPrograma IS NULL OR a.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR p.id_practica_principal = @idPractica)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
      ),
      clasif AS (
        SELECT
          id_asignacion,
          MAX(sesiones_desde_inicio) AS sesiones_desde_inicio,
          MAX(fecha_retiro) AS fecha_retiro,
          MAX(CASE WHEN rn_reciente = 1 AND estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ultima,
          SUM(CASE WHEN rn_reciente <= 3 AND estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ult3
        FROM ses_post_inicio
        GROUP BY id_asignacion
      ),
      estados AS (
        SELECT
          id_asignacion,
          CASE
            WHEN sesiones_desde_inicio < 3 THEN N'NO_EVALUABLE'
            WHEN fecha_retiro IS NOT NULL AND fecha_retiro <= CAST(@corte AS DATE) THEN N'RETIRADO'
            WHEN asistio_ultima = 1 THEN N'ACTIVO'
            WHEN asistio_ult3 >= 1 THEN N'EN_RIESGO'
            ELSE N'ABANDONO'
          END AS estado_continuidad
        FROM clasif
      )
      SELECT
        SUM(CASE WHEN estado_continuidad <> N'NO_EVALUABLE' THEN 1 ELSE 0 END) AS evaluables,
        SUM(CASE WHEN estado_continuidad IN (N'ACTIVO', N'EN_RIESGO') THEN 1 ELSE 0 END) AS continuan,
        SUM(CASE WHEN estado_continuidad = N'ACTIVO' THEN 1 ELSE 0 END) AS activos,
        SUM(CASE WHEN estado_continuidad = N'EN_RIESGO' THEN 1 ELSE 0 END) AS en_riesgo,
        SUM(CASE WHEN estado_continuidad = N'ABANDONO' THEN 1 ELSE 0 END) AS abandono,
        SUM(CASE WHEN estado_continuidad = N'RETIRADO' THEN 1 ELSE 0 END) AS retirados,
        SUM(CASE WHEN estado_continuidad = N'NO_EVALUABLE' THEN 1 ELSE 0 END) AS no_evaluables
      FROM estados
      `,
      params,
    );

    const cont = contRows[0] || {};
    const evaluables = Number(cont.evaluables || 0);
    const continuan = Number(cont.continuan || 0);
    const tasaContinuidad = evaluables > 0 ? Number(((continuan / evaluables) * 100).toFixed(1)) : null;

    // 3. Cumplimiento de Evaluaciones (KPI-04) al corte C (admite tardías en numerador)
    const cumpRows = await this.db.query(
      `
      SELECT
        COUNT(*) AS elegibles,
        SUM(CASE WHEN r.id_resultado IS NOT NULL THEN 1 ELSE 0 END) AS completadas,
        SUM(CASE WHEN r.id_resultado IS NOT NULL AND r.en_ventana = 1 THEN 1 ELSE 0 END) AS completadas_en_ventana,
        SUM(CASE WHEN r.id_resultado IS NOT NULL AND r.en_ventana = 0 THEN 1 ELSE 0 END) AS completadas_tardias,
        SUM(CASE WHEN r.id_resultado IS NULL AND op.fecha_ventana_fin < CAST(@corte AS DATE) THEN 1 ELSE 0 END) AS vencidas,
        SUM(CASE WHEN r.id_resultado IS NULL AND op.fecha_ventana_fin >= CAST(@corte AS DATE) THEN 1 ELSE 0 END) AS pendientes_en_ventana
      FROM dbo.oportunidades_evaluacion op
      JOIN dbo.programas p ON p.id_programa = op.id_programa
      JOIN dbo.estudiantes e ON e.id_estudiante = op.id_estudiante
      LEFT JOIN dbo.resultados_evaluacion r
        ON r.id_oportunidad = op.id_oportunidad
       AND r.es_vigente = 1 AND r.estado_validez = N'VALIDO'
       AND r.fecha_realizacion <= CAST(@corte AS DATE)
      WHERE op.aplicable = 1
        AND op.fecha_ventana_inicio <= CAST(@corte AS DATE)
        AND (@idPrograma IS NULL OR op.id_programa = @idPrograma)
        AND (@idPractica IS NULL OR p.id_practica_principal = @idPractica)
        AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
      `,
      params,
    );

    const cump = cumpRows[0] || {};
    const elegibles = Number(cump.elegibles || 0);
    const completadas = Number(cump.completadas || 0);
    const tasaCumplimiento = elegibles > 0 ? Number(((completadas / elegibles) * 100).toFixed(1)) : null;

    // 4. Totales operativos generales
    const [totales] = await this.db.query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.estudiantes) AS total_estudiantes,
        (SELECT COUNT(*) FROM dbo.programas) AS total_programas,
        (SELECT COUNT(*) FROM dbo.sesiones WHERE estado_sesion = N'REALIZADA' AND fecha_sesion <= CAST(@corte AS DATE)) AS sesiones_realizadas,
        (SELECT COUNT(*) FROM dbo.asistencias) AS total_asistencias
    `, { corte: f.corte });

    const pssPares = Number(pssRow?.pares_validos || 0);
    const pssRed = pssPares >= 5 ? Number(pssRow.reduccion_promedio) : null;
    const pclPares = Number(pclRow?.pares_validos || 0);
    const pclRed = pclPares >= 5 ? Number(pclRow.reduccion_promedio) : null;

    return {
      corte: f.corte,
      totales,
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
        no_evaluables: Number(cont.no_evaluables || 0),
        tasa_continuidad: evaluables >= 5 ? tasaContinuidad : null,
        suprimido: evaluables > 0 && evaluables < 5,
        meta_operativa: '≥ 80.0 %',
        semaforo: this.semaforoContinuidad(evaluables, tasaContinuidad),
      },
      kpi04_cumplimiento: {
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
    agruparPor?: 'programa' | 'facultad' | 'grupo_etario';
    page?: number;
    pageSize?: number;
  }) {
    const agruparPor = f.agruparPor ?? 'programa';
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const params: Record<string, any> = {
      corte: f.corte,
      semestre: f.semestre ?? null,
      facultad: f.facultad ?? null,
      idPrograma: f.idPrograma ?? null,
      idPractica: f.idPractica ?? null,
      grupoEtario: f.grupoEtario ?? null,
      sexo: f.sexo ?? null,
      instrumento: f.instrumento ?? null,
      offset,
      pageSize,
    };

    const dimSelect =
      agruparPor === 'facultad'
        ? `facultad_o_area AS dim_clave, facultad_o_area AS dim_subtitulo, N'' AS codigo_practica`
        : agruparPor === 'grupo_etario'
          ? `grupo_etario AS dim_clave, N'Grupo etario (' + grupo_etario + N' años)' AS dim_subtitulo, N'' AS codigo_practica`
          : `codigo_programa AS dim_clave, codigo_practica + N' · ' + nombre_practica AS dim_subtitulo, codigo_practica`;

    const dimGroup =
      agruparPor === 'facultad'
        ? `facultad_o_area`
        : agruparPor === 'grupo_etario'
          ? `grupo_etario`
          : `codigo_programa, codigo_practica, nombre_practica`;

    const baseCte = `
      WITH pares AS (
        SELECT
          op_ini.codigo_instrumento,
          p.id_programa,
          p.codigo_programa,
          cp.codigo_practica,
          cp.nombre_practica,
          e.facultad_o_area,
          e.grupo_etario,
          e.sexo_codificado,
          r_ini.puntaje_total AS ini_pts,
          r_fin.puntaje_total AS fin_pts,
          (r_ini.puntaje_total - r_fin.puntaje_total) AS delta_pts
        FROM dbo.oportunidades_evaluacion op_ini
        JOIN dbo.resultados_evaluacion r_ini
          ON r_ini.id_oportunidad = op_ini.id_oportunidad
         AND r_ini.es_vigente = 1 AND r_ini.estado_validez = N'VALIDO'
         AND r_ini.en_ventana = 1 AND r_ini.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.oportunidades_evaluacion op_fin
          ON op_fin.id_asignacion = op_ini.id_asignacion
         AND op_fin.id_instrumento = op_ini.id_instrumento
         AND op_fin.momento = N'FINAL'
         AND (
              (op_ini.codigo_instrumento = N'PSS-10' AND op_fin.id_evento_indice IS NULL)
              OR
              (op_ini.codigo_instrumento = N'PCL-5' AND op_fin.id_evento_indice = op_ini.id_evento_indice)
             )
        JOIN dbo.resultados_evaluacion r_fin
          ON r_fin.id_oportunidad = op_fin.id_oportunidad
         AND r_fin.es_vigente = 1 AND r_fin.estado_validez = N'VALIDO'
         AND r_fin.en_ventana = 1 AND r_fin.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.programas p ON p.id_programa = op_ini.id_programa
        JOIN dbo.cat_practicas cp ON cp.id_practica = p.id_practica_principal
        JOIN dbo.estudiantes e ON e.id_estudiante = op_ini.id_estudiante
        WHERE op_ini.momento = N'INICIAL'
          AND op_ini.aplicable = 1 AND op_fin.aplicable = 1
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
          AND (@idPrograma IS NULL OR op_ini.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR p.id_practica_principal = @idPractica)
          AND (@grupoEtario IS NULL OR e.grupo_etario = @grupoEtario)
          AND (@sexo IS NULL OR e.sexo_codificado = @sexo)
          AND (@instrumento IS NULL OR op_ini.codigo_instrumento = @instrumento)
      ),
      agrupado AS (
        SELECT
          codigo_instrumento,
          ${dimSelect},
          COUNT(*) AS pares_validos,
          CAST(AVG(CAST(ini_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_inicial,
          CAST(AVG(CAST(fin_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_final,
          CAST(AVG(CAST(delta_pts AS FLOAT)) AS DECIMAL(6,2)) AS reduccion_promedio,
          SUM(CASE WHEN delta_pts > 0 THEN 1 ELSE 0 END) AS disminuyeron,
          SUM(CASE WHEN delta_pts = 0 THEN 1 ELSE 0 END) AS sin_cambio,
          SUM(CASE WHEN delta_pts < 0 THEN 1 ELSE 0 END) AS aumentaron
        FROM pares
        GROUP BY codigo_instrumento, ${dimGroup}
      )
    `;

    const [totalesInst, countRow, filasRaw] = await Promise.all([
      this.db.query(
        `
        ${baseCte}
        SELECT
          codigo_instrumento,
          COUNT(*) AS pares_validos,
          CAST(AVG(CAST(ini_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_inicial,
          CAST(AVG(CAST(fin_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_final,
          CAST(AVG(CAST(delta_pts AS FLOAT)) AS DECIMAL(6,2)) AS reduccion_promedio,
          SUM(CASE WHEN delta_pts > 0 THEN 1 ELSE 0 END) AS disminuyeron,
          SUM(CASE WHEN delta_pts = 0 THEN 1 ELSE 0 END) AS sin_cambio,
          SUM(CASE WHEN delta_pts < 0 THEN 1 ELSE 0 END) AS aumentaron
        FROM pares
        GROUP BY codigo_instrumento
        ORDER BY CASE WHEN codigo_instrumento = N'PSS-10' THEN 1 ELSE 2 END
        `,
        params,
      ),
      this.db.query(
        `
        ${baseCte}
        SELECT COUNT(*) AS total_registros FROM agrupado
        `,
        params,
      ),
      this.db.query(
        `
        ${baseCte}
        SELECT *
        FROM agrupado
        ORDER BY
          CASE WHEN codigo_instrumento = N'PSS-10' THEN 1 ELSE 2 END,
          dim_clave ASC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
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
      corte: f.corte,
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
    const params = {
      instrumento: q.instrumento,
      corte: q.corte,
      semestre: q.semestre ?? null,
      facultad: q.facultad ?? null,
    };

    const metaPts = q.instrumento === 'PSS-10' ? 4.0 : 10.0;

    const porPracticaRaw = await this.db.query(
      `
      WITH pares AS (
        SELECT
          cp.id_practica,
          cp.codigo_practica,
          cp.nombre_practica,
          cp.descripcion,
          r_ini.puntaje_total AS ini_pts,
          r_fin.puntaje_total AS fin_pts,
          (r_ini.puntaje_total - r_fin.puntaje_total) AS delta_pts
        FROM dbo.oportunidades_evaluacion op_ini
        JOIN dbo.resultados_evaluacion r_ini
          ON r_ini.id_oportunidad = op_ini.id_oportunidad
         AND r_ini.es_vigente = 1 AND r_ini.estado_validez = N'VALIDO'
         AND r_ini.en_ventana = 1 AND r_ini.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.oportunidades_evaluacion op_fin
          ON op_fin.id_asignacion = op_ini.id_asignacion
         AND op_fin.id_instrumento = op_ini.id_instrumento
         AND op_fin.momento = N'FINAL'
         AND (
              (op_ini.codigo_instrumento = N'PSS-10' AND op_fin.id_evento_indice IS NULL)
              OR
              (op_ini.codigo_instrumento = N'PCL-5' AND op_fin.id_evento_indice = op_ini.id_evento_indice)
             )
        JOIN dbo.resultados_evaluacion r_fin
          ON r_fin.id_oportunidad = op_fin.id_oportunidad
         AND r_fin.es_vigente = 1 AND r_fin.estado_validez = N'VALIDO'
         AND r_fin.en_ventana = 1 AND r_fin.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.programas p ON p.id_programa = op_ini.id_programa
        JOIN dbo.cat_practicas cp ON cp.id_practica = p.id_practica_principal
        JOIN dbo.estudiantes e ON e.id_estudiante = op_ini.id_estudiante
        WHERE op_ini.momento = N'INICIAL'
          AND op_ini.codigo_instrumento = @instrumento
          AND op_ini.aplicable = 1 AND op_fin.aplicable = 1
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
      )
      SELECT
        id_practica, codigo_practica, nombre_practica, descripcion,
        COUNT(*) AS pares_validos,
        CAST(AVG(CAST(ini_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_inicial,
        CAST(AVG(CAST(fin_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_final,
        CAST(AVG(CAST(delta_pts AS FLOAT)) AS DECIMAL(6,2)) AS reduccion_promedio,
        SUM(CASE WHEN delta_pts > 0 THEN 1 ELSE 0 END) AS disminuyeron,
        SUM(CASE WHEN delta_pts = 0 THEN 1 ELSE 0 END) AS sin_cambio,
        SUM(CASE WHEN delta_pts < 0 THEN 1 ELSE 0 END) AS aumentaron
      FROM pares
      GROUP BY id_practica, codigo_practica, nombre_practica, descripcion
      ORDER BY reduccion_promedio DESC
      `,
      params,
    );

    const porProgramaRaw = await this.db.query(
      `
      WITH pares AS (
        SELECT
          p.id_programa,
          p.codigo_programa,
          p.nombre_programa,
          cp.codigo_practica,
          cp.nombre_practica,
          p.estado_programa,
          r_ini.puntaje_total AS ini_pts,
          r_fin.puntaje_total AS fin_pts,
          (r_ini.puntaje_total - r_fin.puntaje_total) AS delta_pts
        FROM dbo.oportunidades_evaluacion op_ini
        JOIN dbo.resultados_evaluacion r_ini
          ON r_ini.id_oportunidad = op_ini.id_oportunidad
         AND r_ini.es_vigente = 1 AND r_ini.estado_validez = N'VALIDO'
         AND r_ini.en_ventana = 1 AND r_ini.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.oportunidades_evaluacion op_fin
          ON op_fin.id_asignacion = op_ini.id_asignacion
         AND op_fin.id_instrumento = op_ini.id_instrumento
         AND op_fin.momento = N'FINAL'
         AND (
              (op_ini.codigo_instrumento = N'PSS-10' AND op_fin.id_evento_indice IS NULL)
              OR
              (op_ini.codigo_instrumento = N'PCL-5' AND op_fin.id_evento_indice = op_ini.id_evento_indice)
             )
        JOIN dbo.resultados_evaluacion r_fin
          ON r_fin.id_oportunidad = op_fin.id_oportunidad
         AND r_fin.es_vigente = 1 AND r_fin.estado_validez = N'VALIDO'
         AND r_fin.en_ventana = 1 AND r_fin.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.programas p ON p.id_programa = op_ini.id_programa
        JOIN dbo.cat_practicas cp ON cp.id_practica = p.id_practica_principal
        JOIN dbo.estudiantes e ON e.id_estudiante = op_ini.id_estudiante
        WHERE op_ini.momento = N'INICIAL'
          AND op_ini.codigo_instrumento = @instrumento
          AND op_ini.aplicable = 1 AND op_fin.aplicable = 1
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@facultad IS NULL OR e.facultad_o_area = @facultad)
      )
      SELECT
        id_programa, codigo_programa, nombre_programa, codigo_practica, nombre_practica, estado_programa,
        COUNT(*) AS pares_validos,
        CAST(AVG(CAST(ini_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_inicial,
        CAST(AVG(CAST(fin_pts AS FLOAT)) AS DECIMAL(6,2)) AS promedio_final,
        CAST(AVG(CAST(delta_pts AS FLOAT)) AS DECIMAL(6,2)) AS reduccion_promedio,
        SUM(CASE WHEN delta_pts > 0 THEN 1 ELSE 0 END) AS disminuyeron,
        SUM(CASE WHEN delta_pts = 0 THEN 1 ELSE 0 END) AS sin_cambio,
        SUM(CASE WHEN delta_pts < 0 THEN 1 ELSE 0 END) AS aumentaron
      FROM pares
      GROUP BY id_programa, codigo_programa, nombre_programa, codigo_practica, nombre_practica, estado_programa
      ORDER BY reduccion_promedio DESC
      `,
      params,
    );

    const mapRow = (r: any) => {
      const n = Number(r.pares_validos || 0);
      const red = n >= 5 ? Number(r.reduccion_promedio) : null;
      const sem =
        q.instrumento === 'PSS-10' ? this.semaforoPss(n, red) : this.semaforoPcl(n, red);
      const cumpleMeta = red !== null ? red >= metaPts : null;
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
      corte: q.corte,
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
    estado?: string;
    buscar?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const params = {
      corte: f.corte,
      semestre: f.semestre ?? null,
      idPrograma: f.idPrograma ?? null,
      idPractica: f.idPractica ?? null,
      estado: f.estado ?? null,
      buscar: f.buscar ? `%${f.buscar}%` : null,
      offset,
      pageSize,
    };

    const baseCte = `
      WITH ses_corte AS (
        SELECT id_sesion, id_programa, fecha_sesion, numero_sesion
        FROM dbo.sesiones
        WHERE estado_sesion = N'REALIZADA' AND fecha_sesion <= CAST(@corte AS DATE)
      ),
      primera_asis AS (
        SELECT asis.id_asignacion, MIN(sc.fecha_sesion) AS fecha_primera
        FROM dbo.asistencias asis
        JOIN ses_corte sc ON sc.id_sesion = asis.id_sesion
        WHERE asis.estado_asistencia = N'ASISTIO'
        GROUP BY asis.id_asignacion
      ),
      ses_post AS (
        SELECT
          a.id_asignacion, a.id_estudiante, a.id_programa, a.fecha_retiro,
          sc.id_sesion, sc.fecha_sesion, asis.estado_asistencia,
          ROW_NUMBER() OVER (PARTITION BY a.id_asignacion ORDER BY sc.fecha_sesion DESC, sc.numero_sesion DESC) AS rn_reciente,
          COUNT(*) OVER (PARTITION BY a.id_asignacion) AS sesiones_exigibles
        FROM dbo.asignaciones a
        JOIN dbo.programas p ON p.id_programa = a.id_programa
        JOIN primera_asis pa ON pa.id_asignacion = a.id_asignacion
        JOIN ses_corte sc ON sc.id_programa = a.id_programa AND sc.fecha_sesion >= pa.fecha_primera
        LEFT JOIN dbo.asistencias asis ON asis.id_asignacion = a.id_asignacion AND asis.id_sesion = sc.id_sesion
        WHERE (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@idPrograma IS NULL OR a.id_programa = @idPrograma)
          AND (@idPractica IS NULL OR p.id_practica_principal = @idPractica)
      ),
      clasif AS (
        SELECT
          id_asignacion, id_estudiante, id_programa,
          MAX(sesiones_exigibles) AS sesiones_exigibles,
          SUM(CASE WHEN estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistencias,
          SUM(CASE WHEN estado_asistencia = N'INASISTENCIA' THEN 1 ELSE 0 END) AS inasistencias,
          MAX(CASE WHEN estado_asistencia = N'ASISTIO' THEN fecha_sesion END) AS ultima_asistencia,
          MAX(fecha_retiro) AS fecha_retiro,
          MAX(CASE WHEN rn_reciente = 1 AND estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ultima,
          SUM(CASE WHEN rn_reciente <= 3 AND estado_asistencia = N'ASISTIO' THEN 1 ELSE 0 END) AS asistio_ult3
        FROM ses_post
        GROUP BY id_asignacion, id_estudiante, id_programa
      ),
      estados AS (
        SELECT
          c.id_asignacion,
          c.id_estudiante,
          c.id_programa,
          c.sesiones_exigibles,
          c.asistencias,
          c.inasistencias,
          c.ultima_asistencia,
          c.fecha_retiro,
          CAST(ROUND((CAST(c.asistencias AS FLOAT) / NULLIF(c.sesiones_exigibles, 0)) * 100.0, 1) AS DECIMAL(5,1)) AS asistencia_pct,
          CASE
            WHEN c.sesiones_exigibles < 3 THEN N'NO_EVALUABLE'
            WHEN c.fecha_retiro IS NOT NULL AND c.fecha_retiro <= CAST(@corte AS DATE) THEN N'RETIRADO'
            WHEN c.asistio_ultima = 1 THEN N'ACTIVO'
            WHEN c.asistio_ult3 >= 1 THEN N'EN_RIESGO'
            ELSE N'ABANDONO'
          END AS estado_continuidad
        FROM clasif c
      ),
      filtrado AS (
        SELECT
          e.*,
          es.codigo_anonimizado,
          es.facultad_o_area,
          p.codigo_programa,
          p.nombre_programa,
          cp.codigo_practica,
          cp.nombre_practica
        FROM estados e
        JOIN dbo.estudiantes es ON es.id_estudiante = e.id_estudiante
        JOIN dbo.programas p ON p.id_programa = e.id_programa
        JOIN dbo.cat_practicas cp ON cp.id_practica = p.id_practica_principal
        WHERE (@estado IS NULL OR e.estado_continuidad = @estado)
          AND (@buscar IS NULL OR es.codigo_anonimizado LIKE @buscar)
      )
    `;

    const [totalesRows, estudiantesRows, porProgramaRaw] = await Promise.all([
      this.db.query(
        `${baseCte}
        SELECT
          COUNT(*) AS total_registros,
          SUM(CASE WHEN estado_continuidad <> N'NO_EVALUABLE' THEN 1 ELSE 0 END) AS evaluables,
          SUM(CASE WHEN estado_continuidad IN (N'ACTIVO', N'EN_RIESGO') THEN 1 ELSE 0 END) AS continuan,
          ISNULL(SUM(sesiones_exigibles), 0) AS sesiones_exigibles,
          ISNULL(SUM(asistencias), 0) AS asistencias,
          ISNULL(SUM(inasistencias), 0) AS inasistencias,
          SUM(CASE WHEN estado_continuidad = N'ACTIVO' THEN 1 ELSE 0 END) AS activos,
          SUM(CASE WHEN estado_continuidad = N'EN_RIESGO' THEN 1 ELSE 0 END) AS en_riesgo,
          SUM(CASE WHEN estado_continuidad = N'ABANDONO' THEN 1 ELSE 0 END) AS abandono,
          SUM(CASE WHEN estado_continuidad = N'RETIRADO' THEN 1 ELSE 0 END) AS retirados,
          SUM(CASE WHEN estado_continuidad = N'NO_EVALUABLE' THEN 1 ELSE 0 END) AS no_evaluables
        FROM filtrado`,
        params,
      ),
      this.db.query(
        `${baseCte}
        SELECT
          id_asignacion,
          codigo_anonimizado,
          facultad_o_area,
          codigo_programa,
          codigo_practica,
          nombre_practica,
          sesiones_exigibles,
          asistencias,
          inasistencias,
          asistencia_pct,
          CONVERT(VARCHAR(10), ultima_asistencia, 23) AS ultima_asistencia,
          CONVERT(VARCHAR(10), fecha_retiro, 23) AS fecha_retiro,
          estado_continuidad
        FROM filtrado
        ORDER BY
          CASE estado_continuidad
            WHEN N'EN_RIESGO' THEN 1
            WHEN N'ABANDONO' THEN 2
            WHEN N'RETIRADO' THEN 3
            WHEN N'ACTIVO' THEN 4
            ELSE 5
          END,
          codigo_anonimizado ASC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        params,
      ),
      this.db.query(
        `${baseCte}
        SELECT
          id_programa, codigo_programa, nombre_programa, codigo_practica, nombre_practica,
          SUM(CASE WHEN estado_continuidad <> N'NO_EVALUABLE' THEN 1 ELSE 0 END) AS evaluables,
          SUM(CASE WHEN estado_continuidad IN (N'ACTIVO', N'EN_RIESGO') THEN 1 ELSE 0 END) AS continuan,
          SUM(CASE WHEN estado_continuidad = N'ACTIVO' THEN 1 ELSE 0 END) AS activos,
          SUM(CASE WHEN estado_continuidad = N'EN_RIESGO' THEN 1 ELSE 0 END) AS en_riesgo,
          SUM(CASE WHEN estado_continuidad = N'ABANDONO' THEN 1 ELSE 0 END) AS abandono,
          SUM(CASE WHEN estado_continuidad = N'RETIRADO' THEN 1 ELSE 0 END) AS retirados,
          SUM(CASE WHEN estado_continuidad = N'NO_EVALUABLE' THEN 1 ELSE 0 END) AS no_evaluables
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
      corte: f.corte,
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
    instrumento?: 'PSS-10' | 'PCL-5';
    estado?: string;
    buscar?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const params: Record<string, any> = {
      corte: f.corte,
      semestre: f.semestre ?? null,
      idPrograma: f.idPrograma ?? null,
      instrumento: f.instrumento ?? null,
      estado: f.estado ?? null,
      buscar: f.buscar ? `%${f.buscar}%` : null,
      offset,
      pageSize,
    };

    const baseCte = `
      WITH pares_validos AS (
        SELECT
          op_ini.id_asignacion,
          op_ini.id_instrumento,
          op_ini.id_evento_indice
        FROM dbo.oportunidades_evaluacion op_ini
        JOIN dbo.resultados_evaluacion r_ini
          ON r_ini.id_oportunidad = op_ini.id_oportunidad
         AND r_ini.es_vigente = 1 AND r_ini.estado_validez = N'VALIDO'
         AND r_ini.en_ventana = 1 AND r_ini.fecha_realizacion <= CAST(@corte AS DATE)
        JOIN dbo.oportunidades_evaluacion op_fin
          ON op_fin.id_asignacion = op_ini.id_asignacion
         AND op_fin.id_instrumento = op_ini.id_instrumento
         AND op_fin.momento = N'FINAL'
         AND (
              (op_ini.codigo_instrumento = N'PSS-10' AND op_fin.id_evento_indice IS NULL)
              OR
              (op_ini.codigo_instrumento = N'PCL-5' AND op_fin.id_evento_indice = op_ini.id_evento_indice)
             )
        JOIN dbo.resultados_evaluacion r_fin
          ON r_fin.id_oportunidad = op_fin.id_oportunidad
         AND r_fin.es_vigente = 1 AND r_fin.estado_validez = N'VALIDO'
         AND r_fin.en_ventana = 1 AND r_fin.fecha_realizacion <= CAST(@corte AS DATE)
        WHERE op_ini.momento = N'INICIAL'
          AND op_ini.aplicable = 1 AND op_fin.aplicable = 1
      ),
      op_detalle AS (
        SELECT
          op.id_oportunidad,
          op.id_asignacion,
          op.id_programa,
          e.codigo_anonimizado,
          e.facultad_o_area,
          p.codigo_programa,
          p.periodo_academico,
          cp.codigo_practica,
          op.codigo_instrumento,
          op.momento,
          ev.codigo_evento_local,
          ce.codigo_categoria AS categoria_evento,
          CONVERT(VARCHAR(10), op.fecha_ventana_inicio, 23) AS fecha_ventana_inicio,
          CONVERT(VARCHAR(10), op.fecha_ventana_fin, 23) AS fecha_ventana_fin,
          CONVERT(VARCHAR(10), r.fecha_realizacion, 23) AS fecha_realizacion,
          r.puntaje_total,
          r.numero_version,
          CASE
            WHEN r.id_resultado IS NOT NULL AND r.en_ventana = 1 THEN N'COMPLETADA_EN_VENTANA'
            WHEN r.id_resultado IS NOT NULL AND r.en_ventana = 0 THEN N'COMPLETADA_TARDIA'
            WHEN r.id_resultado IS NULL AND op.fecha_ventana_fin < CAST(@corte AS DATE) THEN N'VENCIDA'
            ELSE N'PENDIENTE_EN_VENTANA'
          END AS estado_evaluacion,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM pares_validos pv
              WHERE pv.id_asignacion = op.id_asignacion
                AND pv.id_instrumento = op.id_instrumento
                AND (
                     (op.codigo_instrumento = N'PSS-10' AND pv.id_evento_indice IS NULL)
                     OR
                     (op.codigo_instrumento = N'PCL-5' AND pv.id_evento_indice = op.id_evento_indice)
                    )
            ) THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
          END AS par_valido
        FROM dbo.oportunidades_evaluacion op
        JOIN dbo.estudiantes e ON e.id_estudiante = op.id_estudiante
        JOIN dbo.programas p ON p.id_programa = op.id_programa
        JOIN dbo.cat_practicas cp ON cp.id_practica = p.id_practica_principal
        LEFT JOIN dbo.eventos_indice ev ON ev.id_evento_indice = op.id_evento_indice
        LEFT JOIN dbo.cat_categorias_evento_indice ce ON ce.id_categoria_evento = ev.id_categoria_evento
        LEFT JOIN dbo.resultados_evaluacion r
          ON r.id_oportunidad = op.id_oportunidad
         AND r.es_vigente = 1 AND r.estado_validez = N'VALIDO'
         AND r.fecha_realizacion <= CAST(@corte AS DATE)
        WHERE op.aplicable = 1
          AND op.fecha_ventana_inicio <= CAST(@corte AS DATE)
          AND (@semestre IS NULL OR p.periodo_academico = @semestre)
          AND (@idPrograma IS NULL OR op.id_programa = @idPrograma)
          AND (@instrumento IS NULL OR op.codigo_instrumento = @instrumento)
          AND (@buscar IS NULL OR e.codigo_anonimizado LIKE @buscar OR e.facultad_o_area LIKE @buscar)
      ),
      filtrado AS (
        SELECT *
        FROM op_detalle
        WHERE (@estado IS NULL OR estado_evaluacion = @estado)
      )
    `;

    const [totalesRow, oportunidadesRows] = await Promise.all([
      this.db.query(
        `
        ${baseCte}
        SELECT
          COUNT(*) AS total_registros,
          SUM(CASE WHEN estado_evaluacion = N'COMPLETADA_EN_VENTANA' THEN 1 ELSE 0 END) AS completadas_en_ventana,
          SUM(CASE WHEN estado_evaluacion = N'COMPLETADA_TARDIA' THEN 1 ELSE 0 END) AS completadas_tardias,
          SUM(CASE WHEN estado_evaluacion = N'PENDIENTE_EN_VENTANA' THEN 1 ELSE 0 END) AS pendientes_en_ventana,
          SUM(CASE WHEN estado_evaluacion = N'VENCIDA' THEN 1 ELSE 0 END) AS vencidas,
          SUM(CASE WHEN par_valido = 1 THEN 1 ELSE 0 END) AS en_par_valido
        FROM filtrado
        `,
        params,
      ),
      this.db.query(
        `
        ${baseCte}
        SELECT *
        FROM filtrado
        ORDER BY
          CASE WHEN codigo_instrumento = N'PSS-10' THEN 1 ELSE 2 END,
          codigo_anonimizado ASC,
          id_programa ASC,
          CASE WHEN momento = N'INICIAL' THEN 1 ELSE 2 END
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `,
        params,
      ),
    ]);

    const t = totalesRow[0] || {};
    const totalRegistros = Number(t.total_registros || 0);
    const enVentana = Number(t.completadas_en_ventana || 0);
    const tardias = Number(t.completadas_tardias || 0);
    const totalCompletadas = enVentana + tardias;
    const pendientes = Number(t.pendientes_en_ventana || 0);
    const vencidas = Number(t.vencidas || 0);
    const tasaCumplimiento =
      totalRegistros > 0 ? Number(((totalCompletadas / totalRegistros) * 100).toFixed(1)) : null;

    return {
      corte: f.corte,
      resumen_total: {
        total_registros: totalRegistros,
        elegibles: totalRegistros,
        completadas_en_ventana: enVentana,
        completadas_tardias: tardias,
        total_completadas: totalCompletadas,
        pendientes_en_ventana: pendientes,
        vencidas,
        en_par_valido: Number(t.en_par_valido || 0),
        tasa_cumplimiento: totalRegistros >= 5 ? tasaCumplimiento : null,
        suprimido: totalRegistros > 0 && totalRegistros < 5,
        semaforo: this.semaforoCumplimiento(totalRegistros, tasaCumplimiento),
      },
      paginacion: {
        page,
        pageSize,
        totalRegistros,
        totalPaginas: Math.max(1, Math.ceil(totalRegistros / pageSize)),
      },
      oportunidades: oportunidadesRows.map((r) => ({
        ...r,
        par_valido: Boolean(r.par_valido),
      })),
    };
  }
}
