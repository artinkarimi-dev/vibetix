import { useSyncExternalStore } from "react";
import { getStorageUnavailable, subscribeStorage } from "../../store/storage";

export function StorageNotice() {
  const unavailable = useSyncExternalStore(
    subscribeStorage,
    getStorageUnavailable,
    () => false,
  );
  if (!unavailable) return null;
  return (
    <p className="storage-notice" role="status">
      Browser storage is unavailable or full. You can continue this demo, but
      your booking, favorites and mock tickets may be lost when you reload.
      Print any completed tickets before leaving.
    </p>
  );
}
