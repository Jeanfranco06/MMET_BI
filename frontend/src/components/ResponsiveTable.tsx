'use client';

import { useId } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  isRowHeader?: boolean;
}

interface ResponsiveTableProps<T> {
  caption: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  emptyText?: string;
}

export function ResponsiveTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyText = 'Sin registros para los filtros seleccionados.',
}: ResponsiveTableProps<T>) {
  const captionId = useId();

  return (
    <div tabIndex={0} role="region" aria-labelledby={captionId} className="table-wrapper">
      <table className="mwg-table">
        <caption id={captionId}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-slate-500 py-8">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={rowKey(row, idx)}>
                {columns.map((col, cIdx) =>
                  col.isRowHeader || cIdx === 0 ? (
                    <th key={col.key} scope="row">
                      {col.render(row)}
                    </th>
                  ) : (
                    <td key={col.key} data-label={col.header}>
                      {col.render(row)}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
