const ua = typeof navigator !== "undefined" ? navigator.userAgent?.toLowerCase() ?? "" : "";
const platform = typeof navigator !== "undefined" ? navigator.platform?.toLowerCase() ?? "" : "";

export const isMacOS = platform.includes("mac") || ua.includes("mac os x");
export const isWindows = platform.includes("win") || ua.includes("windows");
