import requests
from django.http import JsonResponse
from django.conf import settings
import json
import tempfile
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.authentication import JWTAuthentication
from .auth import DNITokenAuthentication
import os
import re
from .models import DNIToken, WebAuthnCredential
import base64
import secrets

"""Views protegidas con JWT del usuario. El servicio internamente usa un token propio para RENIEC."""

@api_view(["GET", "POST"])
@authentication_classes([JWTAuthentication, DNITokenAuthentication])
@permission_classes([IsAuthenticated])
def verificar_dni(request):
    # GET: /api/dni/?numero=XXXXXXXX  |  POST: JSON { "numero": "XXXXXXXX" }
    if request.method == "GET":
        numero = request.GET.get("numero")
    else:
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"error": "JSON inválido"}, status=400)
        numero = payload.get("numero")
    if not numero:
        return JsonResponse({"error": "Número de DNI requerido"}, status=400)

    # Configuración del servicio RENIEC desde settings
    reniec_api = settings.RENEIC_API
    reniec_token = settings.RENEIC_TOKEN

    if not reniec_token:
        return JsonResponse({
            "error": "Token de servicio RENIEC no configurado",
            "hint": "Defina RENEIC_TOKEN en variables de entorno o en settings"
        }, status=500)

    # Intentos con diferentes estilos de autenticación comunes
    ua = "dni-checker/1.0 (+github.com/your-org)"
    base_headers = {"User-Agent": ua}
    attempts = [
        {"headers": {"Authorization": f"Bearer {reniec_token}"}, "params": {}},
        {"headers": {"Authorization": reniec_token}, "params": {}},
        {"headers": {"X-API-Key": reniec_token}, "params": {}},
        {"headers": {"x-api-key": reniec_token}, "params": {}},
        {"headers": {}, "params": {"apikey": reniec_token}},
        {"headers": {}, "params": {"token": reniec_token}},
    ]

    last_resp = None
    last_style = None
    for style in attempts:
        try:
            headers = {**base_headers, **style["headers"]}
            params = {"numero": numero, **style["params"]}
            resp = requests.get(reniec_api, headers=headers, params=params, timeout=20)
        except requests.RequestException as e:
            return JsonResponse({"error": f"Error de red: {str(e)}"}, status=502)

        # Éxito: retornamos
        if resp.ok:
            try:
                data = resp.json()
            except ValueError:
                return JsonResponse({"error": "Respuesta no es JSON"}, status=502)
            return JsonResponse(data, safe=False)

        last_resp = resp
        last_style = style

        # Si es claramente auth/rate-limit, probamos siguiente estilo
        body = (resp.text or "").lower()
        if resp.status_code in (401, 403, 429) or "apikey" in body or "api key" in body:
            continue
        else:
            break

    # Sin éxito tras los intentos: responder con detalle
    status_code = last_resp.status_code if last_resp is not None else 502
    masked = reniec_token[:4] + "***" + reniec_token[-4:] if reniec_token else ""
    return JsonResponse({
        "error": "No se pudo verificar el DNI",
        "status": status_code,
        "details": (last_resp.text[:500] if last_resp is not None else "Sin respuesta"),
        "used_auth_styles": "multiple",
        "token_hint": masked,
    }, status=status_code)



@api_view(["POST"])
@authentication_classes([JWTAuthentication, DNITokenAuthentication])
@permission_classes([IsAuthenticated])
def verificar_foto(request):
    # Espera multipart/form-data con archivos: 'selfie' y 'dni'
    selfie = request.FILES.get("selfie")
    dni = request.FILES.get("dni")

    if not selfie or not dni:
        return JsonResponse({"error": "Se requieren archivos 'selfie' y 'dni'"}, status=400)

    try:
        # Importar DeepFace en tiempo de ejecución para no romper el servidor si no está instalado
        try:
            from deepface import DeepFace
        except ImportError:
            return JsonResponse({"error": "Dependencia faltante: instale 'deepface' para usar este endpoint"}, status=501)

        # Guardar temporalmente los archivos para que DeepFace los procese por ruta
        with tempfile.NamedTemporaryFile(suffix=".jpg") as f1, tempfile.NamedTemporaryFile(suffix=".jpg") as f2:
            for chunk in selfie.chunks():
                f1.write(chunk)
            f1.flush()
            for chunk in dni.chunks():
                f2.write(chunk)
            f2.flush()
            result = DeepFace.verify(img1_path=f1.name, img2_path=f2.name)

        # DeepFace devuelve diccionario con keys como 'verified', 'distance', etc.
        return JsonResponse(result, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


# Login por DNI: emite un token propio no-expirable
from rest_framework.permissions import AllowAny
from .models import DNIToken

@api_view(["POST"])
@permission_classes([AllowAny])
def login_dni(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "JSON inválido"}, status=400)
    dni = (payload.get("dni") or "").strip()
    if not re.fullmatch(r"\d{8,12}", dni):
        return JsonResponse({"error": "DNI inválido"}, status=400)

    token_obj = DNIToken.issue_for(dni)
    return JsonResponse({"token": token_obj.token, "dni": dni})


