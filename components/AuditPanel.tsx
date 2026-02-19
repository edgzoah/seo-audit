import type { ReactNode } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";

interface PanelChildren {
  children: ReactNode;
}

interface PanelHeaderProps {
  title: string;
  meta?: ReactNode;
}

function Root({ children }: PanelChildren) {
  return <Card className="audit-panel-root">{children}</Card>;
}

function Header({ title, meta }: PanelHeaderProps) {
  return (
    <CardHeader className="audit-panel-header">
      <CardTitle>{title}</CardTitle>
      {meta ? <span>{meta}</span> : null}
    </CardHeader>
  );
}

function Body({ children }: PanelChildren) {
  return <CardContent className="audit-panel-body">{children}</CardContent>;
}

function Footer({ children }: PanelChildren) {
  return <CardFooter className="audit-panel-footer">{children}</CardFooter>;
}

export const AuditPanel = {
  Root,
  Header,
  Body,
  Footer,
};
