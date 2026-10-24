export const FIXTURE_MODE =
  import.meta.env?.VITE_USE_FIXTURES === "true" ||
  import.meta.env?.MODE === "test" ||
  (typeof process !== "undefined" &&
    process.env.VIBETIX_FIXTURE_TESTS === "true");
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  let body: unknown;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 12000);
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      signal: controller.signal,
      credentials: "same-origin",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    body = await response.json();
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? "The request timed out or was cancelled. Retry when ready."
        : "Cannot reach VIBETIX. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
  const errorBody = body as {
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok)
    throw new ApiError(
      errorBody?.error?.message ??
        "The server could not complete this request.",
      response.status,
      errorBody?.error?.code ?? "REQUEST_FAILED",
    );
  return body as T;
}
export const post = <T>(
  path: string,
  value: unknown,
  headers: Record<string, string> = {},
) => request<T>(path, { method: "POST", body: JSON.stringify(value), headers });