@api_view(["POST"])
@authentication_classes([JWTAuthentication, DNITokenAuthentication])
@permission_classes([IsAuthenticated])
def webauthn_register_verify(request):
    """Recibe attestation response. Para demo, no valida criptográficamente y guarda credencial."""
    dni = _get_dni_from_token(request)
    if not dni:
        return JsonResponse({"error": "DNI no encontrado para token"}, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    expected_challenge = request.session.get("webauthn_register_challenge")
    if not expected_challenge:
        return JsonResponse({"error": "Challenge no encontrado en sesión"}, status=400)

    client_data_json_b64 = payload.get("clientDataJSON")
    attestation_object_b64 = payload.get("attestationObject")
    raw_id_b64 = payload.get("rawId")

    if not (client_data_json_b64 and attestation_object_b64 and raw_id_b64):
        return JsonResponse({"error": "Faltan campos de attestation"}, status=400)

    # En un sistema real, verificarías clientData.challenge == expected_challenge y parsearías attestation.
    # Aquí, almacenamos la credencial con datos mínimos.
    cred_id = raw_id_b64
    WebAuthnCredential.objects.update_or_create(
        credential_id=cred_id,
        defaults={
            "dni": dni,
            "user_handle": dni,
            "public_key": "stored-in-attestation-parsing",
            "sign_count": 0,
        },
    )

    # Limpiar challenge
    request.session.pop("webauthn_register_challenge", None)
    return JsonResponse({"ok": True})


@api_view(["POST"])
@authentication_classes([JWTAuthentication, DNITokenAuthentication])
@permission_classes([IsAuthenticated])
def webauthn_authenticate_options(request):
    dni = _get_dni_from_token(request)
    if not dni:
        return JsonResponse({"error": "DNI no encontrado para token"}, status=401)

    creds = WebAuthnCredential.objects.filter(dni=dni)
    if not creds.exists():
        return JsonResponse({"error": "Sin credenciales registradas"}, status=404)

    challenge = secrets.token_bytes(32)
    request.session["webauthn_auth_challenge"] = _b64url(challenge)
    allow = [{"type": "public-key", "id": c.credential_id} for c in creds]
    options = {
        "publicKey": {
            "challenge": request.session["webauthn_auth_challenge"],
            "timeout": 60000,
            "rpId": request.get_host().split(":")[0],
            "userVerification": "required",
            "allowCredentials": allow,
        }
    }
    return JsonResponse(options)


@api_view(["POST"])
@authentication_classes([JWTAuthentication, DNITokenAuthentication])
@permission_classes([IsAuthenticated])
def webauthn_authenticate_verify(request):
    dni = _get_dni_from_token(request)
    if not dni:
        return JsonResponse({"error": "DNI no encontrado para token"}, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    expected_challenge = request.session.get("webauthn_auth_challenge")
    if not expected_challenge:
        return JsonResponse({"error": "Challenge no encontrado en sesión"}, status=400)

    raw_id_b64 = payload.get("rawId")
    authenticator_data_b64 = payload.get("authenticatorData")
    client_data_json_b64 = payload.get("clientDataJSON")
    signature_b64 = payload.get("signature")

    if not (raw_id_b64 and authenticator_data_b64 and client_data_json_b64 and signature_b64):
        return JsonResponse({"error": "Faltan campos de assertion"}, status=400)

    # En un sistema real, verificarías la firma con la public_key almacenada.
    # Aquí aceptamos la assertion y marcamos ok.
    request.session.pop("webauthn_auth_challenge", None)
    return JsonResponse({"ok": True})