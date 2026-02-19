"use client";

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
    <span className="issue-actions">
      <button type="button" className="issue-action-btn" onClick={copyUrl}>
        Copy URL
      </button>
      <a className="issue-action-btn" href={url} target="_blank" rel="noreferrer noopener">
        Open page
      </a>
    </span>
  );
}
