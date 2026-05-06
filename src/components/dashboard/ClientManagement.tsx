import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo, type SetStateAction } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { UserPlus, Edit, Trash2, Upload, Loader2, Eye, Bell, UserCheck, UserX, User } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatCoordinates, parseCoordinates } from '@/lib/coordinates';
import {
  clientFiscalAddressLine,
  clientFiscalAddressMapQuery,
  direccionForFormInput,
  normalizeClientData,
  normalizeDNI,
  validateDNI,
} from '@/lib/clientUtils';
import ClientDetailView from './ClientDetailView';
import ClientFilters from './ClientFilters';
import ClientPagination from './ClientPagination';
import { MapSelector } from '@/components/ui/map-selector';
import ReminderDialog from '@/components/reminders/ReminderDialog';
import ClientSupplyAddressesEditor from './ClientSupplyAddressesEditor';
import type { SupplyAddressDraft } from '@/lib/clients/supplyAddresses';
import { draftFromSupplyRow, syncClientSupplyAddresses } from '@/lib/clients/supplyAddresses';
import type { Database } from '@/integrations/supabase/types';

type ClientTableUpdate = Database['public']['Tables']['clients']['Update'];

interface Client {
  id: string;
  nombre_apellidos: string;
  direccion: string;
  localidad?: string;
  codigo_postal?: string;
  telefono1?: string;
  telefono2?: string;
  email?: string;
  dni?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  status: 'active' | 'inactive';
  note?: string;
  prospect: boolean;
  assigned_commercial_id?: string | null;
  assigned_commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

export default function ClientManagement() {
  const { userRole } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingCoordinates, setEditingCoordinates] = useState<{id: string, coordinates: string} | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  
  // Filters state
  const [filters, setFilters] = useState({
    nombre: '',
    dni: '',
    localidad: '',
    codigo_postal: '',
    telefono: '',
    cups: '',
    status: '',
    prospect: false
  });

