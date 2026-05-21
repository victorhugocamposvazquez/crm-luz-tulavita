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
import { Link2, QrCode, Copy, ExternalLink, KeyRound, ChevronDown } from 'lucide-react';
import {
  ALL_ENTRY_MODES,
  ENTRY_MODE_LABELS,
  type CollaboratorEntryMode,
} from '@/lib/collaborators/types';
import { buildClientCaptureUrl, buildPortalUrl, getAppBaseUrl } from '@/lib/collaborators/links';
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

  const createSignedLink = async (entryMode: CollaboratorEntryMode, expiresInDays?: number) => {
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
      label: ENTRY_MODE_LABELS[entryMode],
    });
    if (error) throw error;
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

  const handlePortalLink = async (expiresInDays?: number) => {
    setBusy('portal');
    try {
      const token = createAccessToken();
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
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Portal autoservicio</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void handlePortalLink()}>
          <KeyRound className="h-3.5 w-3.5 mr-2" />
          Copiar enlace portal
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handlePortalLink(24)}>
          <KeyRound className="h-3.5 w-3.5 mr-2" />
          Portal 24h (temporal)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
