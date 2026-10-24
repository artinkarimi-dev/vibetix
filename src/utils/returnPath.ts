export function safeReturnPath(value: string | null, fallback = "/seats") {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    [...value].some(
      (char) =>
        char === "\\" || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    )
  )
    return fallback;
  const base = "https://vibetix.invalid";
  try {
    const url = new URL(value, base);
    return url.origin === base
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
