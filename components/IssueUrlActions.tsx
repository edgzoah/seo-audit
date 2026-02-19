"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

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
      <span className="issue-actions">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="issue-action-btn" onClick={copyUrl}>
              Copy URL
            </button>
          </TooltipTrigger>
          <TooltipContent>Copy full URL</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <a className="issue-action-btn" href={url} target="_blank" rel="noreferrer noopener">
              Open page
            </a>
          </TooltipTrigger>
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  );
}
