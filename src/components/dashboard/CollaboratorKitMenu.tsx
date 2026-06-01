import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { Link2, QrCode, Copy, ExternalLink, KeyRound, ChevronDown, UserPlus } from 'lucide-react';
import {
  ALL_ENTRY_MODES,
  ENTRY_MODE_LABELS,
  type CollaboratorEntryMode,
} from '@/lib/collaborators/types';
import {
  buildClientCaptureUrl,
  buildPortalUrl,
  buildRecruitmentUrl,
  getAppBaseUrl,
} from '@/lib/collaborators/links';
import { createReferralToken, createAccessToken } from '@/lib/collaborators/tokens';
import { downloadQrPng, generateQrDataUrl } from '@/lib/collaborators/qr';

type CollaboratorKitMenuProps = {
  collaboratorId: string;
  code: string;
  name: string;
  compact?: boolean;
};

export function CollaboratorKitMenu({ collaboratorId, code, name, compact }: CollaboratorKitMenuProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const baseUrl = getAppBaseUrl();

  const copyText = async (value: string, label = 'Enlace copiado') => {
    await navigator.clipboard.writeText(value);
    toast({ title: label });
  };

  /**
   * Get-or-create de enlace de referido. Para enlaces permanentes reutiliza uno
   * activo existente (mismo modo + etiqueta) en vez de crear un token nuevo en cada
   * clic, evitando que se acumulen cientos de tokens por colaborador.
   */
  const getOrCreateReferralToken = async (
    entryMode: CollaboratorEntryMode,
    label: string,
    expiresInDays?: number,
  ): Promise<string> => {
    if (expiresInDays == null) {
      const nowIso = new Date().toISOString();
      const { data: existing } = await supabase
        .from('collaborator_referral_links')
        .select('token, expires_at')
        .eq('collaborator_id', collaboratorId)
        .eq('entry_mode', entryMode)
        .eq('label', label)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.token && (existing.expires_at == null || existing.expires_at > nowIso)) {
        return existing.token;
      }
    }
    const token = createReferralToken();
    const expiresAt =
      expiresInDays != null
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const { error } = await supabase.from('collaborator_referral_links').insert({
      collaborator_id: collaboratorId,
      token,
      entry_mode: entryMode,
      is_active: true,
      expires_at: expiresAt,
      label,
    });
    if (error) throw error;
    return token;
  };

  const createSignedLink = async (entryMode: CollaboratorEntryMode, expiresInDays?: number) => {
    const token = await getOrCreateReferralToken(entryMode, ENTRY_MODE_LABELS[entryMode], expiresInDays);
    return buildClientCaptureUrl(baseUrl, { token });
  };

  const handleCopySigned = async (mode: CollaboratorEntryMode) => {
    setBusy(`copy-${mode}`);
    try {
      const url = await createSignedLink(mode);
      await copyText(url, `${ENTRY_MODE_LABELS[mode]} — enlace copiado`);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo generar el enlace',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleCopyDirect = async (mode: CollaboratorEntryMode) => {
    const url = buildClientCaptureUrl(baseUrl, { code, entryMode: mode });
    await copyText(url, `Enlace directo (${code}) copiado`);
  };

  const handleQr = async (mode: CollaboratorEntryMode, signed: boolean) => {
    setBusy(`qr-${mode}-${signed ? 'signed' : 'direct'}`);
    try {
      const url = signed ? await createSignedLink(mode) : buildClientCaptureUrl(baseUrl, { code, entryMode: mode });
      const dataUrl = await generateQrDataUrl(url);
      downloadQrPng(dataUrl, `qr-${code}-${mode}.png`);
      toast({ title: 'QR descargado' });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo generar el QR',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const createRecruitToken = async () => getOrCreateReferralToken('auto', 'Reclutamiento');

  const handleCopyRecruit = async () => {
    setBusy('recruit-copy');
    try {
      const token = await createRecruitToken();
      const url = buildRecruitmentUrl(baseUrl, { recruitToken: token });
      await copyText(url, 'Enlace de reclutamiento copiado');
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo generar el enlace',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleQrRecruit = async () => {
    setBusy('recruit-qr');
    try {
      const token = await createRecruitToken();
      const url = buildRecruitmentUrl(baseUrl, { recruitToken: token });
      const dataUrl = await generateQrDataUrl(url);
      downloadQrPng(dataUrl, `qr-reclutamiento-${code}.png`);
      toast({ title: 'QR de reclutamiento descargado' });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo generar el QR',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handlePortalLink = async (expiresInDays?: number) => {
    setBusy('portal');
    try {
      let token: string | null = null;
      // El enlace de portal permanente se reutiliza; los temporales siempre son nuevos.
      if (expiresInDays == null) {
        const nowIso = new Date().toISOString();
        const { data: existing } = await supabase
          .from('collaborator_access_tokens')
          .select('token, expires_at')
          .eq('collaborator_id', collaboratorId)
          .eq('label', 'Portal permanente')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.token && (existing.expires_at == null || existing.expires_at > nowIso)) {
          token = existing.token;
        }
      }
      if (!token) {
        token = createAccessToken();
        const expiresAt =
          expiresInDays != null
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
            : null;
        const { error } = await supabase.from('collaborator_access_tokens').insert({
          collaborator_id: collaboratorId,
          token,
          is_active: true,
          expires_at: expiresAt,
          label: expiresInDays ? `Portal ${expiresInDays}d` : 'Portal permanente',
        });
        if (error) throw error;
      }
      const url = buildPortalUrl(baseUrl, token);
      await copyText(url, 'Enlace de portal copiado');
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo generar el portal',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={compact ? 'sm' : 'default'} disabled={!!busy}>
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          Kit
          <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Enlaces firmados (recomendado)
        </DropdownMenuLabel>
        {ALL_ENTRY_MODES.map((mode) => (
          <DropdownMenuItem key={`signed-${mode}`} onClick={() => void handleCopySigned(mode)} disabled={!!busy}>
            <Copy className="h-3.5 w-3.5 mr-2" />
            {ENTRY_MODE_LABELS[mode]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Enlace directo ?collaborator={code}
        </DropdownMenuLabel>
        {ALL_ENTRY_MODES.map((mode) => (
          <DropdownMenuItem key={`direct-${mode}`} onClick={() => void handleCopyDirect(mode)}>
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Directo · {ENTRY_MODE_LABELS[mode]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">QR (enlace firmado)</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void handleQr('upload', true)}>
          <QrCode className="h-3.5 w-3.5 mr-2" />
          QR subir factura
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleQr('auto', true)}>
          <QrCode className="h-3.5 w-3.5 mr-2" />
          QR captación completa
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Reclutar colaboradores (su referido)
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void handleCopyRecruit()} disabled={!!busy}>
          <UserPlus className="h-3.5 w-3.5 mr-2" />
          Copiar enlace de reclutamiento
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleQrRecruit()} disabled={!!busy}>
          <QrCode className="h-3.5 w-3.5 mr-2" />
          QR de reclutamiento
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Portal autoservicio (magic link)
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void handlePortalLink()}>
          <KeyRound className="h-3.5 w-3.5 mr-2" />
          Copiar enlace de acceso
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handlePortalLink(24)}>
          <KeyRound className="h-3.5 w-3.5 mr-2" />
          Portal 24h (temporal)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
