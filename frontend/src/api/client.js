const API_BASE = '/api';

class ApiClient {
  async request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'include',
      ...options,
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    if (config.body instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    let res;
    try {
      res = await fetch(url, config);
    } catch (err) {
      // Network error — no mock fallback. Surface it so the user knows the backend is unreachable.
      throw new Error('Network error: unable to reach the server. Please check your connection or try again later.');
    }

    if (res.status === 401) {
      // Don't redirect for auth endpoints — let the caller handle the error
      if (path === '/auth/me' || path === '/auth/refresh' || path === '/auth/login') {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Not authenticated');
      }
      const refreshed = await this.refreshToken();
      if (refreshed) {
        return fetch(url, config).then(r => r.json());
      }
      // Dispatch a DOM event so AuthContext can react via React state (no hard reload).
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      throw new Error('Session expired');
    }

    if (res.headers.get('content-type')?.includes('text/csv')) {
      return res.blob();
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data.error || data.message || `Request failed (${res.status})`;
      // Dispatch toast event so the UI can show the error to the user
      window.dispatchEvent(new CustomEvent('toast:error', { detail: message }));
      throw new Error(message);
    }

    const data = await res.json();
    return data;
  }

  async refreshToken() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  get(path) { return this.request(path); }

  post(path, body) {
    return this.request(path, { method: 'POST', body });
  }

  put(path, body) {
    return this.request(path, { method: 'PUT', body });
  }

  patch(path, body) {
    return this.request(path, { method: 'PATCH', body });
  }

  delete(path) {
    return this.request(path, { method: 'DELETE' });
  }

  upload(path, formData) {
    return this.request(path, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  }
}

export const api = new ApiClient();
export default api;
