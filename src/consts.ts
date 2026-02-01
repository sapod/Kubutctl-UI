// @ts-ignore
const rawPort = import.meta.env.VITE_BE_PORT; // vite env var
export const BACKEND_PORT = rawPort && rawPort !== '' ? rawPort : 5174;
export const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}`;
export const BACKEND_WS_BASE_URL = `ws://localhost:${BACKEND_PORT}`;

// Inactivity threshold for connection verification: 1 hour
export const INACTIVITY_THRESHOLD_MS = 60 * 60 * 1000;

// Inactivity timeout for stopping background polls: 5 minutes
export const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

// Maximum items per resource type to cache (keeps cache size under control)
export const MAX_CACHED_ITEMS_PER_TYPE = 50;

