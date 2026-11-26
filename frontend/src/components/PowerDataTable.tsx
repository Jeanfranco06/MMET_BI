'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { exportReport, type ReportExportFormat } from '@/lib/reportExport';

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
}

interface ServerPagination {
  page: number;
  pageSize: number;
  totalRegistros: number;
  totalPaginas: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

interface PowerDataTableProps<T> {
  title: string;
  subtitle?: string;
  caption: string;
  data: T[];
  columns: ColumnDef<T, any>[];
  csvColumns: CsvColumn<T>[];
  csvFilename: string;
  searchPlaceholder?: string;
  initialSorting?: SortingState;
  emptyTitle?: string;
  emptyDescription?: string;
  headerRight?: ReactNode;
  serverPagination?: ServerPagination;
  externalSearch?: {
    value: string;
    onChange: (v: string) => void;
  };
}

export function DataBarCell({
  value,
  max = 100,
  display,
  tone = 'teal',
}: {
  value: number | null | undefined;
  max?: number;
  display: string;
  tone?: 'teal' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'sky';
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="text-xs text-slate-400 tabular-nums">—</span>;
  }
  const pct = Math.max(0, Math.min(100, (Math.abs(value) / Math.max(1, max)) * 100));
  const barColors: Record<string, string> = {
    teal: 'bg-teal-500/20 border-teal-500/40',
    emerald: 'bg-emerald-500/20 border-emerald-500/40',
    amber: 'bg-amber-500/25 border-amber-500/40',
    rose: 'bg-rose-500/20 border-rose-500/40',
    indigo: 'bg-indigo-500/20 border-indigo-500/40',
    sky: 'bg-sky-500/20 border-sky-500/40',
  };
  const fillColors: Record<string, string> = {
    teal: 'bg-teal-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    indigo: 'bg-indigo-500',
    sky: 'bg-sky-500',
  };

  return (
    <div className="min-w-[104px] flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-xs text-slate-800 tabular-nums">{display}</span>
      </div>
      <div className={`w-full h-1.5 rounded-full overflow-hidden border ${barColors[tone]}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillColors[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PowerDataTable<T>({
  title,
  subtitle,
  caption,
  data,
  columns,
  csvColumns,
  csvFilename,
  searchPlaceholder = 'Buscar en la tabla...',
  initialSorting = [],
  emptyTitle = 'Sin registros para mostrar',
  emptyDescription = 'Ajusta los filtros activos o limpia el filtro cruzado para ver más registros.',
  headerRight,
  serverPagination,
  externalSearch,
}: PowerDataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [localSearch, setLocalSearch] = useState('');
  const [sortStatusText, setSortStatusText] = useState('');
  const [exportingFormat, setExportingFormat] = useState<ReportExportFormat | null>(null);
  const captionId = useId();
  const exportPopoverId = useId();
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const exportPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const popoverEl = exportPopoverRef.current;
    if (!popoverEl) return;

    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      if (toggleEvent.newState !== 'open') return;
      if (typeof CSS !== 'undefined' && CSS.supports('position-area: block-end')) return;

      const triggerEl = exportTriggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const popRect = popoverEl.getBoundingClientRect();
      const margin = 8;

      let left = rect.right - popRect.width;
      if (left < margin) left = Math.max(margin, rect.left);
      if (left + popRect.width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - popRect.width - margin);
      }

      let top = rect.bottom + 6;
      if (top + popRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - popRect.height - 6);
      }

      popoverEl.style.left = `${left}px`;
      popoverEl.style.top = `${top}px`;
    };

    popoverEl.addEventListener('toggle', handleToggle);
    return () => popoverEl.removeEventListener('toggle', handleToggle);
  }, []);

  const searchValue = externalSearch ? externalSearch.value : localSearch;
  const setSearchValue = externalSearch ? externalSearch.onChange : setLocalSearch;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: externalSearch ? undefined : localSearch,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      if (next.length > 0) {
        const col = next[0];
        setSortStatusText(
          `Ordenado por ${col.id} en orden ${col.desc ? 'descendente' : 'ascendente'}`,
        );
      } else {
        setSortStatusText('Ordenamiento restablecido');
      }
    },
    onGlobalFilterChange: externalSearch ? undefined : setLocalSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: externalSearch ? undefined : getFilteredRowModel(),
    getPaginationRowModel: serverPagination ? undefined : getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const exportRows = useMemo(
    () => table.getFilteredRowModel().rows.map((r) => r.original),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, sorting, localSearch],
  );

  const handleExport = async (format: ReportExportFormat) => {
    if (exportRows.length === 0 || exportingFormat) return;
    exportPopoverRef.current?.hidePopover?.();
    setExportingFormat(format);
    try {
      await exportReport({
        format,
        title,
        subtitle,
        filename: csvFilename,
        columns: csvColumns,
        rows: exportRows,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const rowsToRender = serverPagination ? table.getRowModel().rows : table.getRowModel().rows;
  const totalFilteredCount = serverPagination
    ? serverPagination.totalRegistros
    : table.getFilteredRowModel().rows.length;

  const currentPage = serverPagination
    ? serverPagination.page
    : table.getState().pagination.pageIndex + 1;
  const currentPageSize = serverPagination
    ? serverPagination.pageSize
    : table.getState().pagination.pageSize;
  const totalPages = serverPagination
    ? serverPagination.totalPaginas
    : Math.max(1, table.getPageCount());

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Screen reader status for sort changes (modern-web-guidance: sortable-table) */}
      <div role="status" className="sr-only">
        {sortStatusText}
      </div>

      {/* Header + Toolbar */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 font-display">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {headerRight}

          {/* Quick search */}
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-8 pr-7 py-1.5 w-48 sm:w-56 rounded-xl border border-slate-200 bg-slate-50/70 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => setSearchValue('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Export multi-format selector (modern-web-guidance: viewport-aware-dropdowns) */}
          <button
            ref={exportTriggerRef}
            type="button"
            disabled={exportRows.length === 0 || exportingFormat !== null}
            popoverTarget={exportPopoverId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white border border-teal-700/20 shadow-sm text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exportingFormat ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>
              {exportingFormat ? `Exportando ${exportingFormat.toUpperCase()}...` : 'Exportar'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 opacity-85" aria-hidden="true" />
          </button>

          <div
            ref={exportPopoverRef}
            id={exportPopoverId}
            popover="auto"
            className="mwg-export-popover"
          >
            <div className="px-3 py-2 bg-[#0B1220] text-white border-b-2 border-teal-500">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
                Formato de descarga
              </p>
              <p className="text-[10px] text-slate-300 mt-0.5 tabular-nums">
                {exportRows.length} registro{exportRows.length === 1 ? '' : 's'} en vista actual
              </p>
            </div>
            <div className="p-1.5 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 border border-rose-200/80 flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800">Documento PDF</span>
                  <span className="block text-[10px] text-slate-500">Diseño institucional (.pdf)</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExport('docx')}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200/80 flex items-center justify-center shrink-0">
                  <FileType2 className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800">Documento Word</span>
                  <span className="block text-[10px] text-slate-500">Editable con estilos (.docx)</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExport('xlsx')}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800">Libro Excel</span>
                  <span className="block text-[10px] text-slate-500">Con colores y filtros (.xlsx)</span>
                </span>
              </button>

              <hr className="my-1 border-slate-100" />

              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0">
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800">Datos CSV</span>
                  <span className="block text-[10px] text-slate-500">Texto plano UTF-8 (.csv)</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table container (modern-web-guidance: responsive-table + sortable-table) */}
      {rowsToRender.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
          <p className="text-xs text-slate-500 mt-1">{emptyDescription}</p>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={captionId}
          className="table-wrapper table-wrapper--paged border-0 rounded-none"
        >
          <table className="mwg-table">
            <caption id={captionId} className="sr-only">
              {caption}
            </caption>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    const ariaSort =
                      sortDir === 'asc'
                        ? 'ascending'
                        : sortDir === 'desc'
                          ? 'descending'
                          : undefined;

                    return (
                      <th key={header.id} scope="col" aria-sort={ariaSort}>
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="w-full h-full flex items-center justify-between gap-1.5 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
                          >
                            <span>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            <span className="shrink-0 text-slate-400" aria-hidden="true">
                              {sortDir === 'asc' ? (
                                <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                              ) : sortDir === 'desc' ? (
                                <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-60" />
                              )}
                            </span>
                          </button>
                        ) : (
                          <span>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rowsToRender.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell, idx) => {
                    const headerLabel =
                      typeof cell.column.columnDef.header === 'string'
                        ? cell.column.columnDef.header
                        : cell.column.id;
                    if (idx === 0) {
                      return (
                        <th key={cell.id} scope="row">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </th>
                      );
                    }
                    return (
                      <td key={cell.id} data-label={headerLabel}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Pagination */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span className="tabular-nums">
            Total: <strong className="text-slate-900">{totalFilteredCount}</strong> registro
            {totalFilteredCount === 1 ? '' : 's'}
          </span>
          <label className="inline-flex items-center gap-1.5">
            <span className="text-slate-500">Filas:</span>
            <select
              value={currentPageSize}
              onChange={(e) => {
                const nextSize = Number(e.target.value);
                if (serverPagination) {
                  serverPagination.onPageSizeChange(nextSize);
                } else {
                  table.setPageSize(nextSize);
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <span className="tabular-nums text-slate-500">
            Página <strong className="text-slate-800">{currentPage}</strong> de{' '}
            <strong className="text-slate-800">{totalPages}</strong>
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() =>
                serverPagination
                  ? serverPagination.onPageChange(Math.max(1, currentPage - 1))
                  : table.previousPage()
              }
              aria-label="Página anterior"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() =>
                serverPagination
                  ? serverPagination.onPageChange(Math.min(totalPages, currentPage + 1))
                  : table.nextPage()
              }
              aria-label="Página siguiente"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
