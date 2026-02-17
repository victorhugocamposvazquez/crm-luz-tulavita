/**
 * Google Document AI Invoice Parser para facturas (PDF o imagen).
 * Extrae texto y entidades estructuradas: total_amount, supplier_name, line_item, etc.
 * Requiere: GOOGLE_CLOUD_PROJECT, DOCUMENT_AI_LOCATION, DOCUMENT_AI_PROCESSOR_ID
 * (processor tipo "Invoice Parser"), y GOOGLE_APPLICATION_CREDENTIALS_JSON.
 */

const DOCUMENT_AI_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

interface DocAiEntity {
  type?: string;
  mentionText?: string;
  confidence?: number;
  normalizedValue?: {
    moneyValue?: { units?: string; nanos?: number; currencyCode?: string };
    floatValue?: number;
    integerValue?: number;
    textValue?: string;
  };
  properties?: DocAiEntity[];
}

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

function moneyToNumber(money?: { units?: string; nanos?: number }): number | null {
  if (!money) return null;
  const units = Number(money.units ?? 0);
  const nanos = Number(money.nanos ?? 0) / 1e9;
  const n = units + nanos;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getEntityProp(entity: DocAiEntity, typeName: string): DocAiEntity | undefined {
  return entity.properties?.find((p) => (p.type === typeName || p.type?.endsWith('/' + typeName)));
}

/** Extrae total_factura y company_name de entidades del Invoice Parser. */
function parseInvoiceEntities(entities: DocAiEntity[]): {
  total_factura: number | null;
  company_name: string | null;
  consumption_kwh: number | null;
} {
  let total_factura: number | null = null;
  let company_name: string | null = null;
  let consumption_kwh: number | null = null;

  for (const e of entities) {
    const type = (e.type ?? '').toLowerCase();
    if (type === 'total_amount' || type === 'invoice_total') {
      const n = moneyToNumber(e.normalizedValue?.moneyValue);
      if (n != null && (total_factura == null || n > total_factura)) total_factura = n;
      if (total_factura == null && e.mentionText) {
        const parsed = parseFloat(e.mentionText.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (Number.isFinite(parsed) && parsed > 0) total_factura = parsed;
      }
    }
    if (
      (type === 'supplier_name' || type === 'receiver_name' || type === 'supplier_address') &&
      e.mentionText?.trim()
    ) {
      if (!company_name) company_name = e.mentionText.trim();
    }
    if (type === 'line_item' && e.properties?.length) {
      const desc = getEntityProp(e, 'description')?.mentionText?.toLowerCase() ?? '';
      const quantity = getEntityProp(e, 'quantity');
      if (/kwh|energía|energia/.test(desc) && quantity) {
        const q = quantity.normalizedValue?.floatValue ?? quantity.normalizedValue?.integerValue ?? parseFloat(quantity.mentionText?.replace(/[^\d.,]/g, '') ?? '');
        if (Number.isFinite(q) && q > 0 && (consumption_kwh == null || q > consumption_kwh))
          consumption_kwh = q;
      }
    }
  }
  return { total_factura, company_name, consumption_kwh };
}

export interface DocumentAiInvoiceResult {
  text: string;
  confidence: number;
  /** Campos extraídos por el Invoice Parser (cuando están presentes). */
  entities: {
    total_factura: number | null;
    company_name: string | null;
    consumption_kwh: number | null;
  };
}

export async function runDocumentAiInvoiceParser(
  buffer: Buffer,
  mimeType: string
): Promise<DocumentAiInvoiceResult | null> {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.DOCUMENT_AI_PROJECT_ID;
  const location = process.env.DOCUMENT_AI_LOCATION || 'eu';
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;
  if (!project || !processorId) {
    console.log('[DEBUG-INVOICE] document-ai early return: no project or processorId', { project: !!project, processorId: !!processorId });
    return null;
  }

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
    console.log('[DEBUG-INVOICE] document-ai API error', { status: res.status, errPreview: err?.slice(0, 200) });
    return null;
  }
  const data = (await res.json()) as {
    document?: {
      text?: string;
      entities?: DocAiEntity[];
      pages?: Array<{ layout?: { confidence?: number }; detectedBlocks?: unknown[] }>;
    };
  };
  const text = data.document?.text?.trim() ?? '';
  if (!text || text.length < 20) {
    console.log('[DEBUG-INVOICE] document-ai short/no text', { textLen: text?.length ?? 0 });
    return null;
  }

  let confidence = 0.85;
  const pages = data.document?.pages;
  if (pages?.length) {
    const confs = pages
      .map((p) => (p.layout as { confidence?: number } | undefined)?.confidence)
      .filter((c): c is number => typeof c === 'number');
    if (confs.length) confidence = confs.reduce((a, b) => a + b, 0) / confs.length;
  }

  const entities = data.document?.entities ?? [];
  const parsed = parseInvoiceEntities(entities);
  const entityTypes = entities.slice(0, 15).map((e) => e.type);
  console.log('[DEBUG-INVOICE] document-ai result', { textLen: text.length, entityCount: entities.length, entityTypes, total_factura: parsed.total_factura, company_name: parsed.company_name ? 'set' : null, consumption_kwh: parsed.consumption_kwh });
  return {
    text,
    confidence,
    entities: parsed,
  };
}
