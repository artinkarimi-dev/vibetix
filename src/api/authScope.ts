let revision = 0;
export const accountRevision = () => revision;
export const invalidateAccount = () => ++revision;
export const accountIsCurrent = (value: number) => value === revision;
const channelName = "vibetix-account-change";

const sourceId = globalThis.crypto.randomUUID();
export function notifyAccountChange() {
  if (typeof window === "undefined") return;
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "changed", sourceId });
    channel.close();
  } else {
    try {
      localStorage.setItem(channelName, crypto.randomUUID());
    } catch {

    }
  }
}
export function subscribeAccountChanges(changed: () => void) {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = (event) => {
      if (event.data?.type === "changed" && event.data.sourceId !== sourceId)
        changed();
    };
    return () => channel.close();
  }
  const handler = (event: StorageEvent) => {
    if (event.key === channelName) changed();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
