import { accountRevision, accountIsCurrent } from "../api/authScope";
import { FIXTURE_MODE, post, request } from "../api/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { browserStorage } from "./storage";
import { events } from "../data/events";
import type { TierId } from "../types";
interface EventState {
  networkError: string | null;
  selectedTiers: Record<string, TierId>;
  favorites: string[];
  selectTier: (eventId: string, tierId: TierId) => void;
  toggleFavorite: (eventId: string) => void;
}
export const useEventStore = create<EventState>()(
  persist(
    (set, get) => ({
      selectedTiers: {},
      favorites: [],
      selectTier: (eventId, tierId) =>
        set((state) => ({
          selectedTiers: { ...state.selectedTiers, [eventId]: tierId },
        })),
      toggleFavorite: (eventId) => {
        if (!FIXTURE_MODE) {
          const revision = accountRevision();
          const existed = get().favorites.includes(eventId);
          void (
            existed
              ? request(`/favorites/${encodeURIComponent(eventId)}`, {
                  method: "DELETE",
                })
              : post("/favorites", { eventId })
          )
            .then(
              () =>
                accountIsCurrent(revision) &&
                set((state) => ({
                  favorites: existed
                    ? state.favorites.filter((id) => id !== eventId)
                    : [...new Set([...state.favorites, eventId])],
                  networkError: null,
                })),
            )
            .catch((e) => {
              if (accountIsCurrent(revision)) set({ networkError: e.message });
            });
          return;
        }
        set((state) => ({
          favorites: state.favorites.includes(eventId)
            ? state.favorites.filter((id) => id !== eventId)
            : [...state.favorites, eventId],
        }));
      },
      networkError: null,
    }),
    {
      name: "vibetix-event-preferences",
      version: 1,
      storage: browserStorage,
      merge: (persisted, current) => {
        const data =
          persisted && typeof persisted === "object"
            ? (persisted as { favorites?: unknown; selectedTiers?: unknown })
            : {};
        const favorites = Array.isArray(data.favorites)
          ? data.favorites.filter(
              (id): id is string =>
                typeof id === "string" && events.some((e) => e.id === id),
            )
          : [];
        const selectedTiers: Record<string, TierId> = {};
        if (data.selectedTiers && typeof data.selectedTiers === "object")
          for (const [id, tier] of Object.entries(data.selectedTiers)) {
            if (
              events.some((e) => e.id === id) &&
              ["standard", "premium", "vip", "front-row"].includes(String(tier))
            )
              selectedTiers[id] = tier as TierId;
          }
        return {
          ...current,
          favorites: [...new Set(favorites)],
          selectedTiers,
        };
      },
    },
  ),
);
