"use client";

import { useMemo, useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface IssueUrlActionsProps {
  urls: string[];
}

function compactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${tail}`;
  } catch {
    return url;
  }
}

export function IssueUrlActions({ urls }: IssueUrlActionsProps) {
  const options = useMemo(() => Array.from(new Set(urls)), [urls]);
  const [selectedUrl, setSelectedUrl] = useState<string>(options[0] ?? "");
  const effectiveSelectedUrl = options.includes(selectedUrl) ? selectedUrl : (options[0] ?? "");

  async function copyUrl(): Promise<void> {
    if (!effectiveSelectedUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(effectiveSelectedUrl);
    } catch {
      // no-op: clipboard may be blocked
    }
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <span className="inline-flex w-full flex-wrap items-center gap-1">
        <Select value={effectiveSelectedUrl} onValueChange={setSelectedUrl}>
          <SelectTrigger className="h-8 min-w-[180px] max-w-[240px] text-xs">
            <SelectValue placeholder="Choose page" />
          </SelectTrigger>
          <SelectContent>
            {options.map((url, index) => (
              <SelectItem key={`${url}-${index}`} value={url}>
                {compactUrl(url)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" onClick={copyUrl} disabled={!effectiveSelectedUrl}>
              Copy URL
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy full URL</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="sm" variant="secondary" disabled={!effectiveSelectedUrl}>
              <a href={effectiveSelectedUrl || "#"} target="_blank" rel="noreferrer noopener">
                Open page
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  );
}
