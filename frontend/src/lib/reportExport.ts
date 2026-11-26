export type ReportExportFormat = 'pdf' | 'docx' | 'xlsx' | 'csv';

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
}

export interface ExportReportOptions<T> {
  format: ReportExportFormat;
  title: string;
  subtitle?: string;
  filename: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

// Paleta oficial MMET BI (globals.css & tailwind.config.ts)
const PALETTE = {
  navyHex: '0B1220',
  inkHex: '0F172A',
  tealHex: '0D9488',
  tealBrightHex: '14B8A6',
  tealSoftHex: 'F0FDFA',
  tealTextHex: '0F766E',
  slateHeaderHex: '1E293B',
  zebraHex: 'F8FAFC',
  canvasHex: 'F1F5F9',
  borderHex: 'E2E8F0',
  borderDarkHex: 'CBD5E1',
  mutedHex: '64748B',
  whiteHex: 'FFFFFF',
  navyRgb: [11, 18, 32] as [number, number, number],
  inkRgb: [15, 23, 42] as [number, number, number],
  tealRgb: [13, 148, 136] as [number, number, number],
  tealBrightRgb: [20, 184, 166] as [number, number, number],
  tealLightTextRgb: [94, 234, 212] as [number, number, number],
  zebraRgb: [248, 250, 252] as [number, number, number],
  borderRgb: [226, 232, 240] as [number, number, number],
  mutedRgb: [100, 116, 139] as [number, number, number],
  whiteRgb: [255, 255, 255] as [number, number, number],
};

interface StatusStyle {
  bgHex: string;
  textHex: string;
  bgRgb: [number, number, number];
  textRgb: [number, number, number];
}

function getStatusStyle(rawValue: string): StatusStyle | null {
  const val = rawValue.trim().toUpperCase();
  if (
    val === 'BUENO' ||
    val === 'ACTIVO' ||
    val === 'COMPLETADA_EN_VENTANA' ||
    val === 'EN VENTANA'
  ) {
    return {
      bgHex: 'ECFDF5',
      textHex: '047857',
      bgRgb: [236, 253, 245],
      textRgb: [4, 120, 87],
    };
  }
  if (
    val === 'REGULAR' ||
    val === 'EN_RIESGO' ||
    val === 'EN RIESGO' ||
    val === 'COMPLETADA_TARDIA' ||
    val === 'PENDIENTE_EN_VENTANA'
  ) {
    return {
      bgHex: 'FFFBEB',
      textHex: 'B45309',
      bgRgb: [255, 251, 235],
      textRgb: [180, 83, 9],
    };
  }
  if (
    val === 'MALO' ||
    val === 'ABANDONO' ||
    val === 'RETIRADO' ||
    val === 'VENCIDA'
  ) {
    return {
      bgHex: 'FEF2F2',
      textHex: 'B91C1C',
      bgRgb: [254, 242, 242],
      textRgb: [185, 28, 28],
    };
  }
  if (
    val === 'SUPRIMIDO' ||
    val === 'NO_EVALUABLE' ||
    val === 'NO EVALUABLE' ||
    val === 'SIN_DATOS'
  ) {
    return {
      bgHex: 'F1F5F9',
      textHex: '475569',
      bgRgb: [241, 245, 249],
      textRgb: [71, 85, 105],
    };
  }
  return null;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.(csv|xlsx|pdf|docx)$/i, '');
}