  // Conversion dialog state
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertingClient, setConvertingClient] = useState<Client | null>(null);
  const [convertDNI, setConvertDNI] = useState('');
  const [supplyDrafts, setSupplyDrafts] = useState<SupplyAddressDraft[]>([]);
  const [supplyFormLoading, setSupplyFormLoading] = useState(false);
  const supplyDraftsRef = useRef<SupplyAddressDraft[]>([]);

  useLayoutEffect(() => {
    supplyDraftsRef.current = supplyDrafts;
  }, [supplyDrafts]);

  const applySupplyDrafts = useCallback((update: SetStateAction<SupplyAddressDraft[]>) => {
    setSupplyDrafts((prev) => {
      const next =
        typeof update === 'function'
          ? (update as (p: SupplyAddressDraft[]) => SupplyAddressDraft[])(prev)
          : update;
      supplyDraftsRef.current = next;
      return next;
    });
  }, []);

  const isAdmin = userRole?.role === 'admin';
  const totalPages = Math.ceil(totalItems / pageSize);
  const tableColCount = isAdmin ? 8 : 7;

  const [assignedCommercialId, setAssignedCommercialId] = useState<string>('__none__');
  const [commercialUsers, setCommercialUsers] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'commercial');
      if (!roles?.length) {
        setCommercialUsers([]);
        return;
      }
      const ids = roles.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', ids)
        .order('first_name');
      setCommercialUsers(
        (profs || []).map((p) => ({
          id: p.id,
          label: `${[p.first_name, p.last_name].filter(Boolean).join(' ')}`.trim() || p.email || p.id,
        })),
      );
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!dialogOpen || !isAdmin) return;
    if (editingClient?.assigned_commercial_id) {
      setAssignedCommercialId(editingClient.assigned_commercial_id);
    } else {
      setAssignedCommercialId('__none__');
    }
  }, [dialogOpen, isAdmin, editingClient?.id, editingClient?.assigned_commercial_id]);

  const commercialSelectOptions = useMemo(() => {
    const byId = new Map(commercialUsers.map((u) => [u.id, u]));
    const aid = editingClient?.assigned_commercial_id;
    const ac = editingClient?.assigned_commercial;
    if (aid && !byId.has(aid)) {
      const label =
        [ac?.first_name, ac?.last_name].filter(Boolean).join(' ').trim() ||
        ac?.email ||
        'Comercial asignado';
      byId.set(aid, { id: aid, label });
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [commercialUsers, editingClient?.assigned_commercial, editingClient?.assigned_commercial_id]);

  useEffect(() => {
    if (!dialogOpen) {
      setSupplyFormLoading(false);
      return;
    }
    if (!editingClient) {
      applySupplyDrafts([]);
      setSupplyFormLoading(false);
      return;
    }
    let cancelled = false;
    setSupplyFormLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('client_supply_addresses')
        .select('*')
        .eq('client_id', editingClient.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error(error);
        applySupplyDrafts([]);
        toast({
          title: 'Aviso',
          description: 'No se pudieron cargar los puntos de suministro para editar.',
          variant: 'destructive',
        });
      } else {
        applySupplyDrafts((data ?? []).map(draftFromSupplyRow));
      }
      setSupplyFormLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, editingClient?.id, applySupplyDrafts]);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);

      const cupsNorm = filters.cups.trim().replace(/\s+/g, '');
      let cupsClientIds: string[] | null = null;
      if (cupsNorm) {
        // Todas las filas de suministro del cliente (varios CUPS); PostgREST pagina por defecto.
        const CUPS_PAGE = 2000;
        const idSet = new Set<string>();
        let offset = 0;
        for (;;) {
          const { data: slice, error: supplyErr } = await supabase
            .from('client_supply_addresses')
            .select('client_id')
            .not('cups', 'is', null)
            .ilike('cups', `%${cupsNorm}%`)
            .range(offset, offset + CUPS_PAGE - 1);
          if (supplyErr) throw supplyErr;
          const rows = slice ?? [];
          for (const r of rows) {
            idSet.add(r.client_id);
          }
          if (rows.length < CUPS_PAGE) break;
          offset += CUPS_PAGE;
        }
        cupsClientIds = [...idSet];
        if (cupsClientIds.length === 0) {
          setClients([]);
          setTotalItems(0);
          return;
        }
      }

      const adminEmbedSelect =
        '*, assigned_commercial:profiles!clients_assigned_commercial_id_fkey(first_name, last_name, email)';

      const buildQuery = (selectStr: string) => {
        let q = supabase.from('clients').select(selectStr, { count: 'exact' });
        if (filters.nombre.trim()) {
          q = q.ilike('nombre_apellidos', `%${filters.nombre.trim()}%`);
        }
        if (filters.dni.trim()) {
          const normalizedDniFilter = normalizeDNI(filters.dni.trim());
          if (normalizedDniFilter) {
            q = q.ilike('dni', `%${normalizedDniFilter}%`);
          }
        }
        if (filters.localidad.trim()) {
          q = q.ilike('localidad', `%${filters.localidad.trim()}%`);
        }
        if (filters.codigo_postal.trim()) {
          q = q.ilike('codigo_postal', `%${filters.codigo_postal.trim()}%`);
        }
        if (filters.telefono.trim()) {
          q = q.or(
            `telefono1.ilike.%${filters.telefono.trim()}%,telefono2.ilike.%${filters.telefono.trim()}%`,
          );
        }
        if (cupsClientIds) {
          q = q.in('id', cupsClientIds);
        }
        if (filters.status.trim()) {
          q = q.eq('status', filters.status.trim());
        }
        if (filters.prospect) {
          q = q.eq('prospect', true);
        }
        const from = (currentPage - 1) * pageSize;
        const to = from + pageSize - 1;
        return q.order('created_at', { ascending: false }).range(from, to);
      };

      let selectUsed = isAdmin ? adminEmbedSelect : '*';
      let result = await buildQuery(selectUsed);

      if (result.error && isAdmin && selectUsed !== '*') {
        console.warn(
          'Lista clientes: falló la relación assigned_commercial; reintentando sin incrustar perfil.',
          result.error,
        );
        selectUsed = '*';
        result = await buildQuery('*');
      }

      if (result.error) throw result.error;
      setClients((result.data || []) as Client[]);
      setTotalItems(result.count ?? 0);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los clientes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, currentPage, pageSize, filters]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchClients();
    }, 300);
    return () => window.clearTimeout(t);
  }, [fetchClients]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    // Deja que React aplique el último onChange de los inputs antes de leer borradores (p. ej. Enter en un campo).
    await Promise.resolve();
    const supplySnapshot = supplyDraftsRef.current;

    const formData = new FormData(form);
    
    // Parse coordinates from DMS format
    const latString = formData.get('latitude') as string;
    const lonString = formData.get('longitude') as string;
    
    let latitude = null;
    let longitude = null;
    
    if (latString && lonString) {
      const coordinateString = `${latString} ${lonString}`;
      const parsed = parseCoordinates(coordinateString);
      if (parsed) {
        latitude = parsed.latitude;
        longitude = parsed.longitude;
      }
    }
    
    const rawClientData = {
      nombre_apellidos: formData.get('nombre_apellidos') as string,
      dni: formData.get('dni') as string || null,
      direccion: formData.get('direccion') as string,
      localidad: formData.get('localidad') as string,
      codigo_postal: formData.get('codigo_postal') as string,
      telefono1: formData.get('telefono1') as string || null,
      telefono2: formData.get('telefono2') as string || null,
      email: formData.get('email') as string || null,
      latitude,
      longitude,
      note: formData.get('note') as string || null,
    };

    // Validate DNI if provided
    if (rawClientData.dni && !validateDNI(rawClientData.dni)) {
      toast({
        title: "Error",
        description: "El DNI debe tener al menos 8 caracteres y contener al menos una letra",
        variant: "destructive",
      });
      return;
    }

    // Normalize client data
    console.log('Raw DNI before normalization:', rawClientData.dni);
    console.log('Raw nombre before normalization:', rawClientData.nombre_apellidos);
    
    const clientData = normalizeClientData(rawClientData);
    const payload: ClientTableUpdate = { ...clientData };
    if (isAdmin) {
      const chosen =
        assignedCommercialId && assignedCommercialId !== '__none__'
          ? assignedCommercialId
          : null;
      payload.assigned_commercial_id = chosen;
    }

    // Add prospect field if editing and DNI is empty
    if (editingClient && (!clientData.dni || clientData.dni.trim() === '')) {
      payload.prospect = true;
    }
    
    console.log('Normalized DNI:', clientData.dni);
    console.log('Normalized nombre:', clientData.nombre_apellidos);
    console.log('Full normalized client data:', clientData);

    try {
      if (editingClient) {
        console.log('=== DATOS ENVIADOS A SUPABASE PARA UPDATE ===');
        console.log('clientData:', JSON.stringify(payload, null, 2));
        console.log('DNI específico:', `"${clientData.dni}"`);
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingClient.id);

        if (error) throw error;

        const { error: syncErr } = await syncClientSupplyAddresses(
          supabase,
          editingClient.id,
          supplySnapshot,
        );
        if (syncErr) throw syncErr;

        toast({
          title: "Cliente actualizado",
          description: "El cliente ha sido actualizado exitosamente",
        });
      } else {
        const { data: created, error } = await supabase
          .from('clients')
          .insert(payload)
          .select('id')
          .single();

        if (error) throw error;

        if (created?.id) {
          const { error: syncErr } = await syncClientSupplyAddresses(
            supabase,
            created.id,
            supplySnapshot,
          );
          if (syncErr) {
            toast({
              title: "Cliente creado",
              description:
                "El cliente se guardó pero hubo un problema al guardar los puntos de suministro. Puedes añadirlos desde la ficha.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Cliente creado",
              description: "El cliente ha sido creado exitosamente",
            });
          }
        } else {
          toast({
            title: "Cliente creado",
            description: "El cliente ha sido creado exitosamente",
          });
        }
      }

      setDialogOpen(false);
      setEditingClient(null);
      fetchClients();
    } catch (error: any) {
      console.error('Error saving client:', error);
      let errorMessage = "No se pudo guardar el cliente";
      
      // Check for DNI duplicate error
      if (error?.message?.includes('duplicate key') || error?.code === '23505') {
        errorMessage = "Ya existe otro usuario con ese mismo DNI";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente? Esta acción eliminará toda la información relacionada incluyendo visitas, ventas y tareas administrativas.')) return;

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) throw error;

      toast({
        title: "Cliente eliminado",
        description: "El cliente ha sido eliminado exitosamente",
      });

      fetchClients();
    } catch (error: any) {
      console.error('Error deleting client:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el cliente",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get('file') as File;

    if (!file) {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo CSV o Excel",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const rows = results.data as string[][];
            
            if (rows.length < 2) {
              toast({
                title: "Error en el archivo",
                description: "El archivo debe contener al menos una fila de datos además del encabezado",
                variant: "destructive",
              });
              return;
            }

            // Expected order: nombre_apellidos, dni, direccion, telefono1, telefono2, email
            const clients = [];
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              
              if (row.length >= 3) { // At least name and address
                const client = {
                  nombre_apellidos: row[0]?.trim() || '',
                  dni: row[1]?.trim() || null,
                  direccion: row[2]?.trim() || '',
                  telefono1: row[3]?.trim() || null,
                  telefono2: row[4]?.trim() || null,
                  email: row[5]?.trim() || null,
                };

                // Only add if we have required fields
                if (client.nombre_apellidos && client.direccion) {
                  // Normalize client data before adding
                  const normalizedClient = normalizeClientData(client);
                  clients.push(normalizedClient);
                }
              }
            }

            if (clients.length === 0) {
              toast({
                title: "Error",
                description: "No se encontraron clientes válidos en el archivo",
                variant: "destructive",
              });
              return;
            }

            const { error } = await supabase
              .from('clients')
              .insert(clients);

            if (error) throw error;

            toast({
              title: "Clientes importados",
              description: `Se han importado ${clients.length} clientes exitosamente`,
            });

            setUploadDialogOpen(false);
            fetchClients();
          } catch (error: any) {
            console.error('Error processing file:', error);
            toast({
              title: "Error",
              description: error.message || "Error al procesar el archivo",
              variant: "destructive",
            });
          } finally {
            setUploading(false);
          }
        },
        error: (error) => {
          console.error('Error parsing file:', error);
          toast({
            title: "Error",
            description: "Error al analizar el archivo",
            variant: "destructive",
          });
          setUploading(false);
        }
      });
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: "Error",
        description: error.message || "Error al cargar el archivo",
        variant: "destructive",
      });
      setUploading(false);
    }
  };

  const handleFilterChange = (key: string, value: string | boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleClearFilters = () => {
    setFilters({
      nombre: '',
      dni: '',
      localidad: '',
      codigo_postal: '',
      telefono: '',
      cups: '',
      status: '',
      prospect: false
    });
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  const handleCoordinatesEdit = async (clientId: string, coordinates: string) => {
    try {
      const parsed = parseCoordinates(coordinates);
      if (!parsed) {
        toast({
          title: "Error",
          description: "Formato de coordenadas inválido. Use el formato: 43°16'59.7\"N 1°40'39.8\"W",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('clients')
        .update({ 
          latitude: parsed.latitude,
          longitude: parsed.longitude 
        })
        .eq('id', clientId);

      if (error) throw error;

      toast({
        title: "Coordenadas actualizadas",
        description: "Las coordenadas del cliente han sido actualizadas exitosamente",
      });

      setEditingCoordinates(null);
      fetchClients();
    } catch (error: any) {
      console.error('Error updating coordinates:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudieron actualizar las coordenadas",
        variant: "destructive",
      });
    }
  };

  const handleStatusToggle = async (clientId: string, status: 'active' | 'inactive') => {
    if (!isAdmin) return;

    const confirmMessage = status === 'active' 
      ? '¿Estás seguro de que quieres activar este cliente?' 
      : '¿Estás seguro de que quieres desactivar este cliente?';

    if (!confirm(confirmMessage)) return;

    try {
      const { error } = await supabase
        .from('clients')
        .update({ status })
        .eq('id', clientId);

      if (error) throw error;

      toast({
        title: "Status actualizado",
        description: `El cliente ha sido marcado como ${status === 'active' ? 'activo' : 'inactivo'}`,
      });

      fetchClients();
    } catch (error: any) {
      console.error('Error updating client status:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el status del cliente",
        variant: "destructive",
      });
    }
  };

  const handleConvertToClient = async () => {
    if (!convertingClient || !convertDNI.trim()) {
      toast({
        title: "Error",
        description: "Debe introducir un DNI válido",
        variant: "destructive",
      });
      return;
    }

    if (!validateDNI(convertDNI)) {
      toast({
        title: "Error",
        description: "El DNI debe tener al menos 8 caracteres y contener al menos una letra",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('clients')
        .update({ 
          prospect: false, 
          dni: normalizeDNI(convertDNI) 
        })
        .eq('id', convertingClient.id);

      if (error) {
        if (error.message?.includes('duplicate key') || error.code === '23505') {
          toast({
            title: "Error",
            description: "Ya existe otro cliente con ese mismo DNI",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Cliente convertido",
        description: "El prospecto ha sido convertido a cliente exitosamente",
      });

      setConvertDialogOpen(false);
      setConvertingClient(null);
      setConvertDNI('');
      fetchClients();
    } catch (error: any) {
      console.error('Error converting prospect to client:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo convertir el prospecto a cliente",
        variant: "destructive",
      });
    }
  };

  // Remove the loading wrapper that hides everything

  if (selectedClientId) {
    return (
      <ClientDetailView 
        clientId={selectedClientId} 
        onBack={() => setSelectedClientId(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Gestión de clientes</h2>
          <p className="text-muted-foreground">Administra los clientes de las empresas</p>
        </div>
        <div className="flex space-x-2">
          {/* Only show admin buttons for admins */}
          {isAdmin && (
            <>
              {/* Create client dialog */}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setEditingClient(null)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Nuevo cliente
                  </Button>
                </DialogTrigger>
            <DialogContent
              className="max-w-3xl max-h-[90vh] overflow-y-auto"
              onPointerDownOutside={(e) => {
                if (
                  (e.target as HTMLElement).closest?.(
                    '.client-form-commercial-select-content',
                  )
                ) {
                  e.preventDefault();
                }
              }}
              onInteractOutside={(e) => {
                if (
                  (e.target as HTMLElement).closest?.(
                    '.client-form-commercial-select-content',
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editingClient ? 'Editar cliente' : 'Crear nuevo cliente'}
                </DialogTitle>
                <DialogDescription>
                  {editingClient ? 'Modifica los datos del cliente' : 'Añade un nuevo cliente al sistema'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre_apellidos">Nombre y Apellidos *</Label>
                    <Input 
                      id="nombre_apellidos" 
                      name="nombre_apellidos" 
                      defaultValue={editingClient?.nombre_apellidos || ''}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="direccion">Dirección *</Label>
                    <Input 
                      id="direccion" 
                      name="direccion" 
                      defaultValue={editingClient ? direccionForFormInput(editingClient.direccion) : ''}
                      required 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="localidad">Localidad *</Label>
                      <Input 
                        id="localidad" 
                        name="localidad" 
                        defaultValue={editingClient?.localidad || ''}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="codigo_postal">Código Postal *</Label>
                      <Input 
                        id="codigo_postal" 
                        name="codigo_postal" 
                        defaultValue={editingClient?.codigo_postal || ''}
                        required 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label htmlFor="dni">DNI</Label>
                       <Input 
                         id="dni" 
                         name="dni" 
                         defaultValue={editingClient?.dni || ''}
                       />
                     </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input 
                        id="email" 
                        name="email" 
                        type="email"
                        defaultValue={editingClient?.email || ''}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="telefono1">Teléfono 1</Label>
                      <Input 
                        id="telefono1" 
                        name="telefono1" 
                        defaultValue={editingClient?.telefono1 || ''}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefono2">Teléfono 2</Label>
                      <Input 
                        id="telefono2" 
                        name="telefono2" 
                        defaultValue={editingClient?.telefono2 || ''}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assigned_commercial">Comercial asignado</Label>
                    <Select
                      key={`commercial-${editingClient?.id ?? 'new'}`}
                      value={assignedCommercialId}
                      onValueChange={setAssignedCommercialId}
                    >
                      <SelectTrigger id="assigned_commercial">
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent className="z-[300] client-form-commercial-select-content">
                        <SelectItem value="__none__">Sin asignar</SelectItem>
                        {commercialSelectOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="note">Nota</Label>
                    <Textarea 
                      id="note" 
                      name="note" 
                      placeholder="Add a note about this client..."
                      defaultValue={editingClient?.note || ''}
                    />
                  </div>
                  <ClientSupplyAddressesEditor
                    value={supplyDrafts}
                    onChange={applySupplyDrafts}
                    disabled={supplyFormLoading}
                  />
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="latitude">Latitud</Label>
                        <Input 
                          id="latitude" 
                          name="latitude" 
                          type="text"
                          placeholder="43°16'59.7&quot;N"
                          defaultValue={editingClient?.latitude && editingClient?.longitude ? formatCoordinates(editingClient.latitude, editingClient.longitude).split(' ')[0] : ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="longitude">Longitud</Label>
                        <Input 
                          id="longitude" 
                          name="longitude" 
                          type="text"
                          placeholder="1°40'39.8&quot;W"
                          defaultValue={editingClient?.latitude && editingClient?.longitude ? formatCoordinates(editingClient.latitude, editingClient.longitude).split(' ')[1] : ''}
                        />
                      </div>
                    </div>
                    <MapSelector
                      latitude={editingClient?.latitude}
                      longitude={editingClient?.longitude}
                      onCoordinatesSelect={(lat, lng) => {
                        const latInput = document.getElementById('latitude') as HTMLInputElement;
                        const lngInput = document.getElementById('longitude') as HTMLInputElement;
                        const coordinates = formatCoordinates(lat, lng);
                        const [latDMS, lngDMS] = coordinates.split(' ');
                        if (latInput) latInput.value = latDMS;
                        if (lngInput) lngInput.value = lngDMS;
                      }}
                    />
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!!editingClient && supplyFormLoading}>
                    {editingClient && supplyFormLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cargando suministros…
                      </>
                    ) : editingClient ? (
                      'Actualizar'
                    ) : (
                      'Crear cliente'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <ClientFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      <Card>
        <CardHeader>
          <CardTitle>Clientes registrados</CardTitle>
          <CardDescription>
            Lista de todos los clientes {!isAdmin && 'de tu empresa'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>DNI</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Coordenadas</TableHead>
                      <TableHead>Teléfono</TableHead>
                      {isAdmin && <TableHead>Comercial</TableHead>}
                      <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                  <TableRow>
                    <TableCell colSpan={tableColCount} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-muted-foreground">Cargando clientes...</span>
                      </div>
                    </TableCell>
                  </TableRow>
               ) : clients.length === 0 ? (
                 <TableRow>
                     <TableCell colSpan={tableColCount} className="text-center py-8 text-muted-foreground">
                       {Object.entries(filters).some(([key, value]) => {
                         if (typeof value === 'boolean') return value;
                         return value.trim() !== '';
                       }) ? 
                         "No se encontraron clientes con los filtros aplicados" : 
                         "No hay clientes registrados"
                       }
                     </TableCell>
                 </TableRow>
              ) : (
                 clients.map((client) => {
                   const getRowClasses = () => {
                     let classes = "";
                     if (client.prospect) {
                       classes += "bg-blue-50 hover:bg-blue-100 ";
                     } else if (client.status === 'inactive') {
                       classes += "bg-red-50 hover:bg-red-100 ";
                     }
                     return classes;
                   };

                   return (
                    <TableRow key={client.id} className={getRowClasses()}>
                       <TableCell className="font-medium">{client.nombre_apellidos}</TableCell>
                       <TableCell>{client.dni || '-'}</TableCell>
                       <TableCell>
                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                           client.prospect 
                             ? 'bg-blue-100 text-blue-800' 
                             : 'bg-green-100 text-green-800'
                         }`}>
                           {client.prospect ? 'Prospecto' : 'Cliente'}
                         </span>
                       </TableCell>
                       <TableCell>
                         {(() => {
                           const fullAddress = clientFiscalAddressLine(
                             client.direccion,
                             client.localidad,
                             client.codigo_postal,
                           );
                           const mapQuery = clientFiscalAddressMapQuery(
                             client.direccion,
                             client.localidad,
                             client.codigo_postal,
                           );
                           return (
                             <a
                               href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="text-primary hover:underline cursor-pointer"
                               onClick={(e) => e.stopPropagation()}
                             >
                               {fullAddress}
                             </a>
                           );
                         })()}
                       </TableCell>
                      <TableCell className="max-w-[150px]">
                        {client.latitude && client.longitude ? (
                          editingCoordinates?.id === client.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingCoordinates.coordinates}
                                onChange={(e) => setEditingCoordinates({ ...editingCoordinates, coordinates: e.target.value })}
                                className="text-xs p-1 border rounded w-full"
                                placeholder="43°16'59.7&quot;N 1°40'39.8&quot;W"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCoordinatesEdit(client.id, editingCoordinates.coordinates)}
                              >
                                ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingCoordinates(null)}
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <a
                              href={`https://www.google.com/maps?q=${client.latitude},${client.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {formatCoordinates(client.latitude, client.longitude)}
                            </a>
                          )
                         ) : (
                           <span className="text-xs text-muted-foreground">Sin coordenadas</span>
                         )}
                      </TableCell>
                      <TableCell>{client.telefono1 || '-'}</TableCell>
                      {isAdmin && (
                        <TableCell className="max-w-[200px] text-sm text-muted-foreground">
                          {client.assigned_commercial ? (
                            <span className="line-clamp-2">
                              {[
                                client.assigned_commercial.first_name,
                                client.assigned_commercial.last_name,
                              ]
                                .filter(Boolean)
                                .join(' ') || client.assigned_commercial.email}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/70">—</span>
                          )}
                        </TableCell>
                      )}
                       <TableCell>
                         <div className="flex space-x-2">
                           <Button 
                             variant="outline" 
                             size="sm"
                             onClick={() => setSelectedClientId(client.id)}
                           >
                             <Eye className="h-4 w-4" />
                           </Button>
                           
                           {/* Convert to client icon for prospects */}
                           {client.prospect && isAdmin && (
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => {
                                 setConvertingClient(client);
                                 setConvertDNI(client.dni || '');
                                 setConvertDialogOpen(true);
                               }}
                               className="text-blue-600 hover:text-blue-800"
                               title="Convertir a cliente"
                             >
                               <User className="h-4 w-4" />
                             </Button>
                           )}

                           {/* Status toggle icons for admins */}
                           {isAdmin && (
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => handleStatusToggle(client.id, client.status === 'active' ? 'inactive' : 'active')}
                               className={client.status === 'active' ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}
                               title={client.status === 'active' ? 'Desactivar cliente' : 'Activar cliente'}
                             >
                               {client.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                             </Button>
                           )}

                           {/* Only show edit/delete for admins */}
                           {isAdmin && (
                             <>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   setEditingClient(client);
                                   setDialogOpen(true);
                                 }}
                               >
                                 <Edit className="h-4 w-4" />
                               </Button>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   setSelectedClient({ id: client.id, name: client.nombre_apellidos });
                                   setReminderDialogOpen(true);
                                 }}
                                 title="Crear recordatorio"
                               >
                                 <Bell className="h-4 w-4" />
                               </Button>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => handleDelete(client.id)}
                               >
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             </>
                           )}
                         </div>
                       </TableCell>
                   </TableRow>
                   );
                 })
              )}
            </TableBody>
          </Table>
          
          {/* Pagination - only show if there are items */}
          {totalItems > 0 && (
            <ClientPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>

      {/* Reminder Dialog */}
      {selectedClient && (
        <ReminderDialog
          open={reminderDialogOpen}
          onOpenChange={setReminderDialogOpen}
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          onReminderCreated={fetchClients}
        />
      )}

      {/* Convert to Client Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir a Cliente</DialogTitle>
            <DialogDescription>
              Convertir "{convertingClient?.nombre_apellidos}" de prospecto a cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="convert-dni">DNI/NIF *</Label>
              <Input
                id="convert-dni"
                value={convertDNI}
                onChange={(e) => setConvertDNI(e.target.value)}
                placeholder="Introduce el DNI del cliente"
                required
              />
              <p className="text-sm text-muted-foreground">
                El DNI es obligatorio para convertir a cliente y no puede estar duplicado.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConvertDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConvertToClient}>
              Convertir a Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}