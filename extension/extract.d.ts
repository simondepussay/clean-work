/** Types de extension/extract.js, pour l'app web (bookmarklet et tests). */
export type ExtractedJob = {
  company?: string;
  position?: string;
  url?: string;
  location?: string;
  deadline?: string;
  notes?: string;
  source?: string;
};
export function extractJob(doc?: Document, href?: string): ExtractedJob;
export function jobLink(job: ExtractedJob, base?: string): string;
