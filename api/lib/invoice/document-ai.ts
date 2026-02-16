/**
 * Google Document AI OCR para PDFs sin texto o imágenes.
 * Requiere: GOOGLE_CLOUD_PROJECT, DOCUMENT_AI_LOCATION, DOCUMENT_AI_PROCESSOR_ID,
 * y GOOGLE_APPLICATION_CREDENTIALS_JSON (service account key en base64 o JSON string).
 */

const DOCUMENT_AI_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

async function getAccessToken(): Promise<string> {
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credsJson) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON not set');
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = typeof credsJson === 'string' && credsJson.startsWith('{')
      ? JSON.parse(credsJson)
      : JSON.parse(Buffer.from(credsJson, 'base64').toString('utf8'));
  } catch {
    throw new Error('Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON');
  }
  const { client_email, private_key } = creds;
  if (!private_key || !client_email) throw new Error('Missing client_email or private_key in credentials');

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: client_email,
    sub: client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: DOCUMENT_AI_SCOPE,
  };
  const base64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signInput = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(Buffer.from(JSON.stringify(payload)))}`;
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256').update(signInput).sign(private_key, 'base64');
  const jwt = `${signInput}.${sign.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Document AI auth failed: ${err}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token;
}

export interface DocumentAiResult {
  text: string;
  confidence: number;
}

export async function runDocumentAiOcr(
  buffer: Buffer,
  mimeType: string
): Promise<DocumentAiResult | null> {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.DOCUMENT_AI_PROJECT_ID;
  const location = process.env.DOCUMENT_AI_LOCATION || 'eu';
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;
  if (!project || !processorId) return null;

  const token = await getAccessToken();
  const url = `https://${location}-documentai.googleapis.com/v1/projects/${project}/locations/${location}/processors/${processorId}:process`;
  const body = {
    rawDocument: {
      content: buffer.toString('base64'),
      mimeType: mimeType === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[document-ai]', res.status, err);
    return null;
  }
  const data = (await res.json()) as {
    document?: { text?: string; pages?: Array<{ layout?: { textAnchor?: { textSegments?: Array<{ confidence?: number }> } } }> };
  };
  const text = data.document?.text?.trim() || '';
  if (!text) return null;
  let confidence = 0.8;
  const pages = data.document?.pages;
  if (pages?.length) {
    const confs = pages.flatMap((p) => (p.layout as { textAnchor?: { textSegments?: Array<{ confidence?: number }> } })?.textAnchor?.textSegments?.map((s) => s.confidence) ?? []);
    if (confs.length) confidence = confs.reduce((a, b) => a + (b ?? 0), 0) / confs.length;
  }
  return { text, confidence };
}
