import React, { useState } from 'react';
import { apiService } from '../services/api';

export default function LoginDni({ onLoggedIn }) {
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{8,12}$/.test(dni)) {
      setError('Ingrese un DNI válido (8-12 dígitos)');
      return;
    }
    try {
      setLoading(true);
      const { data } = await apiService.loginDni(dni);
      onLoggedIn?.(data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="dni">DNI</label>
      <input
        id="dni"
        name="dni"
        type="text"
        value={dni}
        onChange={(e) => setDni(e.target.value)}
        placeholder="Ingrese su DNI"
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>
      {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
    </form>
  );
}
