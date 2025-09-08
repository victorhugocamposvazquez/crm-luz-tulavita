import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
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
import { normalizeDNI, normalizeClientData, validateDNI } from '@/lib/clientUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Client {
  id: string;
  nombre_apellidos: string;
  dni: string;
  direccion: string;
  localidad: string;
  codigo_postal: string;
  telefono1?: string;
  telefono2?: string;
  email?: string;
  note?: string;
  latitude?: number;
  longitude?: number;
  prospect?: boolean;
}

interface Company {
  id: string;
  name: string;
}

interface SaleLineProduct {
  product_name: string;
}

interface SaleLine {
  type: 'product' | 'pack';
  products: SaleLineProduct[];
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
    products: SaleLineProduct[];
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

type WorkflowStep = 'nif-input' | 'client-form' | 'visit-form';

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
  
  const [selectedCompany, setSelectedCompany] = useState('');
  
  // No DNI mode state
  const [noDNIMode, setNoDNIMode] = useState(false);
  const [fullName, setFullName] = useState('');

  // Form data
  const [clientData, setClientData] = useState({
    nombre_apellidos: '',
    dni: '',
    direccion: '',
    localidad: '',
    codigo_postal: '',
    telefono1: '',
    telefono2: '',
    email: '',
    note: '',
    prospect: false
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

    // Check for continue visit data in sessionStorage (rehydration-safe)
    const continueVisitData = sessionStorage.getItem('continueVisitData');
    if (continueVisitData) {
      console.log('=== FOUND CONTINUE VISIT DATA IN SESSION STORAGE ===');
      const data = JSON.parse(continueVisitData);
      console.log('Visit data:', data);

      // DO NOT clear here; keep until visit is finalized or user leaves voluntarily
      // sessionStorage.removeItem('continueVisitData');

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

  // Debug lifecycle: mount/unmount and key state changes
  useEffect(() => {
    console.log('[UVM] MOUNT');
    return () => {
      console.log('[UVM] UNMOUNT');
    };
  }, []);

  useEffect(() => {
    console.log('[UVM] currentStep changed:', currentStep);
    if (currentStep === 'nif-input') {
      console.log('[UVM] currentStep is nif-input. existingClient:', existingClient, 'editingVisitId:', editingVisitId);
    }
  }, [currentStep, existingClient, editingVisitId]);

  useEffect(() => {
    console.log('[UVM] editingVisitId changed:', editingVisitId);
  }, [editingVisitId]);

  // Debug: Log companies state
  useEffect(() => {
    console.log('Companies loaded:', companies);
  }, [companies]);


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
        } = await supabase.from('sale_lines').select(`
          quantity, unit_price,
          sale_lines_products(product_name)
        `).eq('sale_id', sale.id);
        
        if (linesError) {
          console.error('Sale lines fetch error:', linesError);
        }
        
        return {
          ...sale,
          sale_lines: linesError ? [] : (linesData || []).map(line => ({
            products: line.sale_lines_products || [],
            quantity: line.quantity,
            unit_price: line.unit_price
          }))
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
      } = await supabase.from('sales').select('id').eq('visit_id', visitId).maybeSingle();
      
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

        // Load sale lines for this sale with their products
        const {
          data: saleLinesData,
          error: saleLinesError
        } = await supabase.from('sale_lines').select(`
          id, quantity, unit_price, financiada, transferencia, nulo,
          sale_lines_products(product_name)
        `).eq('sale_id', saleId);
        
        if (saleLinesError) {
          console.error('Error fetching sale lines:', saleLinesError);
          return;
        }
        
        if (saleLinesData && saleLinesData.length > 0) {
          const formattedSaleLines = saleLinesData.map(line => ({
            type: line.sale_lines_products && line.sale_lines_products.length > 1 ? 'pack' as const : 'product' as const,
            products: line.sale_lines_products || [],
            quantity: line.quantity,
            unit_price: line.unit_price,
            financiada: line.financiada,
            transferencia: line.transferencia,
            nulo: line.nulo
          }));
          console.log('Loaded existing sale lines:', formattedSaleLines);
          setSaleLines(formattedSaleLines);
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
      // Handle multiple DNIs vs single DNI
      if (nifs.length > 1) {
        setMultipleNIFs(nifs);
        await handleMultipleDNIs(nifs);
      } else {
        await handleSingleDNI(nifs[0]);
      }
    } catch (error) {
      console.error('Error in handleNIFSubmit:', error);
      toast({
        title: "Error",
        description: "Error procesando los DNI",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNameSubmit = async () => {
    if (!fullName.trim()) {
      toast({
        title: "Error",
        description: "Introduce nombre y apellidos completo",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      // Search for existing client by name (normalized)
      const normalizedFullName = fullName.trim().toUpperCase();
      console.log('Searching for client by name:', normalizedFullName);
      
      const { data: existingClients, error } = await supabase
        .from('clients')
        .select('*')
        .eq('nombre_apellidos', normalizedFullName);

      if (error) throw error;
      
      if (existingClients && existingClients.length > 0) {
        console.log('Found existing client by name:', existingClients[0]);
        const client = existingClients[0];
        setExistingClient(client);
        
        // Always create the visit in database immediately
        if (!user?.id || !selectedCompany) {
          throw new Error('Usuario o empresa no válidos');
        }

        // Create the visit in database
        const { data: visitResult, error: visitError } = await supabase
          .from('visits')
          .insert({
            client_id: client.id,
            commercial_id: user.id,
            company_id: selectedCompany,
            status: 'in_progress' as Database['public']['Enums']['visit_status'],
            approval_status: 'approved',
            permission: 'approved',
            notes: '',
            latitude: location?.latitude || null,
            longitude: location?.longitude || null,
            location_accuracy: location?.accuracy || null,
            visit_date: new Date().toISOString()
          })
          .select('id')
          .single();

        if (visitError) throw visitError;

        // Reset form and navigate to visits list
        setClientNIF('');
        setFullName('');
        setSelectedCompany('');
        setNoDNIMode(false);
        setCurrentStep('nif-input');
        
        window.dispatchEvent(new CustomEvent('visitCreated', { detail: visitResult }));
        window.dispatchEvent(new CustomEvent('navigateToVisitsList'));
        
        toast({
          title: "Visita creada",
          description: "Cliente encontrado. Visita creada exitosamente.",
        });
      } else {
        // No client found, prepare for prospect creation
        console.log('No client found by name, creating prospect');
        setClientData(prev => ({
          ...prev,
          nombre_apellidos: normalizedFullName,
          dni: '', // Will be empty for prospects
          prospect: true
        }));
        setCurrentStep('client-form');
      }
    } catch (error) {
      console.error('Error searching by name:', error);
      toast({
        title: "Error",
        description: "Error al buscar el cliente",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSingleDNI = async (dniInput: string) => {
    const normalizedDNI = normalizeDNI(dniInput);
    if (!normalizedDNI || !validateDNI(dniInput)) {
      toast({
        title: "Error",
        description: "DNI inválido. Debe tener al menos 8 caracteres y contener al menos una letra",
        variant: "destructive"
      });
      return;
    }
    
    const { data: clientData, error } = await supabase
      .from('clients')
      .select('*')
      .eq('dni', normalizedDNI)
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
        return;
      }
      
      // Always create visit immediately for existing client
      if (!user?.id || !selectedCompany) {
        toast({
          title: "Error",
          description: "Selecciona una empresa antes de crear la visita",
          variant: "destructive"
        });
        return;
      }

      // Create the visit in database
      const { data: visitResult, error: visitError } = await supabase
        .from('visits')
        .insert({
          client_id: clientData.id,
          commercial_id: user.id,
          company_id: selectedCompany,
          status: 'in_progress' as Database['public']['Enums']['visit_status'],
          approval_status: 'approved',
          permission: 'approved',
          notes: '',
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          location_accuracy: location?.accuracy || null,
          visit_date: new Date().toISOString()
        })
        .select('id')
        .single();

      if (visitError) throw visitError;

      // Reset form and navigate to visits list
      setClientNIF('');
      setSelectedCompany('');
      setCurrentStep('nif-input');
      
      window.dispatchEvent(new CustomEvent('visitCreated', { detail: visitResult }));
      window.dispatchEvent(new CustomEvent('navigateToVisitsList'));

      toast({
        title: "Visita creada",
        description: "Visita creada exitosamente para el cliente existente.",
      });
    } else {
      // Client doesn't exist, create new
      setClientData(prev => ({
        ...prev,
        dni: normalizedDNI
      }));
      setCurrentStep('client-form');
    }
  };

  const handleMultipleDNIs = async (nifs: string[]) => {
    if (!selectedCompany) {
      toast({
        title: "Error", 
        description: "Selecciona una empresa antes de crear visitas en lote",
        variant: "destructive"
      });
      return;
    }

    // Normalize and validate all DNIs before search
    const validNIFs = nifs.filter(nif => validateDNI(nif));
    const normalizedNIFs = validNIFs.map(nif => normalizeDNI(nif)).filter(Boolean) as string[];
    
    const invalidCount = nifs.length - validNIFs.length;
    if (invalidCount > 0) {
      toast({
        title: "DNIs inválidos detectados",
        description: `${invalidCount} DNI(s) no cumplen los requisitos (mínimo 8 caracteres con al menos una letra) y fueron omitidos`,
        variant: "destructive"
      });
    }
    
    if (normalizedNIFs.length === 0) {
      toast({
        title: "Error",
        description: "No se encontraron DNIs válidos",
        variant: "destructive"
      });
      return;
    }

    const { data: existingClients, error: clientError } = await supabase
      .from('clients')
      .select('id, dni, nombre_apellidos, status')
      .in('dni', normalizedNIFs);

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
    const missingNIFs = normalizedNIFs.filter(nif => !existingNIFs.includes(nif));

    // Create visits for existing active clients
    if (activeClients && activeClients.length > 0) {
      const batchId = crypto.randomUUID();
      const visitPromises = activeClients.map(client => {
        return supabase
          .from('visits')
          .insert({
            client_id: client.id,
            commercial_id: user!.id,
            company_id: selectedCompany,
            status: 'in_progress' as Database['public']['Enums']['visit_status'],
            notes: 'Visita creada en lote',
            latitude: location?.latitude || null,
            longitude: location?.longitude || null,
            location_accuracy: location?.accuracy || null,
            visit_date: new Date().toISOString(),
            approval_status: 'approved' as const,
            permission: 'approved',
            batch_id: batchId
          });
      });

      await Promise.all(visitPromises);
      
      toast({
        title: "Visitas creadas",
        description: `Se crearon ${activeClients.length} visitas para clientes existentes`
      });
    }

    if (missingNIFs.length > 0) {
      toast({
        title: "Sin clientes encontrados",
        description: `No se encontraron clientes para ${missingNIFs.length} DNI(s): ${missingNIFs.slice(0, 3).join(', ')}${missingNIFs.length > 3 ? '...' : ''}`,
        variant: "destructive"
      });
    }

    // Reset form and redirect to visits list for bulk creation
    setClientNIF('');
    setSelectedCompany('');
    setCurrentStep('nif-input');
    
    // Redirect to visits list after bulk creation immediately
    window.dispatchEvent(new CustomEvent('navigateToVisitsList'));
  };


  const handleCreateClient = async () => {
    console.log('Creating client with data:', clientData);
    
    // Validate form data
    if (!clientData.nombre_apellidos || !clientData.direccion || !clientData.localidad) {
      toast({
        title: "Error",
        description: "Completa los campos obligatorios: Nombre, Dirección y Localidad",
        variant: "destructive"
      });
      return;
    }
    
    // Validate DNI if provided (for non-prospects)
    if (!clientData.prospect && clientData.dni && !validateDNI(clientData.dni)) {
      toast({
        title: "Error",
        description: "El DNI debe tener al menos 8 caracteres y contener al menos una letra",
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
       const rawClientPayload = {
         ...clientData,
         dni: clientData.prospect ? null : clientData.dni, // Set DNI to null for prospects
         latitude: location?.latitude || null,
         longitude: location?.longitude || null
       };
       
       // Normalize client data before inserting (but handle null DNI correctly)
       const clientPayload = clientData.prospect 
         ? { ...rawClientPayload, dni: null } 
         : normalizeClientData(rawClientPayload);
       
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
        title: clientData.prospect ? "Prospecto y visita creados" : "Cliente y visita creados",
        description: clientData.prospect 
          ? "Prospecto registrado exitosamente y visita creada automáticamente" 
          : "Cliente registrado exitosamente y visita creada automáticamente"
      });
      
      // Dispatch events to navigate back to visits list (same pattern as when completing a visit)
      window.dispatchEvent(new CustomEvent('visitCreated', { detail: newVisit }));
      window.dispatchEvent(new CustomEvent('navigateToVisitsList'));
      // Clear any persisted continue visit data since this is a new completed creation
      sessionStorage.removeItem('continueVisitData');
      
    } catch (error: any) {
      console.error('Error creating client:', error);
      let errorMessage = "Error al crear el cliente";
      
      // Check for DNI duplicate error
      if (error?.message?.includes('duplicate key') || error?.code === '23505') {
        errorMessage = "Ya existe otro usuario con ese mismo DNI";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addSaleLinePack = () => {
    setSaleLines([...saleLines, {
      type: 'pack',
      products: [{ product_name: '' }, { product_name: '' }],
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

  const updateSaleLine = (index: number, field: string, value: any) => {
    const newSaleLines = [...saleLines];
    (newSaleLines[index] as any)[field] = value;
    setSaleLines(newSaleLines);
  };

  const handleSaveVisit = async (isComplete: boolean = false) => {
    console.log('handleSaveVisit called with isComplete:', isComplete);
    console.log('Current visitData:', visitData);
    console.log('Current saleLines:', saleLines);
    
    // Validate required fields
    if (!visitData.company_id || !visitData.notes.trim() || !visitData.visitStateCode) {
      toast({
        title: "Error",
        description: "Completa todos los campos obligatorios: Empresa, Notas y Estado de la Visita",
        variant: "destructive"
      });
      return;
    }

    if (!existingClient) {
      toast({
        title: "Error",
        description: "No hay cliente seleccionado",
        variant: "destructive"
      });
      return;
    }

    if (!location) {
      toast({
        title: "Error",
        description: "Ubicación requerida para guardar la visita",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      console.log('Starting visit save process...');
      
      let visit;
      
      if (editingVisitId) {
        console.log('Updating existing visit:', editingVisitId);
        // Update existing visit
        const { data: updatedVisit, error: visitError } = await supabase
          .from('visits')
          .update({
            notes: visitData.notes,
            visit_state_code: visitData.visitStateCode,
            company_id: visitData.company_id,
            status: (isComplete ? 'completed' : currentVisitStatus || 'in_progress') as Database['public']['Enums']['visit_status'],
            updated_at: new Date().toISOString()
          })
          .eq('id', editingVisitId)
          .select()
          .single();
        
        if (visitError) throw visitError;
        visit = updatedVisit;
        console.log('Visit updated successfully:', visit);
      } else {
        console.log('Creating new visit...');
        // Create new visit
        const visitPayload = {
          client_id: existingClient.id,
          commercial_id: user!.id,
          company_id: visitData.company_id,
          notes: visitData.notes,
          visit_state_code: visitData.visitStateCode,
          status: isComplete ? 'completed' : 'in_progress',
          latitude: location.latitude,
          longitude: location.longitude,
          location_accuracy: location.accuracy || null,
          visit_date: new Date().toISOString(),
          approval_status: hasApproval ? 'approved' : 'pending',
          permission: hasApproval ? 'approved' : 'pending'
        };

        const { data: newVisit, error: visitError } = await supabase
          .from('visits')
          .insert(visitPayload as any)
          .select()
          .single();
        
        if (visitError) throw visitError;
        visit = newVisit;
        console.log('New visit created:', visit);
      }

      // Handle sales if there are any
      if (saleLines.length > 0) {
        console.log('Processing sale lines...');
        
        // Calculate total amount
        const totalAmount = saleLines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
        console.log('Total sale amount:', totalAmount);
        
        let saleId;
        
        if (editingVisitId) {
          // Check if sale already exists for this visit
          const { data: existingSale, error: saleCheckError } = await supabase
            .from('sales')
            .select('id')
            .eq('visit_id', editingVisitId)
            .maybeSingle();
          
          if (saleCheckError && saleCheckError.code !== 'PGRST116') {
            throw saleCheckError;
          }
          
          if (existingSale) {
            console.log('Updating existing sale:', existingSale.id);
            // Update existing sale
            const { data: updatedSale, error: saleError } = await supabase
              .from('sales')
              .update({
                amount: totalAmount,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingSale.id)
              .select()
              .single();
            
            if (saleError) throw saleError;
            saleId = updatedSale.id;
            
            // Delete existing sale lines
            await supabase
              .from('sale_lines_products')
              .delete()
              .in('sale_line_id', 
                await supabase
                  .from('sale_lines')
                  .select('id')
                  .eq('sale_id', saleId)
                  .then(({ data }) => (data || []).map(sl => sl.id))
              );
            
            await supabase
              .from('sale_lines')
              .delete()
              .eq('sale_id', saleId);
          } else {
            // Create new sale for existing visit
            console.log('Creating new sale for existing visit...');
            const { data: newSale, error: saleError } = await supabase
              .from('sales')
              .insert({
                client_id: existingClient.id,
                commercial_id: user!.id,
                company_id: visitData.company_id,
                amount: totalAmount,
                visit_id: visit.id,
                latitude: location.latitude,
                longitude: location.longitude,
                location_accuracy: location.accuracy || null
              })
              .select()
              .single();
            
            if (saleError) throw saleError;
            saleId = newSale.id;
          }
        } else {
          // Create new sale for new visit
          console.log('Creating new sale...');
          const { data: newSale, error: saleError } = await supabase
            .from('sales')
            .insert({
              client_id: existingClient.id,
              commercial_id: user!.id,
              company_id: visitData.company_id,
              amount: totalAmount,
              visit_id: visit.id,
              latitude: location.latitude,
              longitude: location.longitude,
              location_accuracy: location.accuracy || null
            })
            .select()
            .single();
          
          if (saleError) throw saleError;
          saleId = newSale.id;
        }

        // Create sale lines
        console.log('Creating sale lines...');
        for (const [index, line] of saleLines.entries()) {
          const lineTotal = line.quantity * line.unit_price;
          
          const { data: saleLine, error: lineError } = await supabase
            .from('sale_lines')
            .insert({
              sale_id: saleId,
              quantity: line.quantity,
              unit_price: line.unit_price,
              line_total: lineTotal,
              financiada: line.financiada,
              transferencia: line.transferencia,
              nulo: line.nulo
            })
            .select()
            .single();
          
          if (lineError) throw lineError;
          console.log('Sale line created:', saleLine);
          
          // Create products for this line
          for (const product of line.products) {
            if (product.product_name.trim()) {
              const { error: productError } = await supabase
                .from('sale_lines_products')
                .insert({
                  sale_line_id: saleLine.id,
                  product_name: product.product_name.trim()
                });
              
              if (productError) throw productError;
              console.log('Product created for line:', product.product_name);
            }
          }
        }
      }

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
        // Clear persisted continue data on successful completion
        sessionStorage.removeItem('continueVisitData');
        setCurrentStep('nif-input');
        setClientNIF('');
        setExistingClient(null);
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
        
        {!noDNIMode ? (
          <>
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
            
            <div className="flex gap-2">
              <Button onClick={handleNIFSubmit} disabled={loading || !selectedCompany || !location} className="flex-1">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Verificar Cliente(s)
              </Button>
              <Button 
                onClick={() => setNoDNIMode(true)} 
                variant="outline"
                disabled={loading || !selectedCompany || !location}
              >
                No tengo DNI
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="full-name">Nombre y Apellidos Completo *</Label>
              <Input 
                id="full-name" 
                value={fullName} 
                onChange={e => setFullName(e.target.value)} 
                placeholder="Introduce el nombre y apellidos completo"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNameSubmit();
                  }
                }}
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleNameSubmit} 
                disabled={loading || !selectedCompany || !location || !fullName.trim()}
                className="flex-1"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Buscar Cliente
              </Button>
              <Button 
                onClick={() => {
                  setNoDNIMode(false);
                  setFullName('');
                }} 
                variant="outline"
                disabled={loading}
              >
                Volver
              </Button>
            </div>
          </>
        )}
        
        {!location && (
          <p className="text-sm text-amber-600 mt-2">
            ⚠️ Necesitas activar la geolocalización para crear visitas
          </p>
        )}
      </CardContent>
    </Card>;

  const renderClientForm = () => <Card>
      <CardHeader>
        <CardTitle>{clientData.prospect ? 'Nuevo prospecto' : 'Nuevo cliente'}</CardTitle>
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
            <Label htmlFor="dni">DNI/NIF {clientData.prospect && '(Opcional para prospectos)'}</Label>
            <Input 
              id="dni" 
              value={clientData.dni} 
              onChange={e => setClientData(prev => ({
                ...prev,
                dni: e.target.value
              }))} 
              disabled={clientData.prospect}
              placeholder={clientData.prospect ? 'No requerido para prospectos' : 'Introduce el DNI'}
            />
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
            <Label htmlFor="localidad">Localidad *</Label>
            <Input id="localidad" value={clientData.localidad} onChange={e => setClientData(prev => ({
            ...prev,
            localidad: e.target.value
          }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codigo_postal">Código Postal</Label>
            <Input id="codigo_postal" value={clientData.codigo_postal} onChange={e => setClientData(prev => ({
            ...prev,
            codigo_postal: e.target.value
          }))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="telefono1">Teléfono Principal</Label>
            <Input id="telefono1" value={clientData.telefono1} onChange={e => setClientData(prev => ({
            ...prev,
            telefono1: e.target.value
          }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefono2">Teléfono Secundario</Label>
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
          <Textarea id="note" value={clientData.note} onChange={e => setClientData(prev => ({
          ...prev,
          note: e.target.value
        }))} rows={3} />
        </div>

        {location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            Ubicación registrada: {formatCoordinates(location.latitude, location.longitude)}
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setCurrentStep('nif-input')} disabled={loading}>
            Volver
          </Button>
          <Button onClick={handleCreateClient} disabled={loading || !location} className="flex-1">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {clientData.prospect ? 'Crear Prospecto y Visita' : 'Crear Cliente y Visita'}
          </Button>
        </div>

        {!location && (
          <p className="text-sm text-amber-600">
            ⚠️ Necesitas activar la geolocalización para crear el cliente
          </p>
        )}
      </CardContent>
    </Card>;


  const renderVisitForm = () => <div className="space-y-6">
        {/* Client Info Display */}
        {existingClient && hasApproval && <div className="space-y-4">
            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-semibold text-green-800">Información del Cliente</h4>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                  Aprobado
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-green-800 font-medium">{existingClient.nombre_apellidos}</p>
                {(() => {
                  const fullAddress = [
                    existingClient.direccion,
                    existingClient.localidad,
                    existingClient.codigo_postal
                  ]
                    .filter(Boolean)
                    .join(', ');
                  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
                  return (
                    <p className="text-green-600">
                      <a 
                        href={mapsUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline underline"
                      >
                        {fullAddress}
                      </a>
                    </p>
                  );
                })()}
                {existingClient.latitude && existingClient.longitude && (
                  <p className="text-green-600">
                    Coordenadas: 
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${existingClient.latitude},${existingClient.longitude}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:underline underline ml-1"
                    >
                      {formatCoordinates(existingClient.latitude, existingClient.longitude)}
                    </a>
                  </p>
                )}
                {existingClient.dni && <p className="text-green-600">DNI: {existingClient.dni}</p>}
                {existingClient.telefono1 && <p className="text-green-600">Tel: {existingClient.telefono1}</p>}
                {existingClient.telefono2 && <p className="text-green-600">Tel 2: {existingClient.telefono2}</p>}
                {existingClient.note && <p className="text-green-600">Nota: {existingClient.note}</p>}
                {existingClient.email && <p className="text-green-600">Email: {existingClient.email}</p>}
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
                           {purchase.sale_lines.map((line, idx) => (
                             <div key={idx} className="text-xs text-gray-600">
                               {line.quantity}x (
                               {line.products.map(p => p.product_name).join(', ') || 'Sin productos'}
                               ) - €{line.unit_price}
                             </div>
                           ))}
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
                onChange={(e) => {
                  const next = { ...visitData, notes: e.target.value };
                  setVisitData(next);
                  try {
                    const persisted = sessionStorage.getItem('continueVisitData');
                    if (persisted) {
                      const data = JSON.parse(persisted);
                      sessionStorage.setItem('continueVisitData', JSON.stringify({
                        ...data,
                        draft: {
                          visitData: next,
                          saleLines,
                          hasApproval,
                          editingVisitId
                        }
                      }));
                    }
                  } catch {}
                }} 
                placeholder="Describe cómo fue la visita..." 
                disabled={isReadOnly}
                required
                rows={8}
                autoFocus
                className="min-h-[200px]"
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
              {!isReadOnly && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={addSaleLinePack}>
                    <Plus className="w-4 h-4 mr-2" />
                    Añadir Pack
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {saleLines.length === 0 ? <p className="text-muted-foreground text-center py-4">
                No hay productos añadidos
              </p> : <div className="space-y-4">
                {saleLines.map((line, index) => <div key={index} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">
                          {line.type === 'product' ? `Producto ${index + 1}` : `Pack ${index + 1}`}
                        </h4>
                        <span className={`px-2 py-1 rounded text-xs ${
                          line.type === 'product' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {line.type === 'product' ? 'Producto' : 'Pack'}
                        </span>
                      </div>
                      {!isReadOnly && <Button size="sm" variant="outline" onClick={() => removeSaleLine(index)}>
                          <Minus className="w-4 h-4" />
                        </Button>}
                    </div>

                    {line.type === 'product' ? (
                      // Formulario para producto individual
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Nombre del Producto</Label>
                          <Input 
                            value={line.products[0]?.product_name || ''} 
                            onChange={e => {
                              const newProducts = [{ product_name: e.target.value }];
                              updateSaleLine(index, 'products', newProducts);
                            }} 
                            placeholder="Nombre del producto" 
                            disabled={isReadOnly} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Cantidad</Label>
                          <Input 
                            type="number" 
                            min="1" 
                            value={line.quantity} 
                            onChange={e => updateSaleLine(index, 'quantity', parseInt(e.target.value) || 1)} 
                            disabled={isReadOnly} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Precio Total</Label>
                          <Input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            value={line.unit_price} 
                            onChange={e => updateSaleLine(index, 'unit_price', parseFloat(e.target.value) || 0)} 
                            disabled={isReadOnly} 
                          />
                        </div>
                      </div>
                    ) : (
                      // Formulario para pack
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Productos del Pack</Label>
                          <div className="space-y-2">
                            {line.products.map((product, productIndex) => (
                              <div key={productIndex} className="flex gap-2">
                                <Input 
                                  value={product.product_name} 
                                  onChange={e => {
                                    const newProducts = [...line.products];
                                    newProducts[productIndex] = { product_name: e.target.value };
                                    updateSaleLine(index, 'products', newProducts);
                                  }} 
                                  placeholder="Nombre del producto" 
                                  disabled={isReadOnly} 
                                />
                                {!isReadOnly && line.products.length > 1 && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => {
                                      const newProducts = line.products.filter((_, i) => i !== productIndex);
                                      updateSaleLine(index, 'products', newProducts);
                                    }}
                                  >
                                    <Minus className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            {!isReadOnly && (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => {
                                  const newProducts = [...line.products, { product_name: '' }];
                                  updateSaleLine(index, 'products', newProducts);
                                }}
                              >
                                <Plus className="w-4 h-4" /> Añadir Producto al Pack
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Precio total del pack</Label>
                          <Input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            value={line.unit_price} 
                            onChange={e => updateSaleLine(index, 'unit_price', parseFloat(e.target.value) || 0)} 
                            disabled={isReadOnly} 
                          />
                        </div>
                      </div>
                    )}

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
            Finalizar Visita
          </Button>
        </div>}
      </div>;

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
