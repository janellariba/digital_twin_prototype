// Small fetch wrapper for the FastAPI server. Turns HTTP errors into readable messages.
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error("Cannot reach the server. Is it running? (uvicorn app.main:app --port 8000)");
  }
  if (res.status === 204) return null;
  if (res.status === 502 || res.status === 504) {
    throw new Error("Server not running. Start it: cd server, then uvicorn app.main:app --host 127.0.0.1 --port 8000");
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const detail = data?.detail;
    const msg = Array.isArray(detail)
      ? detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ")
      : detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b) => request("POST", p, b ?? {}),
  patch: (p, b) => request("PATCH", p, b ?? {}),
  del: (p) => request("DELETE", p),
};
