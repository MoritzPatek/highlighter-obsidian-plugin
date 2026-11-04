export const strip: (t: string) => string;
export function forbiddenRegions(stripped: string): { start: number; end: number; why: string }[];
export function paintedRanges(doc: string, color: string): { start: number; end: number; text: string }[];
export function violations(before: string, after: string, color: string | null): string[];
export const TOKENS: string[];
