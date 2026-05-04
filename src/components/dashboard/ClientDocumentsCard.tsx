import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, FileText, IdCard, Loader2, Receipt, Trash2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const BUCKET = 'client-documents';
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const PREVIEW_TRANSFORM = { width: 1200, height: 900, quality: 85, resize: 'contain' as const };

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

type ClientDocRow = Database['public']['Tables']['client_documents']['Row'];
type DocKind = 'dni' | 'invoice';

function isDocumentImage(doc: ClientDocRow): boolean {
  if (doc.mime_type === 'application/pdf') return false;
  if (doc.mime_type?.startsWith('image/')) return true;
  const name = doc.file_name || doc.storage_path;
  if (/\.pdf$/i.test(name)) return false;
  return IMAGE_EXT.test(name);
}

function isDocumentPdf(doc: ClientDocRow): boolean {
  if (doc.mime_type === 'application/pdf') return true;
  const name = doc.file_name || doc.storage_path;
  return /\.pdf$/i.test(name);
}

async function getClientDocumentSignedUrl(path: string, withImageTransform: boolean): Promise<string | null> {
  const opts = withImageTransform ? { transform: PREVIEW_TRANSFORM } : undefined;
  let result = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, opts);
  if (result.error && withImageTransform) {
    result = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  }
  if (result.error) {
    console.error(result.error);
    return null;
  }
  return result.data?.signedUrl ?? null;
}

