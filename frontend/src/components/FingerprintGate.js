import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';

function b64urlToArrayBuffer(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

function arrayBufferToB64url(buf) {
  const arr = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i]);
  const b64 = window.btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return b64;
}

export default function FingerprintGate({ onPassed, onFail }) {
  const [supported, setSupported] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkSupport() {
      try {
        const hasCred = !!window.PublicKeyCredential;
        if (!hasCred) {
          if (!cancelled) {
            setSupported(false);
            setMessage('Navegador sin soporte WebAuthn. Use un móvil con lector de huella/biometría.');
          }
          return;
        }
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!cancelled) {
          setSupported(!!available);
          if (!available) {
            setMessage('No se encontró un periférico biométrico en este dispositivo. No se puede continuar.');
          }
        }
      } catch (e) {
        if (!cancelled) {
          setSupported(false);
          setMessage('No se pudo verificar soporte biométrico: ' + (e?.message || String(e)));
        }
      }
    }
    checkSupport();
    return () => { cancelled = true; };
  }, []);

  const doRegister = async () => {
    setBusy(true);
    try {
      // 1) Pedir options al backend
      const { data: options } = await apiService.webauthnRegisterOptions();
      const pk = options.publicKey || options; // tolerancia a shape

      // 2) Convertir campos base64url a ArrayBuffer
      const publicKey = {
        ...pk,
        challenge: b64urlToArrayBuffer(pk.challenge),
        user: {
          ...pk.user,
          id: b64urlToArrayBuffer(pk.user.id),
        },
      };

      // 3) Lanzar credential creation (biometría)
      const cred = await navigator.credentials.create({ publicKey });
      const attestationResponse = cred.response;

      // 4) Enviar attestation al backend
      const payload = {
        id: cred.id,
        rawId: arrayBufferToB64url(cred.rawId),
        type: cred.type,
        clientDataJSON: arrayBufferToB64url(attestationResponse.clientDataJSON),
        attestationObject: arrayBufferToB64url(attestationResponse.attestationObject),
      };
      const verify = await apiService.webauthnRegisterVerify(payload);
      if (verify.data?.ok) {
        onPassed?.();
      } else {
        throw new Error('Verificación WebAuthn fallida');
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || String(e);
      setMessage('Error registrando credencial: ' + msg);
      onFail?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      {supported === null && <p>Comprobando disponibilidad de lector biométrico…</p>}
      {supported === false && (
        <div className="error-message" style={{ maxWidth: 520, margin: '0 auto' }}>
          {message}
        </div>
      )}
      {supported === true && (
        <div>
          <p>
            Se detectó un autenticador de plataforma (huella/biometría) en este dispositivo.
          </p>
          <button onClick={doRegister} disabled={busy}>
            {busy ? 'Procesando…' : 'Registrar/Verificar con huella'}
          </button>
          {message && (
            <div style={{ marginTop: 12 }} className="error-message">{message}</div>
          )}
        </div>
      )}
    </div>
  );
}
