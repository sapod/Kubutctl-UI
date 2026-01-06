// @ts-ignore
const rawPort = import.meta.env.VITE_BE_PORT; // vite env var
const BACKEND_PORT = rawPort && rawPort !== '' ? rawPort : 3001;
export const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}`;
export const BACKEND_WS_BASE_URL = `ws://localhost:${BACKEND_PORT}`;
