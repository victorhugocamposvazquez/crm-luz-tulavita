import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Plus, MapPin, Calendar, User, Building, Users, List, Eye, Edit, CheckCircle } from 'lucide-react';
import { formatCoordinates } from '@/lib/coordinates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import UnifiedVisitsManagement from './UnifiedVisitsManagement';
import VisitProgressHistory from '@/components/visits/VisitProgressHistory';
interface Visit {
  id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  approval_status: 'pending' | 'approved' | 'rejected' | 'waiting_admin';
  notes: string;
  client_id: string;
  second_commercial_id?: string;
  latitude?: number;
  longitude?: number;
  location_accuracy?: number;
  client: {
    nombre_apellidos: string;
    dni: string;
    localidad?: string;
  };
  company: {
    name: string;
  };
  commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
  second_commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
  approved_by?: {
    first_name: string;
    last_name: string;
  };
  approval_date?: string;
  visit_states?: {
    name: string;
    description: string;
  };
}
export default function CommercialVisitsManager() {
  const { user, userRole } = useAuth();
  const { location, hasPermission, requestLocation } = useGeolocation();
  const [currentView, setCurrentView] = useState<'list' | 'create-single'>('list');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [companies, setCompanies] = useState<Array<{
    id: string;
    name: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [visitSales, setVisitSales] = useState<any[]>([]);
  const [localGeolocationObtained, setLocalGeolocationObtained] = useState(false);
  
  // Check geolocation status whenever the popup opens
  useEffect(() => {
    const checkGeolocationInPopup = async () => {
      if (selectedVisit && editMode) {
        console.log('=== CHECKING GEOLOCATION STATUS FOR POPUP ===');
        
        // Try to get current location to check if permissions are granted
        try {
          const currentLocation = await requestLocation();
          console.log('Geolocation check result:', currentLocation);
          setLocalGeolocationObtained(!!currentLocation);
        } catch (error) {
          console.log('Geolocation check failed:', error);
          setLocalGeolocationObtained(false);
        }
      }
    };
    
    if (selectedVisit && editMode) {
      checkGeolocationInPopup();
    }
  }, [selectedVisit, editMode, requestLocation]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    completed: 0
  });
  useEffect(() => {
    console.log('[CVM] MOUNT/RESUB for approval-updates. currentView:', currentView);
    fetchVisits();
    fetchCompanies();
    
    // Listen for real-time updates on approval requests and visits
    const approvalChannel = supabase
      .channel('approval-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'client_approval_requests'
        },
        (payload) => {
          console.log('Approval request updated:', payload);
          if (currentView === 'list') {
            fetchVisits();
          } else {
            console.log('[CVM] Skipping visits refresh (approval-updates) - user is in creation flow');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'visits'
        },
        (payload) => {
          console.log('Visit updated:', payload);
          if (currentView === 'list') {
            fetchVisits();
          } else {
            console.log('[CVM] Skipping visits refresh (approval-updates visits) - user is in creation flow');
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[CVM] CLEANUP approval-updates: removing approvalChannel');
      supabase.removeChannel(approvalChannel);
    };
  }, [currentView]);
  useEffect(() => {
    const cleanup = setupRealtimeSubscription();
    console.log('[CVM] setupRealtimeSubscription called. currentView:', currentView, 'userId:', user?.id);
    return cleanup;
  }, [currentView, user?.id]); // Re-setup when currentView or user changes

  useEffect(() => {
    // Listen for visit creation events from other components
    const handleVisitCreated = (event: any) => {
      console.log('[CVM] VISIT CREATED EVENT RECEIVED');
      console.log('Event detail:', event.detail);
      console.log('Current view:', currentView);

      // Only refresh if we're in the list view, not during creation
      if (currentView === 'list') {
        console.log('Refreshing visits list...');
        fetchVisits();
      } else {
        console.log('Skipping refresh - user is in creation flow');
      }
    };

    // Listen for navigation back to visits list
    const handleNavigateToVisitsList = () => {
      console.log('[CVM] NAVIGATE TO VISITS LIST EVENT RECEIVED');
      setCurrentView('list');
      fetchVisits();
    };
    window.addEventListener('visitCreated', handleVisitCreated);
    window.addEventListener('navigateToVisitsList', handleNavigateToVisitsList);
    return () => {
      window.removeEventListener('visitCreated', handleVisitCreated);
      window.removeEventListener('navigateToVisitsList', handleNavigateToVisitsList);
    };
  }, [currentView]); // Add currentView as dependency

  const setupRealtimeSubscription = () => {
    console.log('[CVM] Setting up realtime subscription for user:', user?.id);
    const channel = supabase.channel('visits_changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'visits',
      filter: `commercial_id=eq.${user?.id}`
    }, payload => {
      console.log('[CVM] Visit change detected in realtime:', payload);
      console.log('[CVM] Current view during realtime event:', currentView);

      // CRITICAL FIX: Only refresh if we're in list view
      if (currentView === 'list') {
        console.log('[CVM] Refreshing visits due to realtime change...');
        fetchVisits();
      } else {
        console.log('[CVM] Skipping realtime refresh - user is in creation flow');
      }
    }).subscribe(status => {
      console.log('[CVM] Realtime subscription status:', status);
    });
    return () => {
      console.log('[CVM] Removing realtime channel');
      supabase.removeChannel(channel);
    };
  };
  const fetchCompanies = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('companies').select('id, name').order('name');
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };
  const fetchVisits = async () => {
    try {
      setLoading(true);
      console.log('[CVM] Fetching visits for user:', user?.id);

      // Debug: First check total visits for this user
      const {
        data: debugData
      } = await supabase.from('visits').select('id, status, approval_status, created_at').eq('commercial_id', user?.id);
      console.log('[CVM] Debug - All visits for user:', debugData);
      // Get today's date in YYYY-MM-DD format for filtering
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      
      const {
        data,
        error
      } = await supabase.from('visits').select(`
          id,
          visit_date,
          status,
          approval_status,
          notes,
          approval_date,
          permission,
          client_id,
          company_id,
          second_commercial_id,
          latitude,
          longitude,
          location_accuracy,
          visit_state_code,
          visit_states (
            name,
            description
          ),
          approved_by,
          client:clients(nombre_apellidos, dni, localidad),
          company:companies(name)
        `).eq('commercial_id', user?.id)
        .neq('status', 'completed')  // Exclude completed visits (shown in stats)
        .or(`approval_status.neq.rejected,and(approval_status.eq.rejected,visit_date.gte.${todayString})`)  // Exclude rejected visits from yesterday or earlier
        .order('visit_date', {
        ascending: false
      });
      
      if (error) {
        console.error('Error fetching visits:', error);
        throw error;
      }
      console.log('[CVM] Raw visits data:', data);
      const secondComIds = (data || []).map(v => v.second_commercial_id).filter(Boolean);
      console.log('[CVM] second_commercial_ids in visits:', secondComIds);
      
      // Fetch second commercial data for each visit
      const visitsWithSecondCommercial = await Promise.all((data || []).map(async (visit) => {
        let second_commercial = null;
        if (visit.second_commercial_id) {
          console.log(`[CVM] Fetching second commercial profile for visit ${visit.id}:`, visit.second_commercial_id);
          const { data: secondCommercialData, error: secondProfileError } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', visit.second_commercial_id)
            .maybeSingle();
          if (secondProfileError) {
            console.error(`[CVM] Error fetching second commercial for visit ${visit.id}:`, secondProfileError);
          }
          console.log(`[CVM] Second commercial profile for visit ${visit.id}:`, secondCommercialData);
          second_commercial = secondCommercialData;
        }
        return {
          ...visit,
          second_commercial
        };
      }));
      console.log('[CVM] Enriched visits sample:', visitsWithSecondCommercial.slice(0,3).map(v => ({ id: v.id, second: v.second_commercial })));
      const formattedVisits = visitsWithSecondCommercial?.map(visit => ({
        ...visit,
        client: visit.client || {
          nombre_apellidos: 'Cliente desconocido',
          dni: '',
          localidad: ''
        },
        company: visit.company || {
          name: 'Empresa desconocida'
        },
        approved_by: visit.approved_by ? {
          first_name: '',
          last_name: ''
        } : undefined
      })) || [];
      setVisits(formattedVisits as any); // Temporary fix for type conflicts

      // Calculate stats for non-completed visits
      const totalVisits = formattedVisits.length;
      const pendingVisits = formattedVisits.filter(v => v.approval_status === 'pending').length;
      const approvedVisits = formattedVisits.filter(v => v.approval_status === 'approved').length;
      const rejectedVisits = formattedVisits.filter(v => v.approval_status === 'rejected').length;

      // Fetch completed visits for last 30 days separately
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: completedVisitsData, error: completedError } = await supabase
        .from('visits')
        .select('id')
        .eq('commercial_id', user?.id)
        .eq('status', 'completed')
        .gte('visit_date', thirtyDaysAgo.toISOString())
        .order('visit_date', { ascending: false });

      if (completedError) {
        console.error('Error fetching completed visits:', completedError);
      }

      const completedVisitsCount = completedVisitsData?.length || 0;

      setStats({
        total: totalVisits,
        pending: pendingVisits,
        approved: approvedVisits,
        rejected: rejectedVisits,
        completed: completedVisitsCount
      });
    } catch (error) {
      console.error('Error fetching visits:', error);
      toast({
        title: "Error",
        description: "Error al cargar las visitas",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const getStatusBadge = (visit: Visit) => {
    let finalStatus = '';
    let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
    if (visit.approval_status === 'rejected') {
      finalStatus = 'Rechazada';
      variant = 'destructive';
    } else {
      // Solo mostramos el estado real de la visita (en curso o completada)
      if (visit.status === 'completed') {
        finalStatus = 'Completada';
        variant = 'default';
      } else {
        finalStatus = 'En curso';
        variant = 'secondary';
      }
    }
    return <Badge variant={variant}>
        {finalStatus}
      </Badge>;
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const handleViewVisit = async (visit: Visit) => {
    setSelectedVisit(visit);
    setEditMode(false);
    setLocalGeolocationObtained(false); // Reset geolocation state for new popup
    await fetchVisitSales(visit.id);
  };
  const handleEditVisit = async (visit: Visit) => {
    console.log('=== HANDLING EDIT VISIT - OPENING POPUP ===');
    console.log('Visit to edit:', visit);

    // Open popup with visit details and edit option
    setSelectedVisit(visit);
    setEditMode(true);
    setLocalGeolocationObtained(false); // Reset geolocation state for new popup
    await fetchVisitSales(visit.id);
  };
  const fetchVisitSales = async (visitId: string) => {
    try {
      // Fetch sales specifically for this visit
      const {
        data: salesData,
        error: salesError
      } = await supabase.from('sales').select('id, amount, sale_date').eq('visit_id', visitId).order('sale_date', {
        ascending: false
      });
      if (salesError) throw salesError;

      // Fetch sale lines for each sale
      const salesWithLines = await Promise.all((salesData || []).map(async sale => {
        const {
          data: linesData,
          error: linesError
        } = await supabase.from('sale_lines').select(`
          id, quantity, unit_price, line_total, financiada, transferencia, nulo,
          sale_lines_products(product_name)
        `).eq('sale_id', sale.id);
        if (linesError) {
          console.error('Error fetching sale lines:', linesError);
          return {
            ...sale,
            sale_lines: []
          };
        }
        
        // Transform sale lines to match expected format
        const transformedLines = (linesData || []).map(line => ({
          ...line,
          products: line.sale_lines_products || []
        }));
        
        return {
          ...sale,
          sale_lines: transformedLines
        };
      }));
      setVisitSales(salesWithLines);
    } catch (error) {
      console.error('Error fetching visit sales:', error);
      setVisitSales([]);
    }
  };
  const canEditVisit = (visit: Visit) => {
    // Solo puede editar si está aprobado (in progress) o pendiente
    return visit.approval_status === 'approved' || visit.approval_status === 'pending' || visit.approval_status === 'waiting_admin';
  };
  if (loading) {
    return <div className="flex items-center justify-center h-64">
        <div>Cargando visitas...</div>
      </div>;
  }
  return <div className="space-y-6">
      <div className="flex items-center justify-start">
        <h1 className="sr-only">Gestión de Visitas</h1>
        {currentView === 'list' && (
          <div className="flex gap-2">
            <Button onClick={() => {
              // Clear any existing visit continuation data
              sessionStorage.removeItem('continueVisitData');
              setCurrentView('create-single');
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva visita
            </Button>
          </div>
        )}
        {currentView !== 'list' && (
          <Button variant="outline" onClick={() => setCurrentView('list')}>
            <List className="h-4 w-4 mr-2" />
            Ver Lista
          </Button>
        )}
      </div>

      {currentView === 'list' && <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total visitas</CardTitle>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                <Calendar className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">{stats.pending}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
                <User className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{stats.approved}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rechazadas</CardTitle>
                <Building className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{stats.rejected}</div>
              </CardContent>
            </Card>
          </div>

          {/* Completed Visits Card */}
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Visitas completadas - últimos 30 días</CardTitle>
                <CheckCircle className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{stats.completed}</div>
              </CardContent>
            </Card>
          </div>

          {/* Visits Table */}
          <Card>
            <CardHeader>
              <CardTitle>Mis visitas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                   <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>DNI</TableHead>
              <TableHead>Localidad</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Segundo Comercial</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Permisos</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
                </TableHeader>
                <TableBody>
                  {visits.map(visit => <TableRow key={visit.id}>
                       <TableCell className="font-medium">
                          {visit.client.nombre_apellidos}
                        </TableCell>
                        <TableCell>{visit.client.dni}</TableCell>
                        <TableCell>{visit.client.localidad || '-'}</TableCell>
                        <TableCell>{visit.company.name}</TableCell>
                        <TableCell>
                          {visit.second_commercial ? 
                            `${visit.second_commercial.first_name} ${visit.second_commercial.last_name}` : 
                            '-'
                          }
                        </TableCell>
                        <TableCell>{formatDate(visit.visit_date)}</TableCell>
                       <TableCell>{getStatusBadge(visit)}</TableCell>
                       <TableCell>
                         <Badge variant={visit.approval_status === 'approved' ? 'default' : visit.approval_status === 'rejected' ? 'destructive' : 'secondary'}>
                           {visit.approval_status === 'approved' ? 'Aprobado' : visit.approval_status === 'rejected' ? 'Rechazado' : visit.approval_status === 'waiting_admin' ? 'Esperando admin' : 'Pendiente'}
                         </Badge>
                       </TableCell>
                        <TableCell className="max-w-[200px] truncate">{visit.notes}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {visit.status === 'in_progress' && visit.approval_status !== 'rejected' ? <Button size="sm" variant="outline" onClick={() => handleEditVisit(visit)}>
                              <Edit className="h-4 w-4" />
                            </Button> : <Button size="sm" variant="outline" onClick={() => handleViewVisit(visit)}>
                              <Eye className="h-4 w-4" />
                            </Button>}
                        </div>
                      </TableCell>
                    </TableRow>)}
                </TableBody>
              </Table>
              {visits.length === 0 && <div className="text-center py-8 text-muted-foreground">
                  No tienes visitas registradas aún. Solo se muestran las visitas no finalizadas.
                </div>}
            </CardContent>
          </Card>
        </>}

      {currentView === 'create-single' && <UnifiedVisitsManagement />}


      {/* Visit Detail Dialog */}
      {selectedVisit && <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editMode ? 'Editar Visita' : 'Detalles de la Visita'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cliente</Label>
                  <p className="font-medium">{selectedVisit.client.nombre_apellidos}</p>
                </div>
                <div>
                  <Label>DNI</Label>
                  <p>{selectedVisit.client.dni}</p>
                </div>
                <div>
                  <Label>Segundo Comercial</Label>
                  <p>{selectedVisit.second_commercial ? `${selectedVisit.second_commercial.first_name} ${selectedVisit.second_commercial.last_name}` : 'Sin segundo comercial'}</p>
                </div>
                <div>
                  <Label>Empresa</Label>
                  <p>{selectedVisit.company.name}</p>
                </div>
                <div>
                  <Label>Fecha</Label>
                  <p>{formatDate(selectedVisit.visit_date)}</p>
                </div>
                <div>
                  <Label>Estado de la visita</Label>
                  <div>{getStatusBadge(selectedVisit)}</div>
                </div>
                {selectedVisit.visit_states && (
                  <div>
                    <Label>Resultado de la visita</Label>
                    <div>
                      <Badge variant="outline">{selectedVisit.visit_states.name.charAt(0).toUpperCase() + selectedVisit.visit_states.name.slice(1).toLowerCase()}</Badge>
                    </div>
                  </div>
                )}
                {(selectedVisit.latitude && selectedVisit.longitude) && (
                  <div>
                    <Label>Ubicación</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <a 
                        href={`https://maps.google.com/?q=${selectedVisit.latitude},${selectedVisit.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer hover:underline flex items-center gap-1"
                      >
                        {formatCoordinates(selectedVisit.latitude, selectedVisit.longitude)}
                        <MapPin className="h-3 w-3" />
                      </a>
                      {selectedVisit.location_accuracy && (
                        <span className="text-xs text-muted-foreground">
                          (±{selectedVisit.location_accuracy.toFixed(0)}m)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <Label>Notas</Label>
                <p className="mt-1 p-2 border rounded-md bg-muted">
                  {selectedVisit.notes || 'Sin notas'}
                </p>
              </div>

              {selectedVisit.approval_date && selectedVisit.approved_by && <div>
                  <Label>Aprobado por</Label>
                  <p>{selectedVisit.approved_by.first_name} {selectedVisit.approved_by.last_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedVisit.approval_date)}
                  </p>
                </div>}

              {editMode && canEditVisit(selectedVisit) && <div className="border-t pt-4 flex flex-col items-start space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Esta visita puede ser editada.
                  </p>
                  <Button 
                    disabled={!localGeolocationObtained && !location}
                    onClick={async () => {
              console.log('=== CONTINUAR VISITA BUTTON CLICKED ===');
              console.log('selectedVisit:', selectedVisit);
              console.log('Current location:', location);
              console.log('hasPermission:', hasPermission);
              console.log('localGeolocationObtained:', localGeolocationObtained);
              
              // If we don't have location, try to get it
              let currentLocation = location;
              if (!currentLocation) {
                console.log('Requesting location...');
                currentLocation = await requestLocation();
                if (currentLocation) {
                  setLocalGeolocationObtained(true);
                  console.log('Location obtained:', currentLocation);
                } else {
                  console.log('Failed to obtain location');
                  toast({
                    title: "Geolocalización requerida",
                    description: "Por favor, permite el acceso a tu ubicación para continuar la visita",
                    variant: "destructive"
                  });
                  return;
                }
              }

              // Store visit data in sessionStorage for cross-component communication
              const visitData = {
                visitId: selectedVisit.id,
                clientId: selectedVisit.client_id,
                approvalStatus: selectedVisit.approval_status,
                hasApproval: selectedVisit.approval_status === 'approved'
              };
              sessionStorage.setItem('continueVisitData', JSON.stringify(visitData));
              setSelectedVisit(null);
              setCurrentView('create-single');
            }}>
                    <Edit className="h-4 w-4 mr-2" />
                    Continuar Visita
                  </Button>
                  {!localGeolocationObtained && !location && (
                    <p className="text-sm text-amber-600">
                      ⚠️ Necesitas activar la geolocalización para continuar la visita
                    </p>
                  )}
                </div>}

              {/* Ventas */}
              <div className="border-t pt-4">
                <VisitProgressHistory visitId={selectedVisit.id} />
              </div>

              <div className="border-t pt-4">
                <Label>Ventas</Label>
                {visitSales.length > 0 ? (
                  <div className="mt-2 space-y-3">
                    <div className="max-h-48 overflow-y-auto">
                      {visitSales.map((sale, index) => (
                        <div key={sale.id} className="border rounded-lg p-3 mb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">Venta #{index + 1} - €{sale.amount}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(sale.sale_date).toLocaleDateString('es-ES')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">
                                {sale.sale_lines?.length || 0} productos
                              </p>
                            </div>
                          </div>
                          {sale.sale_lines && sale.sale_lines.length > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-2">Productos:</p>
                              {sale.sale_lines.slice(0, 3).map((line: any) => (
                                <div key={line.id} className="text-xs space-y-1 mb-2">
                                  <div className="flex justify-between">
                                    <div>
                                      {line.products && line.products.length > 1 ? (
                                        // Pack: mostrar productos en líneas separadas
                                        <div className="space-y-1">
                                          <div className="font-medium">
                                            {line.quantity}x Pack - €{line.unit_price}
                                          </div>
                                          {line.products.map((product: any, productIndex: number) => (
                                            <div key={productIndex} className="ml-2 text-muted-foreground">
                                              • {product.product_name || 'Sin nombre'}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        // Producto individual
                                        <span>
                                          {line.quantity}x {line.products?.[0]?.product_name || 'Sin producto'} - €{line.unit_price}
                                        </span>
                                      )}
                                    </div>
                                    <span>€{line.line_total || (line.quantity * line.unit_price)}</span>
                                  </div>
                                  <div className="flex gap-2 text-xs">
                                   <span className={`px-2 py-1 rounded ${line.financiada ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                     {line.financiada ? '✓' : '✗'} Financiada
                                   </span>
                                   <span className={`px-2 py-1 rounded ${line.transferencia ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                     {line.transferencia ? '✓' : '✗'} Transferencia
                                   </span>
                                   <span className={`px-2 py-1 rounded ${line.nulo ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                                     {line.nulo ? '✓' : '✗'} Nulo
                                   </span>
                                  </div>
                                </div>
                              ))}
                              {sale.sale_lines.length > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  +{sale.sale_lines.length - 3} productos más
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    No hay ventas registradas para esta visita.
                  </p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>}
    </div>;
}