// A fetch wrapper with a hard timeout. React Native's fetch has NO default
// timeout, so on a stalled / captive-portal connection a request hangs until the
// OS TCP timeout (60s+), leaving spinners spinning and buttons disabled forever.
// Every network call in the app goes through this so a dead connection fails in
// a bounded time instead of wedging the screen.
export const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  ms: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
