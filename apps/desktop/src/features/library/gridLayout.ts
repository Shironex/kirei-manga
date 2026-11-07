/**
 * Geometry for the virtualised cover grid. Every row has the same height (the
 * cover is 2:3 and the caption block is fixed), so the rows on screen follow
 * from the scroll offset alone, with no measuring of tiles.
 */

export interface GridSpec {
  /** Smallest tile width before a column is dropped, px. */
  minTile: number;
  gapX: number;
  gapY: number;
  /** Caption under the cover: gap, two title lines, the sub line and the bar, px. */
  caption: number;
}

export interface GridMetrics {
  columns: number;
  tileWidth: number;
  /** Cover plus caption, without the row gap. */
  rowHeight: number;
  /** Row height plus the gap below it. */
  stride: number;
}

export function gridMetrics(width: number, spec: GridSpec): GridMetrics {
  const columns = Math.max(1, Math.floor((width + spec.gapX) / (spec.minTile + spec.gapX)));
  const tileWidth = Math.max(0, (width - spec.gapX * (columns - 1)) / columns);
  const rowHeight = Math.round(tileWidth * 1.5 + spec.caption);
  return { columns, tileWidth, rowHeight, stride: rowHeight + spec.gapY };
}

/**
 * Rows to render, `[start, end)`, for a viewport scrolled to `scrollTop` with
 * the grid starting `gridTop` px down the scroll content. `overscan` extra rows
 * on each side keep fast scrolls and Tab from landing on blank space.
 */
export function visibleRows(input: {
  scrollTop: number;
  viewport: number;
  gridTop: number;
  stride: number;
  rows: number;
  overscan: number;
}): [number, number] {
  const { scrollTop, viewport, gridTop, stride, rows, overscan } = input;
  if (rows === 0 || stride <= 0) return [0, 0];
  const top = scrollTop - gridTop;
  const first = Math.floor(top / stride) - overscan;
  const last = Math.ceil((top + viewport) / stride) + overscan;
  const start = Math.min(rows, Math.max(0, first));
  return [start, Math.min(rows, Math.max(start, last))];
}
