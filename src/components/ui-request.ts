// Bound UI waiting without retrying mutations whose result may be uncertain.
export async function uiRequest(
  input: string,
  init: RequestInit = {},
  timeoutMs = 30000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // Consume the body inside the deadline, including a stalled response stream.
    const body = await response.arrayBuffer();
    return new Response(
      [204, 205, 304].includes(response.status) ? null : body,
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "This request took too long. Check your records before retrying; the action may have completed.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
