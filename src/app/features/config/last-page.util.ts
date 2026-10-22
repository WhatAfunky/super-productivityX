/**
 * "Where I left off" start page: which routes may be restored on start-up.
 * Deliberately a short allowlist of main views; anything else (settings,
 * search, dialogs' routes) starts on Today instead.
 */
export type RestorablePage =
  | { kind: 'project'; id: string; path: string }
  | { kind: 'tag'; id: string; path: string }
  | { kind: 'planner' | 'schedule' | 'boards'; path: string };

const PROJECT_RE = /^\/project\/([^/]+)\/(tasks|layers)$/;
const TAG_RE = /^\/tag\/([^/]+)\/tasks$/;
const PAGE_RE = /^\/(planner|schedule|boards)$/;

/** Parses a router URL (query and fragment ignored) into a restorable page. */
export const parseRestorablePage = (
  url: string | null | undefined,
): RestorablePage | null => {
  if (!url) return null;
  const path = url.split(/[?#]/)[0];
  const project = PROJECT_RE.exec(path);
  if (project) return { kind: 'project', id: decodeURIComponent(project[1]), path };
  const tag = TAG_RE.exec(path);
  if (tag) return { kind: 'tag', id: decodeURIComponent(tag[1]), path };
  const page = PAGE_RE.exec(path);
  if (page) return { kind: page[1] as 'planner' | 'schedule' | 'boards', path };
  return null;
};
