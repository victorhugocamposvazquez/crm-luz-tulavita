import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, MapPin, Plus, Minus } from 'lucide-react';
import { formatCoordinates } from '@/lib/coordinates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Client {
  id: string;
  nombre_apellidos: string;
  dni: string;
  direccion: string;
  telefono1?: string;
  telefono2?: string;
  email?: string;
  note?: string;
}

interface Company {
  id: string;
  name: string;
}

interface SaleLine {
  product_name: string;
  quantity: number;
  unit_price: number;
  financiada: boolean;
  transferencia: boolean;
  nulo: boolean;
}

interface ClientPurchase {
  id: string;
  amount: number;
  sale_date: string;
  product_description: string;
  sale_lines: {
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
}

interface ClientVisit {
  id: string;
  visit_date: string;
  status: string;
  notes: string;
  permission: string;
}

type WorkflowStep = 'nif-input' | 'pending-approval' | 'client-form' | 'visit-form';

interface UnifiedVisitsManagementProps {
  onSuccess?: () => void;
}

export default function UnifiedVisitsManagement({ onSuccess }: UnifiedVisitsManagementProps = {}) {
  const {
    user,
    profile,
    userRole
  } = useAuth();
  const {
    location,
    error: geoError,
    requestLocation
  } = useGeolocation();

  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('nif-input');
  const [clientNIF, setClientNIF] = useState('');
  const [multipleNIFs, setMultipleNIFs] = useState<string[]>([]);
  const [existingClient, setExistingClient] = useState<Client | null>(null);
  const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState('');

  // Form data
  const [clientData, setClientData] = useState({
    nombre_apellidos: '',
    dni: '',
    direccion: '',
    telefono1: '',
    telefono2: '',
    email: '',
    note: ''
  });
  const [visitData, setVisitData] = useState({
    notes: '',
    status: 'in_progress' as 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed',
    company_id: '',
    permission: 'pending',
    visitStateCode: ''
  });
  const [saleLines, setSaleLines] = useState<SaleLine[]>([]);
  const [clientComment, setClientComment] = useState('');
  const [clientPurchases, setClientPurchases] = useState<ClientPurchase[]>([]);
  const [clientVisits, setClientVisits] = useState<ClientVisit[]>([]);

  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [visitStates, setVisitStates] = useState<{code: string, name: string}[]>([]);
  const [hasApproval, setHasApproval] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [currentVisitStatus, setCurrentVisitStatus] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    fetchCompanies();
    fetchVisitStates();
    // Auto-request location when component loads
    if (location === null) {
      requestLocation();
    }

    // Check for continue visit data in sessionStorage
    const continueVisitData = sessionStorage.getItem('continueVisitData');
    if (continueVisitData) {
      console.log('=== FOUND CONTINUE VISIT DATA IN SESSION STORAGE ===');
      const data = JSON.parse(continueVisitData);
      console.log('Visit data:', data);

      // Clear the data from session storage
      sessionStorage.removeItem('continueVisitData');

      // Process the continue visit data
      handleContinueVisit(data);
    }
    async function handleContinueVisit(data: any) {
      const {
        visitId,
        clientId,
        hasApproval
      } = data;
      try {
        // Set initial state FIRST to prevent showing NIF form
        setCurrentStep('visit-form');
        setEditingVisitId(visitId);
        setHasApproval(hasApproval);

        // Fetch client data
        const {
          data: clientData,
          error: clientError
        } = await supabase.from('clients').select('*').eq('id', clientId).single();
        if (clientError) {
          console.error('Error fetching client:', clientError);
          return;
        }

        // Set the client data and state for continuing the visit
        setExistingClient(clientData);
        setClientNIF(clientData.dni || '');

        // Load existing visit data
        try {
          const {
            data: visitData,
            error
          } = await supabase.from('visits').select('*').eq('id', visitId).single();
          if (error) throw error;
          setVisitData({
            notes: visitData.notes || '',
            status: visitData.status as any,
            company_id: visitData.company_id || '',
            permission: visitData.permission || 'pending',
            visitStateCode: visitData.visit_state_code || ''
          });

          // Store current visit status for read-only checking
          setCurrentVisitStatus(visitData.status);
          console.log('=== LOADED EXISTING VISIT DATA ===');
          console.log('visitData:', visitData);
          console.log('Visit status:', visitData.status);

          // Load existing sales/products for this visit
          await loadExistingSalesForVisit(clientId, visitData.commercial_id, visitData.company_id, visitId);
        } catch (error) {
          console.error('Error loading visit data:', error);
        }

        // If approved, fetch additional client data (purchase history, etc.)
        if (hasApproval) {
          fetchClientData(clientId);
        }
        console.log('=== VISIT CONTINUATION SETUP COMPLETE ===');
        console.log('currentStep set to: visit-form');
        console.log('existingClient:', clientData);
        console.log('hasApproval:', hasApproval);
        console.log('editingVisitId:', visitId);
      } catch (error) {
        console.error('Error in continue visit:', error);
      }
    }
    ;
    window.addEventListener('continueVisit', handleContinueVisit as EventListener);
    return () => {
      window.removeEventListener('continueVisit', handleContinueVisit as EventListener);
    };
  }, []);

  // Debug: Log companies state
  useEffect(() => {
    console.log('Companies loaded:', companies);
  }, [companies]);

  // Real-time subscription for approval status
  useEffect(() => {
    if (!approvalRequestId) return;
    const channel = supabase.channel('approval-updates').on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'client_approval_requests',
      filter: `id=eq.${approvalRequestId}`
    }, async payload => {
      console.log('Approval request updated:', payload);
      const updatedRequest = payload.new as any;
      if (updatedRequest.status === 'approved') {
        setHasApproval(true);
        toast({
          title: "Aprobación concedida",
          description: "Puedes ver la información del cliente"
        });

        // Update the actual visit status when approved
        if (existingClient) {
          // Update visit to in_progress when approved
          try {
            const {
              error: updateError
            } = await supabase.from('visits').update({
              status: 'in_progress'
            }).eq('client_id', existingClient.id).eq('approval_status', 'waiting_admin');
            if (updateError) {
              console.error('Error updating visit status:', updateError);
            }
            fetchClientData(existingClient.id);
          } catch (error) {
            console.error('Error in approval update:', error);
          }
        }
        setCurrentStep('visit-form');
      } else if (updatedRequest.status === 'rejected') {
        setHasApproval(false);
        toast({
          title: "Acceso denegado",
          description: "Continúa con la visita sin información previa",
          variant: "destructive"
        });
        setCurrentStep('visit-form');
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [approvalRequestId, existingClient]);

  const fetchCompanies = async () => {
    try {
      console.log('Fetching companies...');
      const {
        data,
        error
      } = await supabase.from('companies').select('id, name').order('name');
      if (error) {
        console.error('Companies fetch error:', error);
        throw error;
      }
      console.log('Companies fetched:', data);
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast({
        title: "Error",
        description: "Error al cargar empresas",
        variant: "destructive"
      });
    }
  };

  const fetchVisitStates = async () => {
    try {
      console.log('Fetching visit states...');
      const {
        data,
        error
      } = await supabase.from('visit_states').select('code, name').order('name');
      if (error) {
        console.error('Visit states fetch error:', error);
        throw error;
      }
      console.log('Visit states fetched:', data);
      setVisitStates(data || []);
    } catch (error) {
      console.error('Error fetching visit states:', error);
      toast({
        title: "Error",
        description: "Error al cargar estados de visita",
        variant: "destructive"
      });
    }
  };

  const fetchClientData = async (clientId: string) => {
    try {
      console.log('Fetching client data for:', clientId);

      // Fetch client purchases (only completed sales)
      const {
        data: salesData,
        error: salesError
      } = await supabase.from('sales').select(`
          id, amount, sale_date, product_description,
          visits!inner(status)
        `).eq('client_id', clientId).eq('visits.status', 'completed' as any).order('sale_date', {
        ascending: false
      }).limit(5);
      if (salesError) {
        console.error('Sales fetch error:', salesError);
        throw salesError;
      }
      console.log('Sales data fetched:', salesData);

      // Fetch sale lines for each sale
      const salesWithLines = await Promise.all((salesData || []).map(async sale => {
        const {
          data: linesData,
          error: linesError
        } = await supabase.from('sale_lines').select('product_name, quantity, unit_price').eq('sale_id', sale.id);
        if (linesError) {
          console.error('Sale lines fetch error:', linesError);
        }
        return {
          ...sale,
          sale_lines: linesError ? [] : linesData || []
        };
      }));
      console.log('Sales with lines:', salesWithLines);
      setClientPurchases(salesWithLines);

      // Fetch recent visits (exclude current editing visit if any)
      let visitsQuery = supabase
        .from('visits')
        .select('id, visit_date, status, notes, permission')
        .eq('client_id', clientId)
        .order('visit_date', { ascending: false })
        .limit(5);
      
      // Only add neq filter if editingVisitId is actually defined
      if (editingVisitId) {
        visitsQuery = visitsQuery.neq('id', editingVisitId);
      }
      
      const { data: visitsData, error: visitsError } = await visitsQuery;
      if (visitsError) {
        console.error('Visits fetch error:', visitsError);
        throw visitsError;
      }
      console.log('Visits data fetched:', visitsData);
      setClientVisits((visitsData || []).map(visit => ({
        ...visit,
        permission: visit.permission || 'pending'
      })));
    } catch (error) {
      console.error('Error fetching client data:', error);
      toast({
        title: "Error",
        description: "Error al cargar detalles del cliente",
        variant: "destructive"
      });
    }
  };

  const loadExistingSalesForVisit = async (clientId: string, commercialId: string, companyId: string, visitId?: string) => {
    try {
      console.log('Loading existing sales for visit...', { visitId });

      // Only load sales if we have a specific visit ID and are in edit mode
      if (!visitId) {
        console.log('No visit ID provided, starting with empty sale lines');
        setSaleLines([]);
        return;
      }

      // Find sales specifically for this visit
      const {
        data: salesData,
        error: salesError
      } = await supabase.from('sales').select('id').eq('visit_id', visitId).single();
      
      if (salesError) {
        if (salesError.code === 'PGRST116') {
          // No sales found for this visit, which is normal
          console.log('No sales found for this visit');
          setSaleLines([]);
          return;
        }
        console.error('Error fetching sales:', salesError);
        return;
      }
      
      if (salesData) {
        const saleId = salesData.id;

        // Load sale lines for this sale
        const {
          data: saleLinesData,
          error: saleLinesError
        } = await supabase.from('sale_lines').select('product_name, quantity, unit_price, financiada, transferencia, nulo').eq('sale_id', saleId);
        
        if (saleLinesError) {
          console.error('Error fetching sale lines:', saleLinesError);
          return;
        }
        
        if (saleLinesData && saleLinesData.length > 0) {
          console.log('Loaded existing sale lines:', saleLinesData);
          setSaleLines(saleLinesData);
        } else {
          setSaleLines([]);
        }
      }
    } catch (error) {
      console.error('Error loading existing sales:', error);
      setSaleLines([]);
    }
  };

  const handleNIFSubmit = async () => {
    // Parse multiple NIFs from input
    const nifInput = clientNIF.trim();
    if (!nifInput) {
      toast({
        title: "Error",
        description: "Introduce uno o varios NIF/DNI válidos separados por comas",
        variant: "destructive"
      });
      return;
    }

    // Split by commas and clean up
    const nifs = nifInput.split(',').map(nif => nif.trim()).filter(nif => nif !== '');
    
    if (nifs.length === 0) {
      toast({
        title: "Error",
        description: "Introduce uno o varios NIF/DNI válidos",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      // If only one NIF, handle as before
      if (nifs.length === 1) {
        const { data: clientData, error } = await supabase
          .from('clients')
          .select('*')
          .eq('dni', nifs[0])
          .maybeSingle();

        if (error) throw error;

        if (clientData) {
          // Check if client is active
          if (clientData.status === 'inactive') {
            toast({
              title: "Cliente inactivo", 
              description: "No se puede crear una visita para un cliente inactivo. Contacta con el administrador.",
              variant: "destructive"
            });
            setLoading(false);
            return;
          }
          
          // Check if user is admin
          if (userRole?.role === 'admin') {
            // Admin doesn't need approval, go directly to visit form
            setExistingClient(clientData);
            setHasApproval(true);
            await fetchClientData(clientData.id);
            setCurrentStep('visit-form');
          } else {
            // Commercial user needs approval
            setExistingClient(clientData);
            setHasApproval(false);
            await requestClientApproval(clientData.id);
          }
        } else {
          // Client doesn't exist, create new
          setClientData(prev => ({
            ...prev,
            dni: nifs[0]
          }));
          setCurrentStep('client-form');
        }
      } else {
        // Multiple NIFs - handle bulk creation
        if (!selectedCompany) {
          toast({
            title: "Error", 
            description: "Selecciona una empresa antes de crear visitas en lote",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        const { data: existingClients, error: clientError } = await supabase
          .from('clients')
          .select('id, dni, nombre_apellidos, status')
          .in('dni', nifs);

        if (clientError) throw clientError;

        // Filter out inactive clients
        const activeClients = existingClients?.filter(c => c.status !== 'inactive') || [];
        const inactiveClients = existingClients?.filter(c => c.status === 'inactive') || [];
        
        if (inactiveClients.length > 0) {
          toast({
            title: "Clientes inactivos detectados",
            description: `Los siguientes clientes están inactivos y no se crearán visitas: ${inactiveClients.map(c => c.dni).join(', ')}`,
            variant: "destructive"
          });
        }

        const existingNIFs = activeClients?.map(c => c.dni) || [];
        const missingNIFs = nifs.filter(nif => !existingNIFs.includes(nif));

        // Create visits for existing active clients
        if (activeClients && activeClients.length > 0) {
          const batchId = crypto.randomUUID();
          
          for (const client of activeClients) {
            // Create approval request for each client (only for commercials)
            if (userRole?.role !== 'admin') {
              const { data: approvalData, error: approvalError } = await supabase
                .from('client_approval_requests')
                .insert({
                  client_id: client.id,
                  commercial_id: user?.id,
                  status: 'pending'
                })
                .select()
                .single();

              if (approvalError) throw approvalError;
            }

            // Create visit for each existing client
            const visitPayload = {
              client_id: client.id,
              commercial_id: user?.id,
              company_id: selectedCompany,
              status: 'in_progress' as const,
              approval_status: userRole?.role === 'admin' ? 'approved' as const : 'waiting_admin' as const,
              notes: '',
              batch_id: batchId,
              visit_date: new Date().toISOString(),
              permission: userRole?.role === 'admin' ? 'approved' : 'pending',
              latitude: location?.latitude || null,
              longitude: location?.longitude || null,
              location_accuracy: location?.accuracy || null
            };

            const { data: visitData, error: visitError } = await supabase
              .from('visits')
              .insert(visitPayload)
              .select()
              .single();

            if (visitError) throw visitError;

            // Dispatch event for each created visit
            window.dispatchEvent(new CustomEvent('visitCreated', {
              detail: visitData
            }));
          }

          toast({
            title: "Visitas creadas",
            description: `Se crearon ${existingClients.length} visitas. ${missingNIFs.length > 0 ? `${missingNIFs.length} DNIs no encontrados.` : ''}`
          });

          if (missingNIFs.length > 0) {
            toast({
              title: "DNIs no encontrados",
              description: `Los siguientes DNIs requieren crear clientes individualmente: ${missingNIFs.join(', ')}`,
              variant: "default"
            });
          }

          // Reset form and redirect to visits list for bulk creation
          setClientNIF('');
          setSelectedCompany('');
          setCurrentStep('nif-input');
          
          // Redirect to visits list after bulk creation immediately
          window.dispatchEvent(new CustomEvent('navigateToVisitsList'));
        } else {
          toast({
            title: "Sin clientes encontrados",
            description: "Ninguno de los DNIs introducidos existe. Para crear clientes, introduce un solo DNI.",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error checking clients:', error);
      toast({
        title: "Error",
        description: "Error al verificar los clientes",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const requestClientApproval = async (clientId: string) => {
    try {
      console.log('=== REQUESTING CLIENT APPROVAL AND CREATING VISIT ===');

      // Create approval request in database
      const {
        data: approvalRequest,
        error
      } = await supabase.from('client_approval_requests').insert({
        client_id: clientId,
        commercial_id: user!.id
      }).select().single();
      if (error) throw error;
      console.log('Approval request created:', approvalRequest);

      // IMMEDIATELY CREATE THE VISIT as pending approval
      const visitPayload = {
        client_id: clientId,
        commercial_id: user!.id,
        company_id: companies[0]?.id || null,
        // Use first available company or null
        notes: '',
        status: 'in_progress' as 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed',
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_accuracy: location?.accuracy || null,
        visit_date: new Date().toISOString(),
        approval_status: 'waiting_admin' as 'pending' | 'approved' | 'rejected' | 'waiting_admin',
        permission: 'pending'
      };
      console.log('Creating visit immediately with payload:', visitPayload);
      const {
        data: visit,
        error: visitError
      } = await supabase.from('visits').insert(visitPayload as any).select().single();
      if (visitError) {
        console.error('Error creating visit:', visitError);
        throw visitError;
      }
      console.log('Visit created successfully:', visit);

      // Set the editing visit ID so that subsequent saves update this visit instead of creating new ones
      setEditingVisitId(visit.id);
      console.log('Dispatching visitCreated event immediately');
      window.dispatchEvent(new CustomEvent('visitCreated', {
        detail: visit
      }));
      
      // Reset form and navigate directly to visits list
      setApprovalRequestId(approvalRequest.id);
      setClientNIF('');
      setSelectedCompany('');
      setCurrentStep('nif-input');
      
      toast({
        title: "✅ Visita creada exitosamente",
        description: "La visita se ha guardado correctamente"
      });
      
      // Navigate to visits list and trigger refresh immediately
      window.dispatchEvent(new CustomEvent('navigateToVisitsList'));
      // Trigger visits list refresh
      window.dispatchEvent(new CustomEvent('refreshVisitsList'));
    } catch (error) {
      console.error('Error requesting approval:', error);
      toast({
        title: "Error",
        description: "Error al crear la visita",
        variant: "destructive"
      });
    }
  };

  const handleCreateClient = async () => {
    if (!clientData.nombre_apellidos || !clientData.direccion) {
      toast({
        title: "Error",
        description: "Completa los campos obligatorios",
        variant: "destructive"
      });
      return;
    }
    
    if (!selectedCompany) {
      toast({
        title: "Error",
        description: "Selecciona una empresa antes de crear el cliente",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      // Include coordinates in client data
      const clientPayload = {
        ...clientData,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null
      };
      
      const {
        data: newClient,
        error
      } = await supabase.from('clients').insert(clientPayload).select().single();
      if (error) throw error;
      
      // Automatically create the visit for the new client
      const visitPayload = {
        client_id: newClient.id,
        commercial_id: user!.id,
        company_id: selectedCompany,
        notes: '',
        status: 'in_progress' as const,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_accuracy: location?.accuracy || null,
        visit_date: new Date().toISOString(),
        approval_status: 'approved' as const, // Auto-approved for new clients
        permission: 'approved'
      };
      
      const { data: newVisit, error: visitError } = await supabase
        .from('visits')
        .insert(visitPayload as any)
        .select()
        .single();
        
      if (visitError) {
        console.error('Visit creation error:', visitError);
        throw visitError;
      }
      
      console.log('New visit created:', newVisit);
      
      toast({
        title: "Cliente y visita creados",
        description: "Cliente registrado exitosamente y visita creada automáticamente"
      });
      
      // Dispatch events to navigate back to visits list (same pattern as when completing a visit)
      window.dispatchEvent(new CustomEvent('visitCreated', { detail: newVisit }));
      window.dispatchEvent(new CustomEvent('navigateToVisitsList'));
      
    } catch (error) {
      console.error('Error creating client:', error);
      toast({
        title: "Error",
        description: "Error al crear el cliente",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addSaleLine = () => {
    setSaleLines([...saleLines, {
      product_name: '',
      quantity: 1,
      unit_price: 0,
      financiada: false,
      transferencia: false,
      nulo: false
    }]);
  };

  const removeSaleLine = (index: number) => {
    setSaleLines(saleLines.filter((_, i) => i !== index));
  };

  const updateSaleLine = (index: number, field: keyof SaleLine, value: any) => {
    const updated = [...saleLines];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setSaleLines(updated);
  };

  const handleSaveVisit = async (isComplete: boolean) => {
    console.log('=== UNIFIED VISITS - STARTING VISIT SAVE ===');
    console.log('editingVisitId:', editingVisitId);
    console.log('isComplete:', isComplete);
    console.log('existingClient:', existingClient);
    console.log('visitData:', visitData);
    console.log('user:', user);
    
    if (!existingClient || !visitData.company_id) {
      console.log('=== VALIDATION FAILED ===');
      console.log('Missing client or company');
      console.log('existingClient:', existingClient);
      console.log('visitData.company_id:', visitData.company_id);
      toast({
        title: "Error",
        description: "Debes seleccionar una empresa",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    
    try {
      let visit;
      
      if (editingVisitId) {
        // Update existing visit
        console.log('=== UPDATING EXISTING VISIT ===');
        const updatePayload = {
          company_id: visitData.company_id,
          notes: visitData.notes || null,
          status: isComplete ? 'completed' as const : 'in_progress' as const,
          visit_state_code: visitData.visitStateCode || null,
          // Solo actualizar coordenadas si la visita no está completada o si se está completando ahora
          ...(currentVisitStatus !== 'completed' && location ? {
            latitude: location.latitude,
            longitude: location.longitude, 
            location_accuracy: location.accuracy
          } : {})
        };
        
        console.log('Update payload:', updatePayload);
        
        const { error: visitError } = await supabase
          .from('visits')
          .update(updatePayload as any)
          .eq('id', editingVisitId);
          
        if (visitError) {
          console.error('Visit update error:', visitError);
          throw visitError;
        }

        // Fetch updated visit to get the complete data
        const { data: fetchedVisit, error: fetchError } = await supabase
          .from('visits')
          .select('*')
          .eq('id', editingVisitId)
          .single();
          
        if (fetchError) {
          console.error('Error fetching updated visit:', fetchError);
          visit = { id: editingVisitId, ...updatePayload };
        } else {
          visit = fetchedVisit;
        }
        
        console.log('=== VISIT UPDATED SUCCESSFULLY ===');
        console.log('Updated visit:', visit);
      } else {
        // Create new visit (shouldn't happen in edit mode)
        console.log('=== CREATING NEW VISIT (FALLBACK) ===');
        const visitPayload = {
          client_id: existingClient.id,
          commercial_id: user!.id,
          company_id: visitData.company_id,
          notes: visitData.notes || null,
          status: isComplete ? 'completed' as const : 'in_progress' as const,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          location_accuracy: location?.accuracy || null,
          visit_date: new Date().toISOString(),
          approval_status: 'pending' as 'pending' | 'approved' | 'rejected' | 'waiting_admin',
          permission: 'pending',
          visit_state_code: visitData.visitStateCode || null
        };
        
        const { data: newVisit, error: visitError } = await supabase
          .from('visits')
          .insert(visitPayload as any)
          .select()
          .single();
          
        if (visitError) {
          console.error('Visit creation error:', visitError);
          throw visitError;
        }
        
        visit = newVisit;
        setEditingVisitId(newVisit.id); // Set the ID for future saves
      }

      // Handle sales - always save if there are sale lines, regardless of completion status
      if (saleLines.length > 0) {
        const totalAmount = saleLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);

        // Check if there's already a sale for this specific visit
        const {
          data: existingSales
        } = await supabase.from('sales').select('id').eq('visit_id', visit.id).maybeSingle();
        
        let saleId;
        if (existingSales) {
          // Update the existing sale for this visit
          saleId = existingSales.id;
          const {
            error: saleUpdateError
          } = await supabase.from('sales').update({
            amount: totalAmount,
            latitude: location?.latitude,
            longitude: location?.longitude,
            location_accuracy: location?.accuracy,
            sale_date: new Date().toISOString()
          }).eq('id', saleId);
          if (saleUpdateError) throw saleUpdateError;

          // Delete existing sale lines for this sale
          const {
            error: deleteError
          } = await supabase.from('sale_lines').delete().eq('sale_id', saleId);
          if (deleteError) throw deleteError;
        } else {
          // Create new sale linked to this specific visit
          const salePayload = {
            client_id: existingClient.id,
            commercial_id: user!.id,
            company_id: visitData.company_id,
            visit_id: visit.id, // Link the sale to this specific visit
            amount: totalAmount,
            latitude: location?.latitude,
            longitude: location?.longitude,
            location_accuracy: location?.accuracy,
            sale_date: new Date().toISOString()
          };
          const {
            data: sale,
            error: saleError
          } = await supabase.from('sales').insert(salePayload).select().single();
          if (saleError) throw saleError;
          saleId = sale.id;
        }

        // Insert new sale lines (excluding line_total as it's a generated column)
        const saleLinesPayload = saleLines.map(line => ({
          product_name: line.product_name,
          quantity: line.quantity,
          unit_price: line.unit_price,
          financiada: line.financiada,
          transferencia: line.transferencia,
          nulo: line.nulo,
          sale_id: saleId
        }));
        const {
          error: linesError
        } = await supabase.from('sale_lines').insert(saleLinesPayload);
        if (linesError) throw linesError;
      }

      // Add client comment if provided (simplified for now)
      if (clientComment.trim()) {
        console.log('Client comment:', clientComment.trim());
        // This would be saved to client_comments table once types are updated
      }
      console.log('=== EMITTING CUSTOM EVENT ===');
      
      toast({
        title: isComplete ? "Visita finalizada" : "Visita guardada",
        description: isComplete ? "La visita se ha completado y las ventas son definitivas" : "La visita se ha guardado. Las ventas son temporales hasta finalizar"
      });

      // Emit custom event to notify parent components
      console.log('Dispatching visitCreated event with data:', visit);
      window.dispatchEvent(new CustomEvent('visitCreated', { detail: visit }));
      console.log('=== EVENT DISPATCHED ===');

      // Navigate back to visits list by dispatching navigation event
      window.dispatchEvent(new CustomEvent('navigateToVisitsList'));

      // Reset form only if completing visit
      if (isComplete) {
        setCurrentStep('nif-input');
        setClientNIF('');
        setExistingClient(null);
        setApprovalRequestId(null);
        setEditingVisitId(null);
        setCurrentVisitStatus(null);
        setVisitData({
          notes: '',
          status: 'in_progress',
          company_id: '',
          permission: 'pending',
          visitStateCode: ''
        });
        setSaleLines([]);
        setClientComment('');
        setHasApproval(false);
        setClientPurchases([]);
        setClientVisits([]);
      }
    } catch (error) {
      console.error('Error saving visit:', error);
      toast({
        title: "Error",
        description: "Error al guardar la visita",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitVisit = async () => {
    await handleSaveVisit(true);
  };

  const renderNIFInput = () => <Card>
      <CardHeader>
        <CardTitle>Verificación de cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company">Empresa *</Label>
          <Select 
            value={selectedCompany} 
            onValueChange={setSelectedCompany}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map(company => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="nif">NIF/DNI del Cliente</Label>
          <Input 
            id="nif" 
            value={clientNIF} 
            onChange={e => setClientNIF(e.target.value)} 
            placeholder="Introduce uno o varios DNI separados por comas (ej: 12345678A, 87654321B)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleNIFSubmit();
              }
            }}
          />
          <p className="text-sm text-muted-foreground mt-1">
            • Para un solo DNI: si no existe, podrás crear el cliente<br/>
            • Para múltiples DNIs: solo se crearán visitas para clientes existentes
          </p>
        </div>
        
        <Button onClick={handleNIFSubmit} disabled={loading || !selectedCompany || !location}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Verificar Cliente(s)
        </Button>
        {!location && (
          <p className="text-sm text-amber-600 mt-2">
            ⚠️ Necesitas activar la geolocalización para crear visitas
          </p>
        )}
      </CardContent>
    </Card>;


  const renderClientForm = () => <Card>
      <CardHeader>
        <CardTitle>Nuevo cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nombre_apellidos">Nombre y Apellidos *</Label>
            <Input id="nombre_apellidos" value={clientData.nombre_apellidos} onChange={e => setClientData(prev => ({
            ...prev,
            nombre_apellidos: e.target.value
          }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dni">DNI/NIF</Label>
            <Input id="dni" value={clientData.dni} onChange={e => setClientData(prev => ({
            ...prev,
            dni: e.target.value
          }))} disabled />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="direccion">Dirección *</Label>
          <Input id="direccion" value={clientData.direccion} onChange={e => setClientData(prev => ({
          ...prev,
          direccion: e.target.value
        }))} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="telefono1">Teléfono 1</Label>
            <Input id="telefono1" value={clientData.telefono1} onChange={e => setClientData(prev => ({
            ...prev,
            telefono1: e.target.value
          }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefono2">Teléfono 2</Label>
            <Input id="telefono2" value={clientData.telefono2} onChange={e => setClientData(prev => ({
            ...prev,
            telefono2: e.target.value
          }))} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={clientData.email} onChange={e => setClientData(prev => ({
          ...prev,
          email: e.target.value
        }))} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">Nota</Label>
          <Textarea 
            id="note" 
            value={clientData.note} 
            onChange={e => setClientData(prev => ({
              ...prev,
              note: e.target.value
            }))}
            placeholder="Añade una nota sobre este cliente..."
          />
        </div>

        {location && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Latitud</Label>
              <Input 
                type="text"
                value={formatCoordinates(location.latitude, location.longitude).split(' ')[0]}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Longitud</Label>
              <Input 
                type="text"
                value={formatCoordinates(location.latitude, location.longitude).split(' ')[1]}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>
        )}

        <Button onClick={handleCreateClient} disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Crear cliente y continuar
        </Button>
      </CardContent>
    </Card>;

  const renderVisitForm = () => {
    // Check if visit is completed or rejected (read-only)
    const isReadOnly = currentVisitStatus === 'completed' || currentVisitStatus === 'no_answer' || currentVisitStatus === 'not_interested' || currentVisitStatus === 'postponed';
    
    return (
      <div className="space-y-6">
        {isReadOnly && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 font-medium">📋 Vista de Solo Lectura</p>
            <p className="text-blue-700 text-sm">Esta visita está finalizada y no puede editarse.</p>
          </div>
        )}

        {/* Client Info */}
        {existingClient && hasApproval && <div className="space-y-4">
            <Card className="p-4 bg-green-50 border-green-200">
              <h3 className="font-semibold text-green-800 mb-2">Cliente seleccionado</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-green-700 font-medium">{existingClient.nombre_apellidos}</p>
                  <p className="text-green-600">{existingClient.direccion}</p>
                  {existingClient.dni && <p className="text-green-600">DNI: {existingClient.dni}</p>}
                  {existingClient.telefono1 && <p className="text-green-600">Tel: {existingClient.telefono1}</p>}
                  {existingClient.telefono2 && <p className="text-green-600">Tel 2: {existingClient.telefono2}</p>}
                  {existingClient.note && <p className="text-green-600">Nota: {existingClient.note}</p>}
                  {existingClient.email && <p className="text-green-600">Email: {existingClient.email}</p>}
                </div>
              </div>
            </Card>

            {/* Client Purchase History */}
            {clientPurchases.length > 0 && <Card className="p-4">
                <h4 className="font-semibold mb-3">Últimas compras</h4>
                <div className="space-y-3">
                  {clientPurchases.map(purchase => <div key={purchase.id} className="border-l-2 border-blue-200 pl-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">€{purchase.amount}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(purchase.sale_date).toLocaleDateString()}
                          </p>
                          {purchase.product_description && <p className="text-sm text-gray-500">{purchase.product_description}</p>}
                        </div>
                      </div>
                      {purchase.sale_lines && purchase.sale_lines.length > 0 && <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700">Productos:</p>
                          {purchase.sale_lines.map((line, idx) => <p key={idx} className="text-xs text-gray-600">
                              {line.quantity}x {line.product_name} - €{line.unit_price}
                            </p>)}
                        </div>}
                    </div>)}
                </div>
              </Card>}

            {/* Client Visit History */}
            {clientVisits.length > 0 && <Card className="p-4">
                <h4 className="font-semibold mb-3">Últimas visitas</h4>
                <div className="space-y-3">
                  {clientVisits.map(visit => <div key={visit.id} className="border-l-2 border-purple-200 pl-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {new Date(visit.visit_date).toLocaleDateString()}
                          </p>
                          <span className={`px-2 py-1 rounded text-xs ${visit.status === 'completed' ? 'bg-green-100 text-green-800' : visit.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                            {visit.status}
                          </span>
                        </div>
                        {visit.notes && <p className="text-sm text-gray-600 mt-1">{visit.notes}</p>}
                      </div>
                    </div>)}
                </div>
              </Card>}
        </div>}

        {existingClient && !hasApproval && <Card className="p-4 bg-yellow-50 border-yellow-200">
            <h3 className="font-semibold text-yellow-800 mb-2">Cliente identificado</h3>
            <p className="text-yellow-700">
              {existingClient.nombre_apellidos} - {existingClient.dni}
            </p>
            <p className="text-sm text-yellow-600 mt-1">
              Información histórica no disponible sin aprobación del administrador.
            </p>
          </Card>}

        <Card>
          <CardHeader>
            <CardTitle>Información de la visita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Empresa *</Label>
              <Select 
                value={visitData.company_id || selectedCompany || ''} 
                onValueChange={(value) => setVisitData(prev => ({ ...prev, company_id: value }))}
                required 
                disabled={isReadOnly}
              >
              <SelectTrigger>
                <SelectValue placeholder={companies && companies.length > 0 ? "Selecciona una empresa" : "Cargando empresas..."} />
              </SelectTrigger>
                <SelectContent>
                  {companies && companies.length > 0 ? (
                    companies.map(company => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))
                  ) : null}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas de la Visita *</Label>
              <Textarea 
                id="notes" 
                value={visitData.notes} 
                onChange={(e) => setVisitData(prev => ({ ...prev, notes: e.target.value }))} 
                placeholder="Describe cómo fue la visita..." 
                disabled={isReadOnly}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visitStateCode">Estado de la Visita *</Label>
              <Select 
                value={visitData.visitStateCode} 
                onValueChange={(value) => setVisitData(prev => ({ ...prev, visitStateCode: value }))}
                disabled={isReadOnly}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un estado" />
                </SelectTrigger>
                <SelectContent>
                  {visitStates.map(state => (
                    <SelectItem key={state.code} value={state.code}>
                      {state.name.charAt(0).toUpperCase() + state.name.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                Ubicación registrada: {formatCoordinates(location.latitude, location.longitude)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Ventas Realizadas
              {!isReadOnly && <Button size="sm" onClick={addSaleLine}>
                  <Plus className="w-4 h-4 mr-2" />
                  Añadir producto
                </Button>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {saleLines.length === 0 ? <p className="text-muted-foreground text-center py-4">
                No hay productos añadidos
              </p> : <div className="space-y-4">
                {saleLines.map((line, index) => <div key={index} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <h4 className="font-medium">Producto {index + 1}</h4>
                      {!isReadOnly && <Button size="sm" variant="outline" onClick={() => removeSaleLine(index)}>
                          <Minus className="w-4 h-4" />
                        </Button>}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Producto</Label>
                        <Input value={line.product_name} onChange={e => updateSaleLine(index, 'product_name', e.target.value)} placeholder="Nombre del producto" disabled={isReadOnly} />
                      </div>
                      <div className="space-y-2">
                        <Label>Cantidad</Label>
                        <Input type="number" min="1" value={line.quantity} onChange={e => updateSaleLine(index, 'quantity', parseInt(e.target.value) || 1)} disabled={isReadOnly} />
                      </div>
                      <div className="space-y-2">
                        <Label>Precio Unitario</Label>
                        <Input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => updateSaleLine(index, 'unit_price', parseFloat(e.target.value) || 0)} disabled={isReadOnly} />
                      </div>
                    </div>

                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={line.financiada} onChange={e => updateSaleLine(index, 'financiada', e.target.checked)} disabled={isReadOnly} />
                        <span>Financiada</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={line.transferencia} onChange={e => updateSaleLine(index, 'transferencia', e.target.checked)} disabled={isReadOnly} />
                        <span>Transferencia</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={line.nulo} onChange={e => updateSaleLine(index, 'nulo', e.target.checked)} disabled={isReadOnly} />
                        <span>Nulo</span>
                      </label>
                    </div>

                    <div className="text-right font-medium">
                      Total: €{(line.quantity * line.unit_price).toFixed(2)}
                    </div>
                  </div>)}
                
                <Separator />
                <div className="text-right text-lg font-bold">
                  Total General: €{saleLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0).toFixed(2)}
                </div>
              </div>}
          </CardContent>
        </Card>

        {!isReadOnly && <div className="flex gap-4">
            <Button 
              onClick={() => handleSaveVisit(false)} 
              disabled={loading || !visitData.company_id || !visitData.notes.trim() || !visitData.visitStateCode} 
              variant="outline" 
              className="flex-1"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          <Button 
            onClick={() => handleSaveVisit(true)} 
            disabled={loading || !visitData.company_id || !visitData.notes.trim() || !visitData.visitStateCode} 
            className="flex-1"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Finalizar
          </Button>
        </div>}
        
        {isReadOnly && <div className="text-center py-4">
            <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('navigateToVisitsList'))}>
              Volver a la Lista de Visitas
            </Button>
          </div>}
      </div>
    );
  };

  console.log('=== COMPONENT RENDER ===');
  console.log('currentStep:', currentStep);
  console.log('existingClient:', existingClient);
  console.log('approvalRequestId:', approvalRequestId);
  console.log('hasApproval:', hasApproval);
  console.log('userRole:', userRole);
  return <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Gestión de visitas</h1>
        <p className="text-muted-foreground">
          Registra las visitas a clientes y las ventas realizadas
        </p>
        
      </div>

      {currentStep === 'nif-input' && renderNIFInput()}
      {currentStep === 'client-form' && renderClientForm()}
      {currentStep === 'visit-form' && renderVisitForm()}
    </div>;
}
