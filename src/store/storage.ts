import { FIXTURE_MODE } from "../api/client";
import { createJSONStorage } from "zustand/middleware";
let storageUnavailable = false;
const listeners = new Set<() => void>();
const markUnavailable = () => {
  if (storageUnavailable) return;
  storageUnavailable = true;
  listeners.forEach((listener) => listener());
};
export const getStorageUnavailable = () => storageUnavailable;
export const subscribeStorage = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const browserStorage = createJSONStorage(() => ({
  getItem: (key: string) => {
    if (!FIXTURE_MODE && key === "vibetix-orders") return null;
    try {
      return localStorage.getItem(key);
    } catch {
      markUnavailable();
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (!FIXTURE_MODE && key === "vibetix-orders") return;
    try {
      localStorage.setItem(key, value);
    } catch {
      markUnavailable();
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      markUnavailable();
    }
  },
}));
