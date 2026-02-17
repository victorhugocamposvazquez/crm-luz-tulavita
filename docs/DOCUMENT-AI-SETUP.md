# Configurar Google Document AI para extracción de facturas

El flujo de ahorro energético (landing AhorroLuz) usa **Google Document AI Invoice Parser** para extraer datos estructurados de facturas (total, comercializadora, consumo) en PDF o imagen cuando el backend corre en Vercel.

---

## Si tu organización bloquea claves de cuenta de servicio

Si al crear la clave JSON ves *"La creación de claves de la cuenta de servicio está inhabilitada"* (política `iam.disableServiceAccountKeyCreation`), usa una **cuenta de Google personal** (Gmail):

1. Cierra sesión de la cuenta del trabajo/organización en [Google Cloud Console](https://console.cloud.google.com/).
2. Inicia sesión con tu **Gmail personal**.
3. Sigue esta guía creando un **proyecto nuevo** con esa cuenta. En proyectos personales no suele aplicar esa política y podrás crear la clave JSON sin problema.

---

## 1. Proyecto en Google Cloud

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) con la cuenta con la que vayas a trabajar (personal o no).
2. Arriba, en el selector de proyecto, pulsa **Nuevo proyecto** → pon nombre (ej. `tulavita-docai`) → Crear.
3. Anota el **ID del proyecto** (ej. `tulavita-docai-123456`). Es el valor de `GOOGLE_CLOUD_PROJECT`.

---

## 2. Activar Document AI API

1. En la consola, ve a **APIs y servicios** → **Biblioteca**.
2. Busca **"Cloud Document AI API"**.
3. Ábrela y pulsa **Activar**.

---

## 3. Crear un processor (Invoice Parser)

1. Ve a [Document AI](https://console.cloud.google.com/ai/document-ai) en el menú (o busca "Document AI" en la consola).
2. Asegúrate de tener seleccionada la **región correcta**:
   - Para Europa (recomendado): **europe-west2** (Londres) u otra región EU.
   - La variable `DOCUMENT_AI_LOCATION` debe coincidir con la región del processor: `europe-west2`, `eu`, `us`, etc. (según lo que muestre la consola en la URL del processor).
3. Pulsa **"Create processor"** / **Crear processor**.
4. Elige **"Invoice Parser"** (extrae entidades de facturas: total, proveedor, fechas, line items; soporta varios formatos de factura).
5. Pon un nombre, ej. `facturas-luz`, y crea.
6. En la página del processor verás un **Processor ID** (algo como `a1b2c3d4e5f6g7h8`). **Cópialo**: es el valor de `DOCUMENT_AI_PROCESSOR_ID`.

---

## 4. Cuenta de servicio y clave JSON

1. Ve a **IAM y administración** → **Cuentas de servicio**.
2. Pulsa **Crear cuenta de servicio**:
   - Nombre: p. ej. `document-ai-invoice`.
   - ID: se genera solo.
3. Pulsa **Crear y continuar**.
4. En **Permisos**, añade el rol **"Document AI API User"** (o **"Cloud Document AI API User"**).
5. Finaliza sin asignar usuarios adicionales.
6. En la lista de cuentas de servicio, abre la que acabas de crear → pestaña **Claves**.
7. **Añadir clave** → **Crear clave nueva** → **JSON** → Crear. Se descargará un archivo `.json`.

**Importante:** no subas este JSON a Git. Solo úsalo en variables de entorno (Vercel o `.env` local).

---

## 5. Variables de entorno en Vercel

En tu proyecto en [Vercel](https://vercel.com) → **Settings** → **Environment Variables** añade:

| Nombre | Valor | Notas |
|--------|--------|--------|
| `GOOGLE_CLOUD_PROJECT` | ID de tu proyecto (ej. `mi-proyecto-123`) | Obligatorio |
| `DOCUMENT_AI_PROCESSOR_ID` | Processor ID del paso 3 (ej. `a1b2c3d4e5f6g7h8`) | Obligatorio |
| `DOCUMENT_AI_LOCATION` | Ej. `europe-west2` o `eu` | Debe coincidir con la región del processor (mira la URL del processor en la consola). |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Contenido completo del JSON de la clave (paso 4) | Obligatorio |

### Cómo poner el JSON en Vercel

**Opción A – Pegar el JSON tal cual (recomendado)**  
Abre el archivo `.json` descargado, copia todo (desde `{` hasta `}`) y pégalo como valor de `GOOGLE_APPLICATION_CREDENTIALS_JSON`.  
En Vercel no hace falta envolverlo en comillas; el código acepta un string que empiece por `{`.

**Opción B – En base64**  
Si prefieres no pegar JSON en texto plano:

```bash
# En la terminal (sustituye la ruta por la de tu archivo)
cat ruta/al-archivo-descargado.json | base64 -w 0
```

Pega el resultado como valor de `GOOGLE_APPLICATION_CREDENTIALS_JSON`. El código detecta base64 y lo decodifica.

Después de guardar las variables, **redespliega** la aplicación en Vercel para que el API `/api/process-invoice` las use.

---

## 6. Probar en local (opcional)

Crea un `.env.local` en la raíz del proyecto (y asegúrate de que esté en `.gitignore`):

```env
GOOGLE_CLOUD_PROJECT=tu-project-id
DOCUMENT_AI_PROCESSOR_ID=tu-processor-id
DOCUMENT_AI_LOCATION=eu
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@....iam.gserviceaccount.com","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

Pega aquí el contenido completo del JSON de la cuenta de servicio (una sola línea, sin saltos).

---

## Resumen de variables

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Sí | ID del proyecto en Google Cloud |
| `DOCUMENT_AI_PROCESSOR_ID` | Sí | ID del processor **Invoice Parser** que creaste |
| `DOCUMENT_AI_LOCATION` | No | Región del processor (`eu`, `us`, etc.). Por defecto: `eu` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Sí | JSON completo de la clave de la cuenta de servicio (o el mismo en base64) |

Con esto, el endpoint `/api/process-invoice` usará el Invoice Parser para extraer total, comercializadora y (cuando aplique) consumo de las facturas, y combinará con reglas sobre el texto para consumo en kWh y periodo, calculando el ahorro en Vercel.
