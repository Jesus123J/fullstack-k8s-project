import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token de autenticación
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // DNI login (emite token propio)
  loginDni: (dni) => api.post('/login-dni/', { dni }),

  // Health check
  healthCheck: () => api.get('/health/'),
  
  // Tasks
  getTasks: () => api.get('/tasks/'),
  createTask: (task) => api.post('/tasks/', task),
  updateTask: (id, task) => api.put(`/tasks/${id}/`, task),
  deleteTask: (id) => api.delete(`/tasks/${id}/`),
  
  // User
  getUserProfile: () => api.get('/user/'),

  // Face verification (multipart)
  faceVerify: (selfieFile, dniFile) => {
    const formData = new FormData();
    formData.append('selfie', selfieFile);
    formData.append('dni', dniFile);
    return api.post('/face-verify/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // WebAuthn
  webauthnRegisterOptions: () => api.post('/webauthn/register/options/'),
  webauthnRegisterVerify: (data) => api.post('/webauthn/register/verify/', data),
  webauthnAuthenticateOptions: () => api.post('/webauthn/authenticate/options/'),
  webauthnAuthenticateVerify: (data) => api.post('/webauthn/authenticate/verify/', data),
};

export default api;
