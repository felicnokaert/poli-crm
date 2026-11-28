// Cuentas del paginador (src/Pager.jsx), aparte para poder probarlas sin JSX.
export const PAGE_SIZE = 25;

export function pageWindow(page, pages, width = 2) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const out = [1];
  const from = Math.max(2, page - width);
  const to = Math.min(pages - 1, page + width);
  if (from > 2) out.push("…");
  for (let number = from; number <= to; number += 1) out.push(number);
  if (to < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export function paginate(list = [], page = 1, size = PAGE_SIZE) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const safe = Math.min(Math.max(1, page), pages);
  const start = (safe - 1) * size;
  return { rows: list.slice(start, start + size), page: safe, pages, total, from: total ? start + 1 : 0, to: Math.min(total, start + size) };
}

