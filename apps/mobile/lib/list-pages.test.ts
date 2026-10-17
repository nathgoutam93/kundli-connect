import { cursorArgs, flattenList, listPage, mapListPages, type ListPages } from './list-pages';

test('lookahead uses the final raw row as cursor even when a card cannot be mapped', () => {
  const rows = Array.from({ length: 31 }, (_, n) => ({ id: String(n), at: 'same-time' }));
  const page = listPage(rows, (row) => row.id === '29' ? null : row, (row) => ({ at: row.at, id: row.id }));
  expect(page.items).toHaveLength(29);
  expect(page.nextCursor).toEqual({ at: 'same-time', id: '29' });
  expect(cursorArgs(page.nextCursor)).toEqual({ p_limit: 31, p_before: 'same-time', p_before_id: '29' });
  expect(listPage(rows.slice(0, 30), (row) => row, (row) => row).nextCursor).toBeUndefined();
});

test('overlapping pages flatten once while updates preserve page cursors and unloaded state', () => {
  const cursor = { at: 't', id: 'b' };
  const data: ListPages<{ id: string }> = { pages: [{ items: [{ id: 'a' }, { id: 'b' }], nextCursor: cursor }, { items: [{ id: 'b' }, { id: 'c' }] }], pageParams: [undefined, cursor] };
  expect(flattenList(data).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  const updated = mapListPages(data, (items) => items.filter((row) => row.id !== 'b'))!;
  expect(flattenList(updated).map((row) => row.id)).toEqual(['a', 'c']);
  expect(updated.pages[0].nextCursor).toBe(cursor);
  expect(updated.pageParams).toBe(data.pageParams);
  expect(mapListPages(undefined, (items) => items)).toBeUndefined();
});
