import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Link2, ShieldCheck, Mail, MessageCircle } from 'lucide-react';
import { extractPortalToken } from '@/lib/collaborators/portal-session';
import { ColaboradorPortalBrandHeader } from './ColaboradorPortalBrandHeader';
import { waLink } from './colaboradores-config';

type ColaboradorPortalLoginProps = {
  onAuthenticated: (token: string) => void;
  initialError?: string | null;
};

export function ColaboradorPortalLogin({ onAuthenticated, initialError }: ColaboradorPortalLoginProps) {
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryDelivery, setRecoveryDelivery] = useState<'email' | 'manual' | 'unknown' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const token = extractPortalToken(linkInput);
    if (!token) {
      setError('Pega el enlace de acceso completo o el token que te envió Tulavita.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/resolve-collaborator-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Enlace de acceso inválido o expirado');
      }
      onAuthenticated(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar el acceso');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryMessage(null);
    setRecoveryDelivery(null);
    setRecoverySubmitting(true);
    try {
      const res = await fetch('/api/collaborator-portal-request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recoveryEmail.trim() || undefined,
          phone: recoveryPhone.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        delivery?: 'email' | 'manual' | 'unknown';
      };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo enviar la solicitud');
      setRecoveryMessage(json.message ?? 'Si tus datos están registrados, te enviaremos un nuevo enlace.');
      setRecoveryDelivery(json.delivery ?? 'unknown');
    } catch (err) {
      setRecoveryMessage(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
      setRecoveryDelivery(null);
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const whatsappRecoveryHref = waLink(
    `Hola Tulavita, soy colaborador/a y he olvidado mi enlace de acceso al portal. Mi email es ${recoveryEmail || '...'} y mi teléfono ${recoveryPhone || '...'}.`,
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <ColaboradorPortalBrandHeader className="mb-6" />
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Acceso colaboradores
          </CardTitle>
          <CardDescription>
            Zona privada protegida. Entra con el enlace personal (magic link) que te envió Tulavita. Tras validarlo
            accederás a tu panel en <span className="font-mono text-xs">/colaborador/panel</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showRecovery ? (
            <>
              <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
                <div className="space-y-2">
                  <Label htmlFor="portal-magic-link">Enlace o token de acceso</Label>
                  <Input
                    id="portal-magic-link"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://…/colaborador/acceso?token=portal_…"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Abre el enlace del email o WhatsApp, o pégalo aquí para iniciar sesión.
                  </p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting || !linkInput.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Acceder al portal
                </Button>
              </form>

              <div className="border-t pt-4">
                <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setShowRecovery(true)}>
                  ¿Has olvidado tu enlace de acceso?
                </Button>
              </div>
            </>
          ) : (
            <>
              <form className="space-y-4" onSubmit={(e) => void handleRecovery(e)}>
                <div className="space-y-2">
                  <Label htmlFor="recovery-email">Email registrado</Label>
                  <Input
                    id="recovery-email"
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="tu@email.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recovery-phone">Teléfono registrado (alternativa)</Label>
                  <Input
                    id="recovery-phone"
                    value={recoveryPhone}
                    onChange={(e) => setRecoveryPhone(e.target.value)}
                    placeholder="600 000 000"
                    autoComplete="tel"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa el email o teléfono que diste al darte de alta como colaborador. Te enviaremos un nuevo magic
                    link si coinciden con nuestros datos.
                  </p>
                </div>
                {recoveryMessage && (
                  <p
                    className={`text-sm ${recoveryDelivery === 'manual' ? 'text-amber-700' : 'text-muted-foreground'}`}
                  >
                    {recoveryMessage}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={recoverySubmitting || (!recoveryEmail.trim() && !recoveryPhone.trim())}
                >
                  {recoverySubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Enviar nuevo enlace
                </Button>
              </form>

              {(recoveryDelivery === 'manual' || recoveryDelivery === 'unknown') && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={whatsappRecoveryHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Pedir enlace por WhatsApp
                  </a>
                </Button>
              )}

              <Button variant="ghost" className="w-full" onClick={() => setShowRecovery(false)}>
                Volver al acceso con enlace
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
