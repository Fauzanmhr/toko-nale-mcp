export const DEFAULT_STORE_URL = "https://toko.nale.co.id";

const STORE_API_NAMESPACE = "/wp-json/wc/store/v1";

export type QueryValue = string | number | boolean | undefined | null;

export interface StoreApiResult<T> {
  data: T;
  total: number | null;
  totalPages: number | null;
}

export class StoreApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status = 0, code: string | null = null) {
    super(message);
    this.name = "StoreApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorEnvelope {
  code?: unknown;
  message?: unknown;
  data?: { params?: Record<string, unknown> } | unknown;
}

function parseIntHeader(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function serializeParams(params: Record<string, unknown>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return search;
}

export function normalizeStoreUrl(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/+$/, "");
}

export class StoreApiClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(options: { baseUrl?: string; timeoutMs?: number } = {}) {
    this.baseUrl = normalizeStoreUrl(options.baseUrl ?? DEFAULT_STORE_URL);
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<StoreApiResult<T>> {
    const search = serializeParams(params);
    const query = search.size > 0 ? `?${search}` : "";
    const url = `${this.baseUrl}${STORE_API_NAMESPACE}${path}${query}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError"
        ? `no response within ${this.timeoutMs}ms`
        : error instanceof Error ? error.message : String(error);
      throw new StoreApiError(`Could not reach ${this.baseUrl} (${reason}).`, 0, "network_error");
    }

    const body = await response.text();

    if (!response.ok) {
      throw this.toError(response.status, body);
    }

    let data: T;
    try {
      data = JSON.parse(body) as T;
    } catch {
      throw new StoreApiError(
        `The store returned a non-JSON response (HTTP ${response.status}) for ${path}.`,
        response.status,
        "invalid_json",
      );
    }

    return {
      data,
      total: parseIntHeader(response.headers.get("x-wp-total")),
      totalPages: parseIntHeader(response.headers.get("x-wp-totalpages")),
    };
  }

  private toError(status: number, body: string): StoreApiError {
    let envelope: ErrorEnvelope | null = null;
    try {
      envelope = JSON.parse(body) as ErrorEnvelope;
    } catch {
      envelope = null;
    }

    if (envelope === null) {
      if (status === 404) {
        return new StoreApiError(
          "Not found (HTTP 404). The product, category or endpoint does not exist on this store.",
          status,
          "not_found",
        );
      }
      return new StoreApiError(`The store request failed with HTTP ${status}.`, status, null);
    }

    const base = typeof envelope.message === "string"
      ? envelope.message
      : `The store request failed with HTTP ${status}.`;

    const params = envelope.data && typeof envelope.data === "object" && "params" in envelope.data
      ? (envelope.data as { params?: Record<string, unknown> }).params
      : undefined;

    const details = params
      ? Object.entries(params)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join("; ")
      : "";

    return new StoreApiError(
      details ? `${base} (${details})` : base,
      status,
      typeof envelope.code === "string" ? envelope.code : null,
    );
  }
}
