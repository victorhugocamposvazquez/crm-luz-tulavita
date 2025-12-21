import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Truck, Trash2, UserPlus, Filter, X, Eye, UserCog, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import DeliveryDetailDialog from './DeliveryDetailDialog';

interface Delivery {
  id: string;
  visit_id: string;
  delivery_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  visit?: {
    id: string;
    visit_date: string;
    status: string;
    notes?: string;
    commercial_id?: string;
    client?: {
      id: string;
      nombre_apellidos: string;
      direccion: string;
      dni?: string;
    };
    commercial?: {
      first_name: string;
      last_name: string;
      email: string;
    };
  };
  deliveryUser?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  creator?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface Visit {
  id: string;
  visit_date: string;
  status: string;
  notes?: string;
  client_id: string;
  commercial_id: string;
  client?: {
    id: string;
    nombre_apellidos: string;
    direccion: string;
    dni?: string;
  };
  commercial?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function DeliveriesManagement() {
  const { user, userRole } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [availableVisits, setAvailableVisits] = useState<Visit[]>([]);
  const [deliveryUsers, setDeliveryUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    client: '',
    dni: '',
    commercial: 'all',
    startDate: '',
    status: 'all',
  });
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedVisits, setSelectedVisits] = useState<string[]>([]);
  const [selectedDeliveryUser, setSelectedDeliveryUser] = useState<string>('');
  const [selectedDeliveries, setSelectedDeliveries] = useState<string[]>([]);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedDeliveryForDetail, setSelectedDeliveryForDetail] = useState<Delivery | null>(null);
  const [changeDeliveryUserDialogOpen, setChangeDeliveryUserDialogOpen] = useState(false);
  const [newDeliveryUserId, setNewDeliveryUserId] = useState<string>('');
  const [visitSearchTerm, setVisitSearchTerm] = useState('');

  const isAdmin = userRole?.role === 'admin';

  const fetchDeliveries = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const visitIds = [...new Set((data || []).map(d => d.visit_id))];
      const deliveryUserIds = [...new Set((data || []).map(d => d.delivery_id))];
      const creatorIds = [...new Set((data || []).map(d => d.created_by).filter(Boolean))];

      const visitsMap = new Map();
      const deliveryUsersMap = new Map();
      const creatorsMap = new Map();

      if (visitIds.length > 0) {
        const { data: visitsData } = await supabase
          .from('visits')
          .select(`
            id, visit_date, status, notes, client_id, commercial_id,
            client:clients(id, nombre_apellidos, direccion, dni)
          `)
          .in('id', visitIds);

        const commercialIds = [...new Set((visitsData || []).map(v => v.commercial_id))];
        const commercialsMap = new Map();

        if (commercialIds.length > 0) {
          const { data: commercialsData } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', commercialIds);

          (commercialsData || []).forEach(c => commercialsMap.set(c.id, c));
        }

        (visitsData || []).forEach(v => {
          visitsMap.set(v.id, {
            ...v,
            commercial: commercialsMap.get(v.commercial_id)
          });
        });
      }

      if (deliveryUserIds.length > 0) {
        const { data: deliveryUsersData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', deliveryUserIds);

        (deliveryUsersData || []).forEach(r => deliveryUsersMap.set(r.id, r));
      }

      if (creatorIds.length > 0) {
        const { data: creatorsData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', creatorIds as string[]);

        (creatorsData || []).forEach(c => creatorsMap.set(c.id, c));
      }

      const transformedDeliveries: Delivery[] = (data || []).map((item) => ({
        ...item,
        status: item.status as 'pending' | 'in_progress' | 'completed' | 'cancelled',
        visit: visitsMap.get(item.visit_id),
        deliveryUser: deliveryUsersMap.get(item.delivery_id),
        creator: creatorsMap.get(item.created_by)
      }));

      let filtered = transformedDeliveries;

      if (filters.client.trim()) {
        filtered = filtered.filter(d => 
          d.visit?.client?.nombre_apellidos?.toLowerCase().includes(filters.client.toLowerCase())
        );
      }
      if (filters.dni.trim()) {
        filtered = filtered.filter(d => 
          d.visit?.client?.dni?.toLowerCase().includes(filters.dni.toLowerCase())
        );
      }
      if (filters.commercial !== 'all') {
        filtered = filtered.filter(d => d.visit?.commercial_id === filters.commercial);
      }
      if (filters.startDate) {
        filtered = filtered.filter(d => {
          if (!d.visit?.visit_date) return false;
          const visitDate = new Date(d.visit.visit_date).toISOString().split('T')[0];
          return visitDate >= filters.startDate;
        });
      }
      if (filters.status !== 'all') {
        filtered = filtered.filter(d => d.status === filters.status);
      }

      setDeliveries(filtered);
    } catch (error: any) {
      console.error('Error fetching deliveries:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los repartos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchAvailableVisits = async () => {
    try {
      let query = supabase
        .from('visits')
        .select(`
          id, visit_date, status, notes, client_id, commercial_id,
          client:clients(id, nombre_apellidos, direccion, dni)
        `)
        .order('visit_date', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      const filteredVisits = data || [];

      const commercialIds = [...new Set(filteredVisits.map(v => v.commercial_id))];
      const commercialsMap = new Map();

      if (commercialIds.length > 0) {
        const { data: commercialsData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', commercialIds);

        (commercialsData || []).forEach(c => commercialsMap.set(c.id, c));
      }

      const visitsWithCommercials = filteredVisits.map(v => ({
        ...v,
        commercial: commercialsMap.get(v.commercial_id)
      }));

      setAvailableVisits(visitsWithCommercials as Visit[]);
    } catch (error) {
      console.error('Error fetching available visits:', error);
    }
  };

  const fetchDeliveryUsers = async () => {
    try {
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'delivery');

      if (roleError) throw roleError;

      if (!userRoles || userRoles.length === 0) {
        setDeliveryUsers([]);
        return;
      }

      const userIds = userRoles.map(role => role.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds);

      if (profileError) throw profileError;

      const deliveryUsersList = (profiles || []).map(profile => ({
        id: profile.id,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
        email: profile.email
      }));

      setDeliveryUsers(deliveryUsersList);
    } catch (error) {
      console.error('Error fetching deliveryUsers:', error);
    }
  };

  useEffect(() => {
    fetchDeliveries();
    fetchDeliveryUsers();

    const channel = supabase
      .channel('admin-deliveries-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries'
        },
        () => {
          fetchDeliveries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDeliveries]);

  const clearFilters = useCallback(() => {
    setFilters({
      client: '',
      dni: '',
      commercial: 'all',
      startDate: '',
      status: 'all',
    });
  }, []);

  const updateFilter = useCallback((key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleOpenAssignDialog = () => {
    fetchAvailableVisits();
    setSelectedVisits([]);
    setSelectedDeliveryUser('');
    setVisitSearchTerm('');
    setAssignDialogOpen(true);
  };

  const filteredAvailableVisits = availableVisits.filter(visit => {
    if (!visitSearchTerm.trim()) return true;
    const searchLower = visitSearchTerm.toLowerCase();
    const clientName = visit.client?.nombre_apellidos?.toLowerCase() || '';
    const clientDni = visit.client?.dni?.toLowerCase() || '';
    const commercialName = visit.commercial ? 
      `${visit.commercial.first_name || ''} ${visit.commercial.last_name || ''}`.toLowerCase() : '';
    return clientName.includes(searchLower) || clientDni.includes(searchLower) || commercialName.includes(searchLower);
  });

  const handleVisitSelection = (visitId: string, checked: boolean) => {
    setSelectedVisits(prev => 
      checked ? [...prev, visitId] : prev.filter(id => id !== visitId)
    );
  };

  const handleCreateDeliveries = async () => {
    if (selectedVisits.length === 0 || !selectedDeliveryUser || !user) return;

    try {
      const deliveriesToCreate = selectedVisits.map(visitId => ({
        visit_id: visitId,
        delivery_id: selectedDeliveryUser,
        status: 'pending',
        created_by: user.id
      }));

      const { error } = await supabase
        .from('deliveries')
        .insert(deliveriesToCreate);

      if (error) throw error;

      toast({
        title: "Repartos asignados",
        description: `Se han asignado ${selectedVisits.length} reparto(s) al repartidor`,
      });

      setAssignDialogOpen(false);
      setSelectedVisits([]);
      setSelectedDeliveryUser('');
      fetchDeliveries();
    } catch (error: any) {
      console.error('Error creating deliveries:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudieron crear los repartos",
        variant: "destructive",
      });
    }
  };

  const handleDeliverySelection = (deliveryId: string, checked: boolean) => {
    setSelectedDeliveries(prev => 
      checked ? [...prev, deliveryId] : prev.filter(id => id !== deliveryId)
    );
  };

  const handleSelectAllDeliveries = (checked: boolean) => {
    setSelectedDeliveries(checked ? deliveries.map(d => d.id) : []);
  };

  const handleDeleteDeliveries = async () => {
    if (selectedDeliveries.length === 0) return;
    
    if (!confirm(`¿Estás seguro de que quieres eliminar ${selectedDeliveries.length} reparto(s)?`)) return;

    try {
      const { error } = await supabase
        .from('deliveries')
        .delete()
        .in('id', selectedDeliveries);

      if (error) throw error;

      toast({
        title: "Repartos eliminados",
        description: `Se han eliminado ${selectedDeliveries.length} reparto(s)`,
      });

      setSelectedDeliveries([]);
      fetchDeliveries();
    } catch (error: any) {
      console.error('Error deleting deliveries:', error);
      toast({
        title: "Error",
        description: "No se pudieron eliminar los repartos",
        variant: "destructive",
      });
    }
  };

  const handleChangeDeliveryUser = async () => {
    if (selectedDeliveries.length === 0 || !newDeliveryUserId) return;

    try {
      const { error } = await supabase
        .from('deliveries')
        .update({ delivery_id: newDeliveryUserId })
        .in('id', selectedDeliveries);

      if (error) throw error;

      toast({
        title: "Repartidor actualizado",
        description: `Se ha cambiado el repartidor de ${selectedDeliveries.length} reparto(s)`,
      });

      setChangeDeliveryUserDialogOpen(false);
      setNewDeliveryUserId('');
      setSelectedDeliveries([]);
      fetchDeliveries();
    } catch (error: any) {
      console.error('Error changing delivery user:', error);
      toast({
        title: "Error",
        description: "No se pudo cambiar el repartidor",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSingle = async (deliveryId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este reparto?')) return;

    try {
      const { error } = await supabase
        .from('deliveries')
        .delete()
        .eq('id', deliveryId);

      if (error) throw error;

      toast({
        title: "Reparto eliminado",
        description: "El reparto ha sido eliminado correctamente",
      });

      fetchDeliveries();
    } catch (error: any) {
      console.error('Error deleting delivery:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el reparto",
        variant: "destructive",
      });
    }
  };

  const handleViewDetail = (delivery: Delivery) => {
    setSelectedDeliveryForDetail(delivery);
    setDetailDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completado';
      case 'cancelled':
        return 'Cancelado';
      case 'in_progress':
        return 'En Progreso';
      default:
        return 'Pendiente';
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No tienes permisos para acceder a esta sección</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Repartos</h2>
          <p className="text-muted-foreground">Asigna visitas existentes a los repartidores</p>
        </div>
        <Button onClick={handleOpenAssignDialog} className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Asignar Reparto
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 w-8 p-0" title="Limpiar filtros">
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium">Cliente</label>
              <Input
                placeholder="Nombre del cliente..."
                value={filters.client}
                onChange={(e) => updateFilter('client', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">DNI</label>
              <Input
                placeholder="DNI del cliente..."
                value={filters.dni}
                onChange={(e) => updateFilter('dni', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Comercial</label>
              <Select value={filters.commercial} onValueChange={(value) => updateFilter('commercial', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los comerciales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los comerciales</SelectItem>
                  {Array.from(new Set(deliveries.map(d => d.visit?.commercial_id).filter(Boolean))).map((id) => {
                    const delivery = deliveries.find(d => d.visit?.commercial_id === id);
                    const commercial = delivery?.visit?.commercial;
                    return (
                      <SelectItem key={id} value={id as string}>
                        {commercial ? `${commercial.first_name || ''} ${commercial.last_name || ''}`.trim() || commercial.email : id}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Fecha Visita</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter('startDate', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Estado</label>
              <Select value={filters.status} onValueChange={(value) => updateFilter('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Repartos ({deliveries.length})</span>
            {selectedDeliveries.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangeDeliveryUserDialogOpen(true)}
                  className="flex items-center gap-2"
                >
                  <UserCog className="h-4 w-4" />
                  Cambiar Repartidor ({selectedDeliveries.length})
                </Button>
                {selectedDeliveries.length > 1 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteDeliveries}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar ({selectedDeliveries.length})
                  </Button>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Cargando repartos...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedDeliveries.length === deliveries.length && deliveries.length > 0}
                        onCheckedChange={handleSelectAllDeliveries}
                      />
                    </TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Comercial Original</TableHead>
                    <TableHead>Repartidor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creación</TableHead>
                    <TableHead>Actualización</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedDeliveries.includes(delivery.id)}
                          onCheckedChange={(checked) => handleDeliverySelection(delivery.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {delivery.visit?.client?.nombre_apellidos || 'Cliente eliminado'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {delivery.visit?.client?.direccion || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {delivery.visit?.commercial ? 
                          `${delivery.visit.commercial.first_name || ''} ${delivery.visit.commercial.last_name || ''}`.trim() || delivery.visit.commercial.email : 
                          'N/A'
                        }
                      </TableCell>
                      <TableCell>
                        {delivery.deliveryUser ? 
                          `${delivery.deliveryUser.first_name || ''} ${delivery.deliveryUser.last_name || ''}`.trim() || delivery.deliveryUser.email : 
                          'N/A'
                        }
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(delivery.status)}>
                          {getStatusLabel(delivery.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(delivery.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell>
                        {format(new Date(delivery.updated_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetail(delivery)}
                            title="Ver detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteSingle(delivery.id)}
                            className="text-red-600 border-red-600 hover:bg-red-50"
                            title="Eliminar reparto"
                            disabled={selectedDeliveries.length > 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {deliveries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No hay repartos que coincidan con los filtros
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asignar Repartos</DialogTitle>
            <DialogDescription>
              Selecciona las visitas que deseas asignar a un repartidor
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Repartidor</label>
              <Select value={selectedDeliveryUser} onValueChange={setSelectedDeliveryUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar repartidor..." />
                </SelectTrigger>
                <SelectContent>
                  {deliveryUsers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} ({r.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {deliveryUsers.length === 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  No hay deliveryUsers disponibles. Asigna el rol "repartidor" a algún usuario.
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Visitas disponibles ({filteredAvailableVisits.length} de {availableVisits.length})
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, DNI o comercial..."
                  value={visitSearchTerm}
                  onChange={(e) => setVisitSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {filteredAvailableVisits.length === 0 ? (
                  <p className="p-4 text-center text-muted-foreground">
                    {availableVisits.length === 0 
                      ? 'No hay visitas disponibles para asignar'
                      : 'No se encontraron visitas con ese criterio de búsqueda'
                    }
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Comercial</TableHead>
                        <TableHead>Fecha Visita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAvailableVisits.map((visit) => (
                        <TableRow key={visit.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedVisits.includes(visit.id)}
                              onCheckedChange={(checked) => handleVisitSelection(visit.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {visit.client?.nombre_apellidos || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {visit.commercial ? 
                              `${visit.commercial.first_name || ''} ${visit.commercial.last_name || ''}`.trim() || visit.commercial.email : 
                              'N/A'
                            }
                          </TableCell>
                          <TableCell>
                            {format(new Date(visit.visit_date), 'dd/MM/yyyy', { locale: es })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateDeliveries} 
              disabled={selectedVisits.length === 0 || !selectedDeliveryUser}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Asignar {selectedVisits.length > 0 ? `(${selectedVisits.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeliveryDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        delivery={selectedDeliveryForDetail}
      />

      <Dialog open={changeDeliveryUserDialogOpen} onOpenChange={setChangeDeliveryUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Repartidor</DialogTitle>
            <DialogDescription>
              Selecciona el nuevo repartidor para {selectedDeliveries.length} reparto(s)
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={newDeliveryUserId} onValueChange={setNewDeliveryUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar repartidor..." />
              </SelectTrigger>
              <SelectContent>
                {deliveryUsers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name || r.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeDeliveryUserDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangeDeliveryUser} disabled={!newDeliveryUserId}>
              <UserCog className="mr-2 h-4 w-4" />
              Cambiar Repartidor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
