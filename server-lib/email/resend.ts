type SendEmailResult = { sent: true } | { sent: false; reason: string };

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.COLLABORATOR_PORTAL_FROM_EMAIL?.trim() ||
    'Tulavita Energía <noreply@crm.virvita.es>';

  if (!apiKey) {
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[sendResendEmail]', res.status, body);
      return { sent: false, reason: 'send_failed' };
    }

    return { sent: true };
  } catch (err) {
    console.error('[sendResendEmail]', err);
    return { sent: false, reason: 'send_failed' };
  }
}
