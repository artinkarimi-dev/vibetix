import {
  accountRevision,
  accountIsCurrent,
  invalidateAccount,
  notifyAccountChange,
} from "./authScope";
import { create } from "zustand";
import type { AuthUser } from "../../packages/shared/src/index";
import { request, post } from "./client";
export const useAuth = create<{ user: AuthUser | null; error: string }>(() => ({
  user: null,
  error: "",
}));
export async function restoreSession() {
  const revision = accountRevision();
  const { user } = await request<{ user: AuthUser | null }>("/auth/me");
  if (!accountIsCurrent(revision)) return;
  useAuth.setState({ user, error: "" });
  if (user) {
    const { restoreAccount } = await import("./session");
    if (accountIsCurrent(revision)) await restoreAccount(revision);
  }
}
export async function signIn(email: string, password: string) {
  invalidateAccount();
  const { clearAccount } = await import("./session");
  clearAccount();
  useAuth.setState({ user: null });
  await post("/auth/login", { email, password });
  notifyAccountChange();
  await restoreSession();
}
export async function signOut() {
  invalidateAccount();
  await post("/auth/logout", {});
  notifyAccountChange();
  useAuth.setState({ user: null });
  const { clearAccount } = await import("./session");
  clearAccount();
}
