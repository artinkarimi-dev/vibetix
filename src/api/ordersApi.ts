import { accountRevision, accountIsCurrent } from "./authScope";
import { useAuth } from "./authApi";
import { useEffect, useState } from "react";
import { useOrderStore } from "../store/orderStore";
import type { Order } from "../types";
import { FIXTURE_MODE, request } from "./client";
export function useRemoteOrder(id: string | null | undefined) {
  const userId = useAuth((s) => s.user?.id);
  const [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(!FIXTURE_MODE && Boolean(id));
  useEffect(() => {
    if (FIXTURE_MODE || !id) return;
    let active = true,
      sequence = 0;
    let controller: AbortController;
    const revision = accountRevision();
    const refresh = async () => {
      const current = ++sequence;
      controller?.abort();
      controller = new AbortController();
      setLoading(true);
      setError("");
      try {
        const { order } = await request<{ order: Order }>(
          `/orders/${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        if (active && current === sequence && accountIsCurrent(revision))
          useOrderStore.getState().saveOrder(order);
      } catch (e) {
        if (active && current === sequence && accountIsCurrent(revision)) {
          useOrderStore.getState().deleteOrder(id);
          setError((e as Error).message);
        }
      } finally {
        if (active && current === sequence) setLoading(false);
      }
    };
    const onFocus = () => {
      void refresh();
    };
    void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [id, attempt, userId]);
  return { loading, error, retry: () => setAttempt((x) => x + 1) };
}
export function useRemoteOrders() {
  const userId = useAuth((s) => s.user?.id);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(!FIXTURE_MODE);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (FIXTURE_MODE) return;
    if (!userId) {
      setLoading(false);
      setError("");
      setNextCursor(null);
      setPage(null);
      return;
    }
    let active = true;
    const revision = accountRevision(),
      controller = new AbortController();
    setLoading(true);
    setError("");
    request<{ orders: Order[]; nextCursor: string | null }>(
      `/orders?limit=20${page ? `&cursor=${encodeURIComponent(page)}` : ""}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!active || !accountIsCurrent(revision)) return;
        useOrderStore.setState((state) => ({
          orders: page
            ? [
                ...state.orders.filter(
                  (o) => !data.orders.some((fresh) => fresh.id === o.id),
                ),
                ...data.orders,
              ]
            : data.orders,
        }));
        setNextCursor(data.nextCursor);
      })
      .catch((e: Error) => {
        if (active && accountIsCurrent(revision)) {
          useOrderStore.setState({ orders: [] });
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, page, attempt]);
  useEffect(() => {
    if (FIXTURE_MODE) return;
    const refresh = () => {
      setPage(null);
      setAttempt((x) => x + 1);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return {
    error,
    loading,
    nextCursor,
    more: () => setPage(nextCursor),
    retry: () => {
      setPage(null);
      setAttempt((x) => x + 1);
    },
  };
}
