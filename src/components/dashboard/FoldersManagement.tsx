import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const BUCKET = 'crm-folders';
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const PREVIEW_TRANSFORM = { width: 1200, height: 900, quality: 85, resize: 'contain' as const };
const MAX_BYTES = 25 * 1024 * 1024;

type FolderRow = Database['public']['Tables']['crm_folders']['Row'];
type FolderFileRow = Database['public']['Tables']['crm_folder_files']['Row'];

type ClientOption = { id: string; nombre_apellidos: string };

type FolderWithMeta = FolderRow & {
  file_count: number;
  client_name: string | null;
};

function isFileImage(file: FolderFileRow): boolean {
  if (file.mime_type === 'application/pdf') return false;
  if (file.mime_type?.startsWith('image/')) return true;
  const name = file.file_name || file.storage_path;
  if (/\.pdf$/i.test(name)) return false;
  return IMAGE_EXT.test(name);
}

function isFilePdf(file: FolderFileRow): boolean {
  if (file.mime_type === 'application/pdf') return true;
  const name = file.file_name || file.storage_path;
  return /\.pdf$/i.test(name);
}

async function getFolderFileSignedUrl(
  path: string,
  opts?: { download?: string; withImageTransform?: boolean },
): Promise<string | null> {
  const signOpts: { download?: string; transform?: typeof PREVIEW_TRANSFORM } = {};
  if (opts?.download) signOpts.download = opts.download;
  if (opts?.withImageTransform) signOpts.transform = PREVIEW_TRANSFORM;

  let result = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, signOpts);
  if (result.error && opts?.withImageTransform) {
    result = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, opts?.download ? { download: opts.download } : undefined);
  }
  if (result.error) {
    console.error(result.error);
    return null;
  }
  return result.data?.signedUrl ?? null;
}

function fileExtension(file: File): string {
  const fromName = file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName === 'jpeg') return 'jpg';
  if (fromName) return fromName;
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  return 'bin';
}

