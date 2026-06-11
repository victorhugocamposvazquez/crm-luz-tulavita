import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  QrCode,
  UserPlus,
  Copy,
  Upload,
  Users,
  Share2,
  ArrowRight,
  BadgeEuro,
} from 'lucide-react';
import { ALL_ENTRY_MODES, ENTRY_MODE_LABELS, type CollaboratorEntryMode } from '@/lib/collaborators/types';
import { buildClientCaptureUrl, getAppBaseUrl } from '@/lib/collaborators/links';
import { downloadQrPng, generateQrDataUrl } from '@/lib/collaborators/qr';
import { InstallPwaPrompt } from '@/components/colaboradores/InstallPwaPrompt';
import type { PortalData } from './portal-types';

type PortalInicioSectionProps = {
  data: PortalData;
  pendingInvoiceCount: number;
  onGoTo: (tab: string) => void;
};

export function PortalInicioSection({ data, pendingInvoiceCount, onGoTo }: PortalInicioSectionProps) {
  const [showAdvancedLinks, setShowAdvancedLinks] = useState(false);
  const baseUrl = getAppBaseUrl();
  const { collaborator, stats, pending_payouts, captured_clients } = data;

  const getLinkForMode = (mode: CollaboratorEntryMode): string => {
    const activeLink = data.referral_links.find((l) => l.entry_mode === mode && l.is_active);
    if (activeLink) return buildClientCaptureUrl(baseUrl, { token: activeLink.token });
    if (collaborator.code) return buildClientCaptureUrl(baseUrl, { code: collaborator.code, entryMode: mode });
    return '';
  };

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Enlace copiado' });
  };

  const shareLink = async (url: string, title: string) => {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title, text: 'Calcula tu ahorro en la factura de la luz', url });
        return;
      } catch {
        /* el usuario canceló o no se pudo compartir: caemos a copiar */
      }
    }
    await copyLink(url);
  };

  const downloadQr = async (url: string, filename: string) => {
    const dataUrl = await generateQrDataUrl(url);
    downloadQrPng(dataUrl, filename);
    toast({ title: 'QR descargado' });
  };

  const mainCaptureUrl = getLinkForMode('auto');
  const totalPendingEur = pending_payouts.reduce((sum, p) => sum + Number(p.amount_total_eur), 0);
  const clientsInProcess = captured_clients.filter((c) => !['converted', 'lost'].includes(c.status)).length;
  const firstName = collaborator.name.split(' ')[0] ?? collaborator.name;

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-lime-50 to-emerald-50 border-emerald-200">
        <CardContent className="pt-5 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Hola {firstName} 👋</p>
            <p className="text-base font-medium">Comparte tu enlace y empieza a ganar comisiones.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void shareLink(mainCaptureUrl, 'Calcula tu ahorro de luz')}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Compartir mi enlace
            </Button>
            <Button variant="outline" onClick={() => void copyLink(mainCaptureUrl)}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </Button>
            <Button
              variant="outline"
              onClick={() => void downloadQr(mainCaptureUrl, `qr-${collaborator.code}-auto`)}
            >
              <QrCode className="h-4 w-4 mr-2" />
              QR
            </Button>
          </div>
          <p className="text-xs text-muted-foreground break-all">{mainCaptureUrl}</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="bg-muted/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <BadgeEuro className="h-3.5 w-3.5" />
              Pendiente de cobro
            </p>
            <p className="text-2xl font-semibold">{totalPendingEur.toFixed(2)} €</p>
            <p className="text-xs text-muted-foreground">
              {pending_payouts.length} liquidación{pending_payouts.length === 1 ? '' : 'es'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Clientes en proceso
            </p>
            <p className="text-2xl font-semibold">{clientsInProcess}</p>
            <p className="text-xs text-muted-foreground">de {stats.leads_total} aportados</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">¿Qué quieres hacer?</p>

        {pendingInvoiceCount > 0 && (
          <button
            type="button"
            onClick={() => onGoTo('payouts')}
            className="w-full flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 text-left hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium">Sube tu factura de comisión</p>
                <p className="text-xs text-muted-foreground">
                  Tienes {pendingInvoiceCount} liquidación{pendingInvoiceCount === 1 ? '' : 'es'} lista
                  {pendingInvoiceCount === 1 ? '' : 's'} para facturar y cobrar.
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onGoTo('client')}
          className="w-full flex items-center justify-between rounded-lg border bg-background p-3 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <UserPlus className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Registrar un cliente</p>
              <p className="text-xs text-muted-foreground">Para clientes que no usan tu enlace.</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onGoTo('clientes')}
          className="w-full flex items-center justify-between rounded-lg border bg-background p-3 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Ver mis clientes</p>
              <p className="text-xs text-muted-foreground">Estado de tus referidos y su ahorro estimado.</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setShowAdvancedLinks((v) => !v)}
        >
          {showAdvancedLinks ? '− Ocultar otros enlaces' : '+ Otros enlaces de captación (avanzado)'}
        </Button>

        {showAdvancedLinks &&
          ALL_ENTRY_MODES.filter((mode) => mode !== 'auto').map((mode) => {
            const url = getLinkForMode(mode);
            return (
              <Card key={mode}>
                <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{ENTRY_MODE_LABELS[mode]}</p>
                    <p className="text-xs text-muted-foreground break-all">{url}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void copyLink(url)}>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copiar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void shareLink(url, ENTRY_MODE_LABELS[mode])}>
                      <Share2 className="h-3.5 w-3.5 mr-1" />
                      Compartir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void downloadQr(url, `qr-${collaborator.code}-${mode}`)}
                    >
                      <QrCode className="h-3.5 w-3.5 mr-1" />
                      QR
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <InstallPwaPrompt className="mt-2" />
    </div>
  );
}
