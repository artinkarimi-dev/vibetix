import { create } from "zustand";
import { persist } from "zustand/middleware";
import { browserStorage } from "./storage";
import { parseStoredOrder } from "../utils/orderValidation";
import type { Order } from "../types";
interface OrderState {
  orders: Order[];
  saveOrder: (order: Order) => void;
  deleteOrder: (id: string) => void;
}
export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      orders: [],
      saveOrder: (order) =>
        set((state) => ({
          orders: state.orders.some((o) => o.id === order.id)
            ? state.orders.map((o) => (o.id === order.id ? order : o))
            : [order, ...state.orders],
        })),
      deleteOrder: (id) =>
        set((state) => ({ orders: state.orders.filter((o) => o.id !== id) })),
    }),
    {
      name: "vibetix-orders",
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({ orders: state.orders }),
      merge: (persisted, current) => {
        const data = (
          persisted && typeof persisted === "object" ? persisted : {}
        ) as { orders?: unknown };
        const orders = Array.isArray(data.orders)
          ? data.orders
              .slice(0, 100)
              .map(parseStoredOrder)
              .filter((order): order is Order => order !== null)
          : [];
        return { ...current, orders };
      },
    },
  ),
);
