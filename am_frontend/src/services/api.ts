import axios from 'axios';

const getBaseUrl = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  const hostname = window.location.hostname;
  const host = (hostname === 'localhost' || !hostname) ? '127.0.0.1' : hostname;
  return `http://${host}:8005`;
};

// Create an Axios instance pointing to your FastAPI backend
const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to attach X-User-ID and optional Authorization token
api.interceptors.request.use(
  (config) => {
    // Grab stored user identity from session storage
    const rawUser = sessionStorage.getItem('user');
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        const userId = parsed?.user_id || parsed?.employee_id || parsed?.id;
        if (userId) {
          config.headers['X-User-ID'] = String(userId);
        }
      } catch (err) {
        // Malformed session user object - do NOT send X-User-ID fallback
      }
    }

    // Grab the token from session storage if present
    const token = sessionStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear invalid session identity
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('access_token');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;