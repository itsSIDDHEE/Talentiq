import axios from 'axios';

// Base Axios instance configured for future FastAPI backend integration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor for attaching auth tokens once JWT backend is connected
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('talentiq_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for unified error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Future hook: clear token & redirect on expiration
      console.warn('Unauthorized request - session expired');
    }
    return Promise.reject(error);
  }
);

export default api;
