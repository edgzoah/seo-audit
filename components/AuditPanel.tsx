import type { ReactNode } from "react";

interface PanelChildren {
  children: ReactNode;
}

interface PanelHeaderProps {
  title: string;
  meta?: ReactNode;
}

function Root({ children }: PanelChildren) {
  return <section className="card panel audit-panel-root">{children}</section>;
}

function Header({ title, meta }: PanelHeaderProps) {
  return (
    <div className="panel-head audit-panel-header">
      <h2>{title}</h2>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}

function Body({ children }: PanelChildren) {
  return <div className="audit-panel-body">{children}</div>;
}

function Footer({ children }: PanelChildren) {
  return <div className="audit-panel-footer">{children}</div>;
}

export const AuditPanel = {
  Root,
  Header,
  Body,
  Footer,
};
