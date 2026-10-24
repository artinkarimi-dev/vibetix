const renderCounts = new Map<string, number>();
export function profileRender(id: string) {
  if (!import.meta.env.DEV || import.meta.env.VITE_PROFILE !== "true")
    return undefined;
  const count = (renderCounts.get(id) ?? 0) + 1;
  renderCounts.set(id, count);
  return count;
}
