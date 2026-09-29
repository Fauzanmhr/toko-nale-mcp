import { StoreApiError } from "../client.js";

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

export function jsonResult(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function describeError(error: unknown): string {
  if (error instanceof StoreApiError) {
    const code = error.code ? ` [${error.code}]` : "";
    return `WooCommerce Store API request failed${code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function runTool(action: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await action());
  } catch (error) {
    return errorResult(describeError(error));
  }
}

export interface PageMeta {
  total: number | null;
  totalPages: number | null;
}

export function paginationInfo(
  meta: PageMeta,
  page: number,
  perPage: number,
  returned: number,
): Record<string, unknown> {
  const hasMore = meta.totalPages === null ? null : page < meta.totalPages;
  return {
    page,
    per_page: perPage,
    returned,
    total_results: meta.total,
    total_pages: meta.totalPages,
    has_more: hasMore,
    next_page: hasMore ? page + 1 : null,
  };
}

export function appliedFilters(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined && value !== null),
  );
}

export const PRODUCT_ORDER_BY = [
  "date",
  "modified",
  "id",
  "include",
  "title",
  "slug",
  "price",
  "popularity",
  "rating",
  "menu_order",
  "comment_count",
] as const;

export const ORDER = ["asc", "desc"] as const;

export const STOCK_STATUS = ["instock", "outofstock", "onbackorder"] as const;

export const TERM_ORDER_BY = ["name", "slug", "count"] as const;

export const ATTRIBUTE_TERM_ORDER_BY = ["name", "slug", "count", "id", "menu_order"] as const;

export const REVIEW_ORDER_BY = ["date", "date_gmt", "id", "rating", "product"] as const;

export const EMPTY_RESULTS_NOTE =
  "No results matched. Broaden or remove filters, and use list_categories / list_tags / list_attributes to confirm the values exist on this store.";
