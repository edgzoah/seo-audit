import type { HTMLAttributes, TableHTMLAttributes } from "react";

type TableProps = TableHTMLAttributes<HTMLTableElement>;
type SectionProps = HTMLAttributes<HTMLTableSectionElement>;
type RowProps = HTMLAttributes<HTMLTableRowElement>;
type CellProps = HTMLAttributes<HTMLTableCellElement>;
type HeadCellProps = HTMLAttributes<HTMLTableCellElement>;

export function Table({ className = "", ...props }: TableProps) {
  return <table className={`table ${className}`.trim()} {...props} />;
}

export function TableHeader(props: SectionProps) {
  return <thead {...props} />;
}

export function TableBody(props: SectionProps) {
  return <tbody {...props} />;
}

export function TableRow(props: RowProps) {
  return <tr {...props} />;
}

export function TableHead(props: HeadCellProps) {
  return <th {...props} />;
}

export function TableCell(props: CellProps) {
  return <td {...props} />;
}
