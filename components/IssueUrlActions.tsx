"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";

interface IssueUrlActionsProps {
  url: string;
}

export function IssueUrlActions({ url }: IssueUrlActionsProps) {
  async function copyUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // no-op: clipboard may be blocked
    }
  }

  return (
    <TooltipProvider>
      <span className="inline-flex flex-wrap gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" onClick={copyUrl}>
              Copy URL
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy full URL</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="sm" variant="secondary">
              <a href={url} target="_blank" rel="noreferrer noopener">
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