function ClientDocumentPreviewModal({
  doc,
  open,
  onOpenChange,
}: {
  doc: ClientDocRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = doc?.file_name || doc?.storage_path.split('/').pop() || 'Documento';
  const isImage = doc ? isDocumentImage(doc) : false;
  const isPdf = doc ? isDocumentPdf(doc) : false;

  useEffect(() => {
    if (!open || !doc) {
      setSignedUrl(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSignedUrl(null);

    void (async () => {
      const url = await getClientDocumentSignedUrl(doc.storage_path, isImage);
      if (cancelled) return;
      if (!url) {
        setLoadError('No se pudo generar el enlace de vista previa.');
        setLoading(false);
        return;
      }
      setSignedUrl(url);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, doc?.id, doc?.storage_path, isImage]);

  const openInNewTab = () => {
    if (signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] flex flex-col gap-3 p-4">
        <DialogHeader className="space-y-1 shrink-0 text-left">
          <DialogTitle className="text-base leading-snug pr-8">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col items-center justify-center rounded-md border bg-muted/30 overflow-hidden">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-16">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando vista previa…
            </div>
          )}
          {!loading && loadError && <p className="text-sm text-destructive px-4 py-8 text-center">{loadError}</p>}
          {!loading && !loadError && signedUrl && isImage && (
            <img
              src={signedUrl}
              alt={title}
              className="max-h-[min(75vh,800px)] w-full object-contain"
            />
          )}
          {!loading && !loadError && signedUrl && isPdf && (
            <iframe title={title} src={signedUrl} className="w-full min-h-[70vh] h-[70vh] border-0 bg-background" />
          )}
          {!loading && !loadError && signedUrl && !isImage && !isPdf && (
            <div className="text-center py-10 px-4 space-y-3">
              <p className="text-sm text-muted-foreground">Vista previa no disponible para este formato.</p>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={openInNewTab}>
                <ExternalLink className="h-4 w-4" />
                Abrir archivo
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex flex-row flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button type="button" variant="secondary" className="gap-2" disabled={!signedUrl} onClick={openInNewTab}>
            <ExternalLink className="h-4 w-4" />
            Nueva pestaña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fileExtension(file: File): string {
  const fromName = file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName === 'jpeg' || fromName === 'jpg') return 'jpg';
  if (fromName && ['pdf', 'png', 'webp', 'gif'].includes(fromName)) return fromName;
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'pdf';
}

function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return 'El archivo supera 10 MB.';
  if (file.type && ALLOWED_MIME.has(file.type)) return null;
  const ext = fileExtension(file);
  if (ext === 'pdf' || ext === 'jpg' || ext === 'png' || ext === 'webp' || ext === 'gif') return null;
  return 'Formato no permitido. Usa PDF o imagen (JPEG, PNG, WebP).';
}

interface ClientDocumentsCardProps {
  clientId: string;
}

export default function ClientDocumentsCard({ clientId }: ClientDocumentsCardProps) {
  const [docs, setDocs] = useState<ClientDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadKind, setUploadKind] = useState<DocKind | null>(null);
  const dniInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientDocRow | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ClientDocRow | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocs(data ?? []);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los documentos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  const handleFile = async (file: File, kind: DocKind) => {
    const err = validateFile(file);
    if (err) {
      toast({ title: 'Archivo no válido', description: err, variant: 'destructive' });
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;

    const ext = fileExtension(file);
    const objectPath = `${clientId}/${kind}/${crypto.randomUUID()}.${ext}`;

    setUploadKind(kind);
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('client_documents').insert({
        client_id: clientId,
        doc_type: kind,
        storage_path: objectPath,
        file_name: file.name.slice(0, 240),
        mime_type: file.type || null,
        size_bytes: file.size,
        created_by: uid,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([objectPath]);
        throw insErr;
      }

      toast({ title: 'Documento guardado' });
      await fetchDocs();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error al subir',
        description: e instanceof Error ? e.message : 'Inténtalo de nuevo',
        variant: 'destructive',
      });
    } finally {
      setUploadKind(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    setDeleteTarget(null);

    try {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
      if (rmErr) console.warn('storage remove:', rmErr);

      const { error: delErr } = await supabase.from('client_documents').delete().eq('id', row.id);
      if (delErr) throw delErr;

      toast({ title: 'Documento eliminado' });
      await fetchDocs();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error al eliminar',
        description: e instanceof Error ? e.message : 'Inténtalo de nuevo',
        variant: 'destructive',
      });
    }
  };

  const dniDocs = docs.filter((d) => d.doc_type === 'dni');
  const invoiceDocs = docs.filter((d) => d.doc_type === 'invoice');

  const renderList = (items: ClientDocRow[]) => {
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground py-2">Sin archivos.</p>;
    }
    return (
      <ul className="space-y-2">
        {items.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium truncate">{doc.file_name || doc.storage_path.split('/').pop()}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(doc.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                  {doc.size_bytes != null && doc.size_bytes > 0
                    ? ` · ${(doc.size_bytes / 1024).toFixed(doc.size_bytes >= 102400 ? 0 : 1)} KB`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewDoc(doc)}>
                Ver
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(doc)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl">
            <FileText className="h-6 w-6" />
            Documentación del cliente
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            DNI y facturas (PDF o imagen). Los archivos se guardan en almacenamiento seguro; aquí solo hay referencias ligeras.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando documentación…
            </div>
          ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <IdCard className="h-4 w-4" />
                  DNI / identificación
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || uploadKind !== null}
                  onClick={() => dniInputRef.current?.click()}
                >
                  {uploadKind === 'dni' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Subir
                </Button>
              </div>
              <input
                ref={dniInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleFile(f, 'dni');
                }}
              />
              {renderList(dniDocs)}
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Receipt className="h-4 w-4" />
                  Facturas
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || uploadKind !== null}
                  onClick={() => invoiceInputRef.current?.click()}
                >
                  {uploadKind === 'invoice' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Subir
                </Button>
              </div>
              <input
                ref={invoiceInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleFile(f, 'invoice');
                }}
              />
              {renderList(invoiceDocs)}
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      <ClientDocumentPreviewModal
        doc={previewDoc}
        open={previewDoc !== null}
        onOpenChange={(o) => {
          if (!o) setPreviewDoc(null);
        }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará el archivo y su referencia. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
