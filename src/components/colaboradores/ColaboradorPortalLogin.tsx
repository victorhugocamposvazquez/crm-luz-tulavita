import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Link2,
  ShieldCheck,
  Mail,
  MessageCircle,
  ArrowLeft,
  KeyRound,
} from 'lucide-react';
import { extractPortalToken } from '@/lib/collaborators/portal-session';
import { ColaboradorPortalBrandHeader } from './ColaboradorPortalBrandHeader';
import { waLink } from './colaboradores-config';

type ColaboradorPortalLoginProps = {
  onAuthenticated: (token: string) => void;
  initialError?: string | null;
};

type Step = 'email' | 'code' | 'link';

export function ColaboradorPortalLogin({ onAuthenticated, initialError }: ColaboradorPortalLoginProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) {
      setError('Introduce un email válido.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/collaborator-portal-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', email: normalized }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; message?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo enviar el código');
      setInfo(json.message ?? 'Si tu email está registrado, recibirás un código en breve.');
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el código');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleaned = code.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setError('El código tiene 6 dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/collaborator-portal-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: email.trim().toLowerCase(), code: cleaned }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; token?: string };
      if (!res.ok || !json.success || !json.token) {
        throw new Error(json.error ?? 'Código incorrecto o caducado');
      }
      onAuthenticated(json.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar el código');
    } finally {
      setSubmitting(false);
    }
  };

  const submitLink = async (e: React.FormEvent) => {
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
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Enlace de acceso inválido o expirado');
      onAuthenticated(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar el acceso');
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappHref = waLink(
    `Hola Tulavita, soy colaborador/a y no consigo acceder al portal. Mi email es ${email || '...'}.`,
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
            {step === 'code'
              ? 'Introduce el código de 6 dígitos que te hemos enviado por email.'
              : step === 'link'
                ? 'Pega el enlace personal (magic link) que te envió Tulavita.'
                : 'Entra con tu email registrado. Te enviaremos un código de un solo uso para acceder.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'email' && (
            <>
              <form className="space-y-4" onSubmit={(e) => void requestCode(e)}>
                <div className="space-y-2">
                  <Label htmlFor="portal-email">Email registrado</Label>
                  <Input
                    id="portal-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Usa el email que diste al registrarte como colaborador.
                  </p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Enviar código de acceso
                </Button>
              </form>

              <div className="border-t pt-4 space-y-2">
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => {
                    setError(null);
                    setInfo(null);
                    setStep('link');
                  }}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Tengo un enlace de acceso
                </Button>
              </div>
            </>
          )}

          {step === 'code' && (
            <>
              <form className="space-y-4" onSubmit={(e) => void verifyCode(e)}>
                {info && <p className="text-sm text-muted-foreground">{info}</p>}
                <div className="space-y-2">
                  <Label htmlFor="portal-code">Código de acceso</Label>
                  <Input
                    id="portal-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    maxLength={6}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Enviado a <span className="font-medium">{email}</span>. Caduca en 10 minutos.
                  </p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <KeyRound className="h-4 w-4 mr-2" />
                  )}
                  Entrar al portal
                </Button>
              </form>

              <div className="flex items-center justify-between border-t pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  onClick={() => {
                    setError(null);
                    setCode('');
                    setStep('email');
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  Cambiar email
                </Button>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  disabled={submitting}
                  onClick={() => void requestCode()}
                >
                  Reenviar código
                </Button>
              </div>
            </>
          )}

          {step === 'link' && (
            <>
              <form className="space-y-4" onSubmit={(e) => void submitLink(e)}>
                <div className="space-y-2">
                  <Label htmlFor="portal-magic-link">Enlace o token de acceso</Label>
                  <Input
                    id="portal-magic-link"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://…/colaborador/acceso?token=portal_…"
                    autoComplete="off"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Abre el enlace del email o WhatsApp, o pégalo aquí para iniciar sesión.
                  </p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting || !linkInput.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Acceder con enlace
                </Button>
              </form>

              <div className="border-t pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  onClick={() => {
                    setError(null);
                    setStep('email');
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  Acceder con email
                </Button>
              </div>
            </>
          )}

          <div className="border-t pt-4">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 mr-2" />
                ¿Problemas para entrar? Escríbenos por WhatsApp
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
