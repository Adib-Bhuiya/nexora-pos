export type ClassValue = string | false | null | undefined | 0;
export const cn = (...values: ClassValue[]): string => values.filter(Boolean).join(' ');
