import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  emptyLabel?: string;
}

export function DataTable<T>({ columns, rows, getRowKey, emptyLabel = "No data." }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }

  return (
    <div className="data-table-wrap">
      <table className="table data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-cards">
        {rows.map((row) => (
          <article key={getRowKey(row)} className="data-card">
            {columns.map((column) => (
              <div key={column.key} className="data-card-row">
                <span>{column.header}</span>
                <div>{column.render(row)}</div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}
