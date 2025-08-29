import { useState, useEffect, useCallback } from 'react';
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
import { UserPlus, Edit, Trash2, Upload, Loader2, Eye, Bell, ToggleLeft, ToggleRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatCoordinates, parseCoordinates } from '@/lib/coordinates';
import ClientDetailView from './ClientDetailView';
import ClientFilters from './ClientFilters';
import ClientPagination from './ClientPagination';
import { MapSelector } from '@/components/ui/map-selector';
import ReminderDialog from '@/components/reminders/ReminderDialog';

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
    email: '',
    status: ''
  });

  const isAdmin = userRole?.role === 'admin';
  const totalPages = Math.ceil(totalItems / pageSize);

  // Debounced fetch function
  const debouncedFetchClients = useCallback(
    debounce(() => {
      fetchClients();
    }, 300),
    [currentPage, pageSize, filters]
  );

  useEffect(() => {
    debouncedFetchClients();
  }, [debouncedFetchClients]);

  // Debounce utility function
  function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  const fetchClients = async () => {
    try {
      setLoading(true);
      
      // Build query with filters
      let query = supabase
        .from('clients')
        .select('*, updated_at', { count: 'exact' });

      // Apply filters
      if (filters.nombre.trim()) {
        query = query.ilike('nombre_apellidos', `%${filters.nombre.trim()}%`);
      }
      if (filters.dni.trim()) {
        query = query.ilike('dni', `%${filters.dni.trim()}%`);
      }
      if (filters.localidad.trim()) {
        query = query.ilike('localidad', `%${filters.localidad.trim()}%`);
      }
      if (filters.codigo_postal.trim()) {
        query = query.ilike('codigo_postal', `%${filters.codigo_postal.trim()}%`);
      }
      if (filters.telefono.trim()) {
        query = query.or(`telefono1.ilike.%${filters.telefono.trim()}%,telefono2.ilike.%${filters.telefono.trim()}%`);
      }
      if (filters.email.trim()) {
        query = query.ilike('email', `%${filters.email.trim()}%`);
      }
      if (filters.status.trim()) {
        query = query.eq('status', filters.status.trim());
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      query = query
        .order('created_at', { ascending: false })
        .range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      
      setClients((data || []) as Client[]);
      setTotalItems(count || 0);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
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
    
    const clientData = {
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

    try {
      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id);

        if (error) throw error;

        toast({
          title: "Cliente actualizado",
          description: "El cliente ha sido actualizado exitosamente",
        });
      } else {
        const { error } = await supabase
          .from('clients')
          .insert(clientData);

        if (error) throw error;

        toast({
          title: "Cliente creado",
          description: "El cliente ha sido creado exitosamente",
        });
      }

      setDialogOpen(false);
      setEditingClient(null);
      fetchClients();
    } catch (error: any) {
      console.error('Error saving client:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el cliente",
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
                  clients.push(client);
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

  const handleFilterChange = (key: string, value: string) => {
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
      email: '',
      status: ''
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
            <DialogContent className="max-w-2xl">
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
                      defaultValue={editingClient?.direccion || ''}
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
                    <Label htmlFor="note">Nota</Label>
                    <Textarea 
                      id="note" 
                      name="note" 
                      placeholder="Add a note about this client..."
                      defaultValue={editingClient?.note || ''}
                    />
                  </div>
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
                  <Button type="submit">
                    {editingClient ? 'Actualizar' : 'Crear cliente'}
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
                      <TableHead>Activo</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Coordenadas</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                 <TableRow>
                   <TableCell colSpan={8} className="text-center py-8">
                     <div className="flex items-center justify-center">
                       <Loader2 className="h-4 w-4 animate-spin mr-2" />
                       <span className="text-muted-foreground">Cargando clientes...</span>
                     </div>
                   </TableCell>
                 </TableRow>
               ) : clients.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                     {Object.values(filters).some(f => f.trim()) ? 
                       "No se encontraron clientes con los filtros aplicados" : 
                       "No hay clientes registrados"
                     }
                   </TableCell>
                 </TableRow>
              ) : (
                 clients.map((client) => (
                   <TableRow key={client.id} className={client.status === 'inactive' ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">{client.nombre_apellidos}</TableCell>
                      <TableCell>{client.dni || '-'}</TableCell>
                       <TableCell>
                         <Switch
                           checked={client.status === 'active'}
                           onCheckedChange={(checked) => handleStatusToggle(client.id, checked ? 'active' : 'inactive')}
                           disabled={!isAdmin}
                         />
                       </TableCell>
                      <TableCell>
                        {(() => {
                          // Construir dirección completa
                          const parts = [client.direccion];
                          if (client.localidad) parts.push(client.localidad);
                          if (client.codigo_postal) parts.push(client.codigo_postal);
                          const fullAddress = parts.join(', ');
                          
                          // Si tiene coordenadas, hacer enlace con coordenadas
                          if (client.latitude && client.longitude) {
                            return (
                              <a
                                href={`https://www.google.com/maps?q=${client.latitude},${client.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {fullAddress}
                              </a>
                            );
                          } else {
                            // Sin coordenadas, enlace con dirección de texto
                            return (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {fullAddress}
                              </a>
                            );
                          }
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
                     <TableCell>{client.email || '-'}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedClientId(client.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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
                                title="Crear recordatorio de renovación"
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
                ))
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
    </div>
  );
}