import type { InfiniteData } from '@tanstack/react-query';

export type ListCursor = { at: string; id: string };
export type ListPage<T> = { items: T[]; nextCursor?: ListCursor };
export type ListPages<T> = InfiniteData<ListPage<T>, ListCursor | undefined>;
export const LIST_PAGE_SIZE = 30;

export function cursorArgs(before?: ListCursor) {
  return { p_limit: LIST_PAGE_SIZE + 1, p_before: before?.at ?? null, p_before_id: before?.id ?? null };
}

export function listPage<T, R>(rows: R[], map: (row: R) => T | null, cursor: (row: R) => ListCursor): ListPage<T> {
  const page = rows.slice(0, LIST_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map(map).filter((item): item is T => item !== null),
    nextCursor: rows.length > LIST_PAGE_SIZE && last ? cursor(last) : undefined,
  };
}

export function flattenList<T extends { id: string }>(data: ListPages<T>) {
  return flattenListBy(data, (item) => item.id);
}

/** Activity can move a chat across page boundaries between requests. Render each ID once. */
export function flattenListBy<T>(data: ListPages<T>, key: (item: T) => string) {
  const seen = new Set<string>();
  return data.pages.flatMap((page) => page.items).filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function mapListPages<T>(data: ListPages<T> | undefined, update: (items: T[]) => T[]): ListPages<T> | undefined {
  return data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: update(page.items) })) } : undefined;
}
