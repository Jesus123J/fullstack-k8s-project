import React, { useState } from 'react';
import { apiService } from '../services/api';

export default function RegisterFace() {
  const [selfie, setSelfie] = useState(null);
  const [dniImage, setDniImage] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!selfie || !dniImage) {
      setError('Seleccione ambos archivos');
      return;
    }
    try {
      setLoading(true);
      const { data } = await apiService.faceVerify(selfie, dniImage);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al verificar rostro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="selfie">Selfie</label>
          <input id="selfie" type="file" accept="image/*" onChange={(e) => setSelfie(e.target.files?.[0] || null)} />
        </div>
        <div>
          <label htmlFor="dni">Foto de DNI</label>
          <input id="dni" type="file" accept="image/*" onChange={(e) => setDniImage(e.target.files?.[0] || null)} />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Verificando...' : 'Verificar'}</button>
      </form>

      {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
      {result && (
        <pre style={{ textAlign: 'left', marginTop: 12 }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