function formatCellValue(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'SI' : 'NO';
  return String(val);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getFormattedTimestamp(): string {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
}

export async function exportReport<T>(options: ExportReportOptions<T>): Promise<void> {
  const baseName = stripExtension(options.filename);

  switch (options.format) {
    case 'csv':
      exportCsv(options, `${baseName}.csv`);
      return;
    case 'xlsx':
      await exportExcel(options, `${baseName}.xlsx`);
      return;
    case 'pdf':
      await exportPdf(options, `${baseName}.pdf`);
      return;
    case 'docx':
      await exportWord(options, `${baseName}.docx`);
      return;
  }
}

function exportCsv<T>(options: ExportReportOptions<T>, filename: string) {
  const headerLine = options.columns.map((c) => escapeCsvCell(c.header)).join(',');
  const bodyLines = options.rows.map((row) =>
    options.columns.map((c) => escapeCsvCell(c.accessor(row))).join(','),
  );
  const csvContent = '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

async function exportExcel<T>(options: ExportReportOptions<T>, filename: string) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MMET BI · UNT Trujillo';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Reporte MMET BI', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  const colCount = Math.max(1, options.columns.length);
  const timestamp = getFormattedTimestamp();

  // Fila 1: Banner institucional oscuro (#0B1220)
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `MMET BI · UNT Trujillo — ${options.title}`;
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: `FF${PALETTE.whiteHex}` } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${PALETTE.navyHex}` } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  // Fila 2: Subtítulo + metadatos con acento teal suave
  sheet.mergeCells(2, 1, 2, colCount);
  const metaCell = sheet.getCell(2, 1);
  const metaParts = [
    options.subtitle ? options.subtitle : null,
    `Generado: ${timestamp}`,
    `Registros: ${options.rows.length}`,
  ].filter(Boolean);
  metaCell.value = metaParts.join('  |  ');
  metaCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: `FF${PALETTE.tealTextHex}` } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${PALETTE.tealSoftHex}` } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  metaCell.border = {
    bottom: { style: 'medium', color: { argb: `FF${PALETTE.tealBrightHex}` } },
  };
  sheet.getRow(2).height = 22;

  // Fila 3: Espaciador
  sheet.getRow(3).height = 8;

  // Fila 4: Cabecera de tabla (#0D9488)
  const headerRow = sheet.getRow(4);
  headerRow.height = 26;
  options.columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: `FF${PALETTE.whiteHex}` } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${PALETTE.tealHex}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${PALETTE.navyHex}` } },
      bottom: { style: 'medium', color: { argb: `FF${PALETTE.navyHex}` } },
      left: { style: 'thin', color: { argb: `FF${PALETTE.tealBrightHex}` } },
      right: { style: 'thin', color: { argb: `FF${PALETTE.tealBrightHex}` } },
    };
  });

  // Filas de datos
  const colWidths = options.columns.map((c) => Math.max(12, c.header.length + 4));

  options.rows.forEach((row, rowIdx) => {
    const excelRow = sheet.getRow(5 + rowIdx);
    excelRow.height = 21;
    const isZebra = rowIdx % 2 === 1;

    options.columns.forEach((col, colIdx) => {
      const raw = col.accessor(row);
      const textVal = formatCellValue(raw);
      const cell = excelRow.getCell(colIdx + 1);

      if (typeof raw === 'number' && !Number.isNaN(raw)) {
        cell.value = raw;
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.value = textVal;
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }

      colWidths[colIdx] = Math.min(42, Math.max(colWidths[colIdx], textVal.length + 3));

      const statusStyle = getStatusStyle(textVal);
      if (statusStyle) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: `FF${statusStyle.textHex}` } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${statusStyle.bgHex}` } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: colIdx === 0,
          color: { argb: `FF${PALETTE.inkHex}` },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${isZebra ? PALETTE.zebraHex : PALETTE.whiteHex}` },
        };
      }

      cell.border = {
        bottom: { style: 'thin', color: { argb: `FF${PALETTE.borderHex}` } },
        left: { style: 'hair', color: { argb: `FF${PALETTE.borderHex}` } },
        right: { style: 'hair', color: { argb: `FF${PALETTE.borderHex}` } },
      };
    });
  });

  // Autofiltro en tabla
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, 4 + options.rows.length), column: colCount },
  };

  // Ajuste de anchos de columna
  colWidths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });

  // Pie institucional
  const footerRowIdx = 6 + options.rows.length;
  sheet.mergeCells(footerRowIdx, 1, footerRowIdx, colCount);
  const footerCell = sheet.getCell(footerRowIdx, 1);
  footerCell.value = 'MMET BI · Fuente oficial: Data Mart Analítico (MMET_BI_DM) · Reporte de gestión y bienestar universitario';
  footerCell.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: `FF${PALETTE.mutedHex}` } };
  footerCell.alignment = { vertical: 'middle', horizontal: 'left' };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename);
}

async function exportPdf<T>(options: ExportReportOptions<T>, filename: string) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;

  const orientation = options.columns.length >= 6 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 32;
  const timestamp = getFormattedTimestamp();

  // Encabezado corporativo (#0B1220) con franja teal (#14B8A6)
  const headerHeight = 76;
  doc.setFillColor(...PALETTE.navyRgb);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  doc.setFillColor(...PALETTE.tealBrightRgb);
  doc.rect(0, headerHeight, pageWidth, 3.5, 'F');

  // Etiqueta institucional
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PALETTE.tealLightTextRgb);
  doc.text('MMET BI  ·  INTELIGENCIA DE NEGOCIOS  ·  UNT TRUJILLO', marginX, 22);

  // Título del reporte
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PALETTE.whiteRgb);
  const maxTitleWidth = pageWidth - marginX * 2 - 170;
  const titleLines = doc.splitTextToSize(options.title, maxTitleWidth);
  doc.text(titleLines[0] || options.title, marginX, 43);

  // Subtítulo
  if (options.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    const subLines = doc.splitTextToSize(options.subtitle, maxTitleWidth);
    doc.text(subLines[0] || '', marginX, 60);
  }

  // Bloque de metadatos a la derecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generado: ${timestamp}`, pageWidth - marginX, 34, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...PALETTE.tealLightTextRgb);
  doc.text(`Total registros: ${options.rows.length}`, pageWidth - marginX, 50, { align: 'right' });

  const head = [options.columns.map((c) => c.header)];
  const body = options.rows.map((row) =>
    options.columns.map((c) => formatCellValue(c.accessor(row))),
  );

  autoTable(doc, {
    head,
    body,
    startY: headerHeight + 18,
    margin: { left: marginX, right: marginX, bottom: 38 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: options.columns.length >= 9 ? 7.5 : 8.5,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
      textColor: PALETTE.inkRgb,
      lineColor: PALETTE.borderRgb,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: PALETTE.tealRgb,
      textColor: PALETTE.whiteRgb,
      fontStyle: 'bold',
      fontSize: options.columns.length >= 9 ? 7.5 : 8.5,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: PALETTE.zebraRgb,
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const text = String(data.cell.raw ?? '');
        const statusStyle = getStatusStyle(text);
        if (statusStyle) {
          data.cell.styles.fillColor = statusStyle.bgRgb;
          data.cell.styles.textColor = statusStyle.textRgb;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'center';
        } else if (data.column.index === 0) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setDrawColor(...PALETTE.borderRgb);
      doc.setLineWidth(0.75);
      doc.line(marginX, pageHeight - 28, pageWidth - marginX, pageHeight - 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...PALETTE.mutedRgb);
      doc.text(
        'MMET BI · Reporte oficial generado desde Data Mart (MMET_BI_DM)',
        marginX,
        pageHeight - 15,
      );
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        pageWidth - marginX,
        pageHeight - 15,
        { align: 'right' },
      );
    },
  });

  // Actualizar total de páginas en pies (jsPDF añade páginas conforme avanza)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...PALETTE.whiteRgb);
    doc.rect(pageWidth - marginX - 95, pageHeight - 24, 96, 14, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PALETTE.mutedRgb);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginX, pageHeight - 15, {
      align: 'right',
    });
  }

  doc.save(filename);
}

