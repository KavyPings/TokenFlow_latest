// In local development, keep VITE_API_BASE_URL empty so Vite's /api proxy handles requests.
// In production split deployments, set VITE_API_BASE_URL to your backend URL.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function toUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export async function api(path, options = {}) {
  const response = await fetch(toUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return response.text();
  }

  return response.json();
}

export function getWebSocketUrl() {
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/^http/i, 'ws') + '/ws';
  }

  // Same-origin fallback for local dev and single-host deployments.
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/ws`;
}

