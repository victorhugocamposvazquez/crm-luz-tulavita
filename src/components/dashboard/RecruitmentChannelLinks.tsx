/**
 * Generador de material de captación de colaboradores por canal.
 * Construye URLs de /hazte-colaborador con UTM coherentes por canal y permite
 * copiar el enlace o descargar su QR, para medir de dónde llegan los colaboradores.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Copy, QrCode, Megaphone } from 'lucide-react';
import {
  RECRUITMENT_CHANNELS,
  buildRecruitmentChannelUrl,
  getAppBaseUrl,
} from '@/lib/collaborators/links';
import { downloadQrPng, generateQrDataUrl } from '@/lib/collaborators/qr';

export function RecruitmentChannelLinks() {
  const [busy, setBusy] = useState<string | null>(null);
  const baseUrl = getAppBaseUrl();

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Enlace copiado' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const downloadQr = async (channelId: string, url: string) => {
    setBusy(channelId);
    try {
      const dataUrl = await generateQrDataUrl(url);
      downloadQrPng(dataUrl, `qr-reclutamiento-${channelId}.png`);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Material de captación por canal
        </CardTitle>
        <CardDescription>
          Enlaces y QR a la landing «Hazte colaborador» con seguimiento UTM por canal. Úsalos en ads,
          redes y carteles para saber de dónde llega cada colaborador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {RECRUITMENT_CHANNELS.map((channel) => {
          const url = buildRecruitmentChannelUrl(baseUrl, channel);
          return (
            <div
              key={channel.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{channel.label}</p>
                <p className="break-all text-xs text-muted-foreground">{url}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copy(url)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy === channel.id}
                  onClick={() => void downloadQr(channel.id, url)}
                >
                  <QrCode className="mr-1.5 h-3.5 w-3.5" />
                  QR
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
