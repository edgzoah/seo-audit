export type CategoryDeltaDatum = {
  category: string;
  baseline: number;
  current: number;
  delta: number;
};

export type IssueChangeDatum = {
  key: "resolved" | "new" | "regressed";
  label: string;
  value: number;
};

export type IssueSeverityMixDatum = {
  severity: "error" | "warning" | "notice";
  count: number;
};