async function exportWord<T>(options: ExportReportOptions<T>, filename: string) {
  const docx = await import('docx');
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Packer,
    PageNumber,
    PageOrientation,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = docx;

  const isLandscape = options.columns.length >= 6;
  const timestamp = getFormattedTimestamp();

  // Banner institucional (#0B1220) con franja inferior teal (#14B8A6)
  const bannerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: PALETTE.navyHex },
            margins: { top: 180, bottom: 180, left: 220, right: 220 },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              bottom: { style: BorderStyle.SINGLE, size: 24, color: PALETTE.tealBrightHex },
            },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: 'MMET BI  ·  INTELIGENCIA DE NEGOCIOS  ·  UNT TRUJILLO',
                    bold: true,
                    size: 16,
                    color: '5EEAD4',
                    font: 'Calibri',
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: options.subtitle ? 60 : 0 },
                children: [
                  new TextRun({
                    text: options.title,
                    bold: true,
                    size: 28,
                    color: PALETTE.whiteHex,
                    font: 'Calibri',
                  }),
                ],
              }),
              ...(options.subtitle
                ? [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: options.subtitle,
                          size: 18,
                          color: 'CBD5E1',
                          font: 'Calibri',
                        }),
                      ],
                    }),
                  ]
                : []),
            ],
          }),
        ],
      }),
    ],
  });

  // Barra de metadatos
  const metaBar = new Paragraph({
    spacing: { before: 120, after: 180 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: PALETTE.tealSoftHex },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: PALETTE.tealHex },
    },
    indent: { left: 120, right: 120 },
    children: [
      new TextRun({
        text: `  Generado: ${timestamp}   |   Registros exportados: ${options.rows.length}   |   Fuente: Data Mart (MMET_BI_DM)`,
        size: 17,
        color: PALETTE.tealTextHex,
        font: 'Calibri',
        italics: true,
      }),
    ],
  });

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: PALETTE.borderDarkHex };

  // Fila de encabezados de tabla
  const headerRow = new TableRow({
    tableHeader: true,
    children: options.columns.map(
      (col) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: PALETTE.tealHex },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: PALETTE.navyHex },
            bottom: { style: BorderStyle.SINGLE, size: 10, color: PALETTE.navyHex },
            left: cellBorder,
            right: cellBorder,
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: col.header,
                  bold: true,
                  size: options.columns.length >= 9 ? 16 : 18,
                  color: PALETTE.whiteHex,
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        }),
    ),
  });

  // Filas de datos
  const dataRows = options.rows.map((row, rowIdx) => {
    const isZebra = rowIdx % 2 === 1;
    return new TableRow({
      children: options.columns.map((col, colIdx) => {
        const textVal = formatCellValue(col.accessor(row));
        const statusStyle = getStatusStyle(textVal);
        const fill = statusStyle
          ? statusStyle.bgHex
          : isZebra
            ? PALETTE.zebraHex
            : PALETTE.whiteHex;
        const textColor = statusStyle ? statusStyle.textHex : PALETTE.inkHex;

        return new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 75, bottom: 75, left: 95, right: 95 },
          borders: {
            top: cellBorder,
            bottom: cellBorder,
            left: cellBorder,
            right: cellBorder,
          },
          children: [
            new Paragraph({
              alignment: statusStyle ? AlignmentType.CENTER : AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: textVal,
                  bold: Boolean(statusStyle) || colIdx === 0,
                  size: options.columns.length >= 9 ? 15 : 17,
                  color: textColor,
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        });
      }),
    });
  });

  const dataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });

  const doc = new Document({
    creator: 'MMET BI · UNT Trujillo',
    title: options.title,
    description: options.subtitle || options.title,
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { top: 600, bottom: 600, left: 600, right: 600 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: PALETTE.borderHex },
                },
                spacing: { before: 80 },
                children: [
                  new TextRun({
                    text: 'MMET BI · Reporte oficial generado desde Data Mart (MMET_BI_DM)   —   Página ',
                    size: 15,
                    color: PALETTE.mutedHex,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 15,
                    color: PALETTE.mutedHex,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    text: ' de ',
                    size: 15,
                    color: PALETTE.mutedHex,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 15,
                    color: PALETTE.mutedHex,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [bannerTable, metaBar, dataTable],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, filename);
}
