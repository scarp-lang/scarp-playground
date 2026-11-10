import { sourceLocationToEditorRange, type EditorRange } from '../diagnostics';
import type { ReferenceSite } from './references';

export type ReferenceDecoration = {
  range: EditorRange;
  active: boolean;
  kind: string;
};

/** Only decorate the current virtual source and only validated locations. */
export function referenceDecorationsForFile(
  sites: ReadonlyArray<ReferenceSite> | null,
  path: string, source: string, activeIndex: number,
): ReferenceDecoration[] {
  if (!sites) return [];
  const decorations: ReferenceDecoration[] = [];
  for (let index = 0; index < sites.length; index++) {
    const site = sites[index];
    if (site.path !== path) continue;
    const range = sourceLocationToEditorRange(source, site);
    if (range && (range.startLineNumber < range.endLineNumber ||
      range.startColumn < range.endColumn)) {
      decorations.push({ range, active: index === activeIndex, kind: site.kind });
    }
  }
  return decorations;
}

/** Prefer the exact symbol under the cursor over the declaration elsewhere. */
export function initialReferenceIndex(
  sites: ReadonlyArray<ReferenceSite>, path: string,
  source: string, line: number, column: number,
): number {
  if (sites.length === 0) return -1;
  const match = sites.findIndex(site => {
    if (site.path !== path) return false;
    const range = sourceLocationToEditorRange(source, site);
    if (!range) return false;
    return (line > range.startLineNumber ||
      (line === range.startLineNumber && column >= range.startColumn)) &&
      (line < range.endLineNumber ||
      (line === range.endLineNumber && column < range.endColumn));
  });
  return match < 0 ? 0 : match;
}

/** Wrap at both ends; there is no selected position in an empty list. */
export function stepReferenceIndex(current: number, size: number, delta: -1 | 1): number {
  if (!Number.isSafeInteger(size) || size <= 0) return -1;
  const currentIndex = Number.isSafeInteger(current) && current >= 0 && current < size
    ? current : 0;
  return (currentIndex + delta + size) % size;
}