function FilePreviewModal({
  file,
  open,
  onOpenChange,
}: {
  file: FolderFileRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = file?.file_name || file?.storage_path.split('/').pop() || 'Archivo';
  const isImage = file ? isFileImage(file) : false;
  const isPdf = file ? isFilePdf(file) : false;

  useEffect(() => {
    if (!open || !file) {
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
      const url = await getFolderFileSignedUrl(file.storage_path, { withImageTransform: isImage });
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
  }, [open, file?.id, file?.storage_path, isImage]);

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
            <img src={signedUrl} alt={title} className="max-h-[min(75vh,800px)] w-full object-contain" />
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

function FolderDetail({ folder, onBack, onChanged }: { folder: FolderRow; onBack: () => void; onChanged: () => void }) {
  const [files, setFiles] = useState<FolderFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FolderFileRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FolderFileRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_folder_files')
        .select('*')
        .eq('folder_id', folder.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setFiles(data ?? []);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los archivos de la carpeta',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [folder.id]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const handleFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast({ title: 'Archivo no válido', description: 'El archivo supera 25 MB.', variant: 'destructive' });
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;

    const ext = fileExtension(file);
    const objectPath = `${folder.id}/${crypto.randomUUID()}.${ext}`;

    setUploading(true);
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('crm_folder_files').insert({
        folder_id: folder.id,
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

      toast({ title: 'Archivo subido' });
      await fetchFiles();
      onChanged();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error al subir',
        description: e instanceof Error ? e.message : 'Inténtalo de nuevo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (file: FolderFileRow) => {
    const name = file.file_name || file.storage_path.split('/').pop() || 'archivo';
    const url = await getFolderFileSignedUrl(file.storage_path, { download: name });
    if (!url) {
      toast({ title: 'Error', description: 'No se pudo generar la descarga', variant: 'destructive' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    setDeleteTarget(null);
    try {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
      if (rmErr) console.warn('storage remove:', rmErr);
      const { error: delErr } = await supabase.from('crm_folder_files').delete().eq('id', row.id);
      if (delErr) throw delErr;
      toast({ title: 'Archivo eliminado' });
      await fetchFiles();
      onChanged();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error al eliminar',
        description: e instanceof Error ? e.message : 'Inténtalo de nuevo',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" size="icon" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold flex items-center gap-2 truncate">
                <Folder className="h-6 w-6 shrink-0" />
                {folder.name}
              </h2>
              <p className="text-muted-foreground text-sm">{files.length} archivo(s)</p>
            </div>
          </div>
          <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Subir archivo
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void handleFile(f);
            }}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
                Cargando archivos…
              </div>
            ) : files.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Esta carpeta está vacía. Sube tu primer archivo.
              </p>
            ) : (
              <ul className="space-y-2">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{file.file_name || file.storage_path.split('/').pop()}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(file.created_at), 'd MMM yyyy, HH:mm', { locale: es })}
                          {file.size_bytes != null && file.size_bytes > 0
                            ? ` · ${(file.size_bytes / 1024).toFixed(file.size_bytes >= 102400 ? 0 : 1)} KB`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewFile(file)}>
                        Ver
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => void downloadFile(file)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(file)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <FilePreviewModal
        file={previewFile}
        open={previewFile !== null}
        onOpenChange={(o) => {
          if (!o) setPreviewFile(null);
        }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este archivo?</AlertDialogTitle>
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

export default function FoldersManagement() {
  const [folders, setFolders] = useState<FolderWithMeta[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<FolderRow | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderRow | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderClientId, setFolderClientId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderWithMeta | null>(null);

  const fetchFolders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: folderRows, error } = await supabase
        .from('crm_folders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = folderRows ?? [];
      const folderIds = rows.map((r) => r.id);
      const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter((x): x is string => !!x)));

      const countByFolder = new Map<string, number>();
      if (folderIds.length > 0) {
        const { data: fileRows } = await supabase
          .from('crm_folder_files')
          .select('folder_id')
          .in('folder_id', folderIds);
        for (const f of fileRows ?? []) {
          countByFolder.set(f.folder_id, (countByFolder.get(f.folder_id) ?? 0) + 1);
        }
      }

      const nameByClient = new Map<string, string>();
      if (clientIds.length > 0) {
        const { data: clientRows } = await supabase
          .from('clients')
          .select('id, nombre_apellidos')
          .in('id', clientIds);
        for (const c of clientRows ?? []) {
          nameByClient.set(c.id, c.nombre_apellidos);
        }
      }

      setFolders(
        rows.map((r) => ({
          ...r,
          file_count: countByFolder.get(r.id) ?? 0,
          client_name: r.client_id ? nameByClient.get(r.client_id) ?? null : null,
        })),
      );
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las carpetas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, nombre_apellidos')
      .order('nombre_apellidos', { ascending: true })
      .limit(1000);
    setClients((data as ClientOption[]) ?? []);
  }, []);

  useEffect(() => {
    void fetchFolders();
    void fetchClients();
  }, [fetchFolders, fetchClients]);

  const openCreate = () => {
    setEditingFolder(null);
    setFolderName('');
    setFolderClientId('');
    setDialogOpen(true);
  };

  const openEdit = (folder: FolderWithMeta) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderClientId(folder.client_id ?? '');
    setDialogOpen(true);
  };

  const saveFolder = async () => {
    const name = folderName.trim();
    if (!name) {
      toast({ title: 'Indica un nombre para la carpeta', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const clientId = folderClientId || null;
      if (editingFolder) {
        const { error } = await supabase
          .from('crm_folders')
          .update({ name, client_id: clientId })
          .eq('id', editingFolder.id);
        if (error) throw error;
        toast({ title: 'Carpeta actualizada' });
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const { error } = await supabase.from('crm_folders').insert({
          name,
          client_id: clientId,
          created_by: session?.user?.id ?? null,
        });
        if (error) throw error;
        toast({ title: 'Carpeta creada' });
      }
      setDialogOpen(false);
      await fetchFolders();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo guardar la carpeta',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    const folder = deleteFolderTarget;
    setDeleteFolderTarget(null);
    try {
      const { data: fileRows } = await supabase
        .from('crm_folder_files')
        .select('storage_path')
        .eq('folder_id', folder.id);
      const paths = (fileRows ?? []).map((f) => f.storage_path);
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
        if (rmErr) console.warn('storage remove:', rmErr);
      }
      const { error } = await supabase.from('crm_folders').delete().eq('id', folder.id);
      if (error) throw error;
      toast({ title: 'Carpeta eliminada' });
      await fetchFolders();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error al eliminar',
        description: e instanceof Error ? e.message : 'Inténtalo de nuevo',
        variant: 'destructive',
      });
    }
  };

  const refreshedSelectedFolder = useMemo(
    () => (selectedFolder ? folders.find((f) => f.id === selectedFolder.id) ?? selectedFolder : null),
    [selectedFolder, folders],
  );

  if (refreshedSelectedFolder) {
    return (
      <FolderDetail
        folder={refreshedSelectedFolder}
        onBack={() => setSelectedFolder(null)}
        onChanged={() => void fetchFolders()}
      />
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Carpetas</h2>
            <p className="text-muted-foreground">Organiza y comparte archivos en carpetas.</p>
          </div>
          <Button onClick={openCreate}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Nueva carpeta
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando carpetas…
          </div>
        ) : folders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Aún no hay carpetas. Crea la primera para empezar a organizar archivos.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <Card key={folder.id} className="transition-colors hover:border-primary/40">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left min-w-0"
                      onClick={() => setSelectedFolder(folder)}
                    >
                      <Folder className="h-5 w-5 shrink-0 text-primary" />
                      <CardTitle className="text-base truncate">{folder.name}</CardTitle>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(folder)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteFolderTarget(folder)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-2 text-left"
                    onClick={() => setSelectedFolder(folder)}
                  >
                    <span className="text-sm text-muted-foreground">{folder.file_count} archivo(s)</span>
                    {folder.client_name ? (
                      <Badge variant="secondary" className="gap-1">
                        <User className="h-3 w-3" />
                        {folder.client_name}
                      </Badge>
                    ) : null}
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFolder ? 'Editar carpeta' : 'Nueva carpeta'}</DialogTitle>
            <DialogDescription>
              Asigna un nombre y, opcionalmente, vincúlala a un cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Nombre</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Ej. Contratos 2026"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-client">Cliente (opcional)</Label>
              <select
                id="folder-client"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={folderClientId}
                onChange={(e) => setFolderClientId(e.target.value)}
              >
                <option value="">Sin cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre_apellidos}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveFolder()} disabled={saving || !folderName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingFolder ? 'Guardar' : 'Crear carpeta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteFolderTarget !== null} onOpenChange={(o) => !o && setDeleteFolderTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta carpeta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la carpeta «{deleteFolderTarget?.name}» y todos sus archivos
              {deleteFolderTarget && deleteFolderTarget.file_count > 0
                ? ` (${deleteFolderTarget.file_count})`
                : ''}
              . Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteFolder()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
