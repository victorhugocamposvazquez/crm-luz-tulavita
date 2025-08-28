import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface AdminTask {
  id: string;
  type: 'new_client';
  title: string;
  description: string;
  client_id?: string;
  commercial_id?: string;
  created_at: string;
  status: 'pending' | 'completed';
  client?: {
    nombre_apellidos: string;
  };
  commercial?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface ApprovalRequest {
  id: string;
  client_id: string;
  commercial_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  hasDuplicateToday?: boolean; // New field to track duplicate requests
  client?: {
    nombre_apellidos: string;
  };
  commercial?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export function useRealtimeNotifications() {
  const { user, userRole } = useAuth();
  const [pendingTasks, setPendingTasks] = useState<AdminTask[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);

  const isAdmin = userRole?.role === 'admin';
  const isCommercial = userRole?.role === 'commercial';

  const loadInitialData = async () => {
    if (!isAdmin) return;
    
    // Load pending admin tasks (only new_client type)
    const { data: tasks } = await supabase
      .from('admin_tasks')
      .select(`
        *,
        client:clients(nombre_apellidos),
        commercial:profiles!admin_tasks_commercial_id_fkey(first_name, last_name, email)
      `)
      .eq('status', 'pending')
      .eq('type', 'new_client')
      .order('created_at', { ascending: false });

    if (tasks) {
      setPendingTasks(tasks as AdminTask[]);
    }

    loadPendingApprovals();
  };

  const loadPendingApprovals = async () => {
    if (!isAdmin) return;

    const { data: approvals } = await supabase
      .from('client_approval_requests')
      .select(`
        *,
        client:clients(nombre_apellidos),
        commercial:profiles!client_approval_requests_commercial_id_fkey(first_name, last_name, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (approvals) {
      // Get today's date range
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      // Get all visits for today
      const { data: todaysVisits } = await supabase
        .from('visits')
        .select('client_id')
        .gte('visit_date', startOfDay.toISOString())
        .lt('visit_date', endOfDay.toISOString());
      
      // Count visits per client today
      const clientVisitCounts = new Map<string, number>();
      if (todaysVisits) {
        todaysVisits.forEach(visit => {
          const currentCount = clientVisitCounts.get(visit.client_id) || 0;
          clientVisitCounts.set(visit.client_id, currentCount + 1);
        });
      }
      
      // Mark requests as having duplicates if there are multiple visits for the same client today
      const processedApprovals = approvals.map(approval => {
        const hasDuplicateToday = (clientVisitCounts.get(approval.client_id) || 0) > 1;
        
        return {
          ...approval,
          hasDuplicateToday
        } as ApprovalRequest;
      });
      
      setPendingApprovals(processedApprovals);
    }
  };

  const loadCommercialApprovals = async () => {
    if (!isCommercial) return;

    const { data: approvals } = await supabase
      .from('client_approval_requests')
      .select('*')
      .eq('commercial_id', user?.id)
      .order('created_at', { ascending: false });

    if (approvals) {
      setPendingApprovals(approvals as ApprovalRequest[]);
    }
  };

  useEffect(() => {
    if (!user) return;

    let tasksChannel: any = null;
    let approvalsChannel: any = null;

    // For admins - listen to admin tasks and approval requests
    if (isAdmin) {
      // Load initial data
      loadInitialData();

      // Set up real-time subscription for admin tasks
      tasksChannel = supabase
        .channel('admin-tasks-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'admin_tasks'
          },
          (payload) => {
            console.log('Admin tasks real-time update:', payload);
            if (payload.eventType === 'INSERT') {
              setPendingTasks(prev => [payload.new as AdminTask, ...prev]);
              
              // Show toast notification
              toast({
                title: payload.new.title,
                description: payload.new.description,
              });
            } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
              loadInitialData(); // Refresh data
            }
          }
        )
        .subscribe();

      // Set up real-time subscription for approval requests
      approvalsChannel = supabase
        .channel('approval-requests-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'client_approval_requests'
          },
          (payload) => {
            console.log('Approval requests real-time update:', payload);
            if (payload.eventType === 'INSERT') {
              setPendingApprovals(prev => [payload.new as ApprovalRequest, ...prev]);
            } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
              loadPendingApprovals(); // Refresh approvals
            }
          }
        )
        .subscribe();
    }

    // For commercials - listen to their approval request updates
    if (isCommercial) {
      // Load their own approval requests
      loadCommercialApprovals();

      approvalsChannel = supabase
        .channel('commercial-approvals-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'client_approval_requests',
            filter: `commercial_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Commercial approval update:', payload);
            if (payload.new.status !== 'pending') {
              toast({
                title: payload.new.status === 'approved' ? "Acceso aprobado" : "Acceso denegado",
                description: payload.new.status === 'approved' 
                  ? "Tu solicitud de acceso al cliente ha sido aprobada"
                  : "Tu solicitud de acceso al cliente ha sido denegada",
              });
            }
            loadCommercialApprovals(); // Refresh
          }
        )
        .subscribe();
    }

    // Cleanup function
    return () => {
      if (tasksChannel) {
        supabase.removeChannel(tasksChannel);
      }
      if (approvalsChannel) {
        supabase.removeChannel(approvalsChannel);
      }
    };
  }, [user, userRole]);

  const approveClientAccess = async (requestId: string) => {
    try {
      console.log('Attempting to approve request via Edge Function:', requestId);
      
      // Actualizar estado local inmediatamente para UI responsiva
      setPendingApprovals(prev => prev.filter(req => req.id !== requestId));
      
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'approve_request',
          id: requestId
        }
      });

      console.log('Edge Function response:', { data, error });

      if (error) {
        // Revertir cambio local si hay error
        loadPendingApprovals();
        throw error;
      }

      toast({
        title: "Acceso aprobado",
        description: "El comercial ya puede acceder a la información del cliente",
      });
    } catch (error) {
      console.error('Error approving request:', error);
      toast({
        title: "Error",
        description: "No se pudo aprobar la solicitud",
        variant: "destructive",
      });
    }
  };

  const rejectClientAccess = async (requestId: string) => {
    try {
      console.log('Attempting to reject request via Edge Function:', requestId);
      
      // Actualizar estado local inmediatamente para UI responsiva
      setPendingApprovals(prev => prev.filter(req => req.id !== requestId));
      
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'reject_request',
          id: requestId
        }
      });

      if (error) {
        // Revertir cambio local si hay error
        loadPendingApprovals();
        throw error;
      }

      toast({
        title: "Acceso rechazado",
        description: "Se ha denegado el acceso a la información del cliente",
      });
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast({
        title: "Error",
        description: "No se pudo rechazar la solicitud",
        variant: "destructive",
      });
    }
  };

  const markTaskCompleted = async (taskId: string) => {
    try {
      console.log('Attempting to mark task completed via Edge Function:', taskId);
      
      // Actualizar estado local inmediatamente para UI responsiva
      setPendingTasks(prev => prev.filter(task => task.id !== taskId));
      
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          action: 'complete_task',
          id: taskId
        }
      });

      console.log('Edge Function response:', { data, error });

      if (error) {
        // Revertir cambio local si hay error
        loadInitialData();
        throw error;
      }

      console.log('Task marked as completed successfully');
    } catch (error) {
      console.error('Error marking task completed:', error);
      toast({
        title: "Error",
        description: "No se pudo marcar la tarea como completada",
        variant: "destructive",
      });
    }
  };

  const approveAllRequests = async () => {
    if (pendingApprovals.length === 0) return;

    try {
      const requestCount = pendingApprovals.length;
      
      // Actualizar estado local inmediatamente para UI responsiva
      setPendingApprovals([]);
      
      const promises = pendingApprovals.map(request => 
        supabase.functions.invoke('admin-actions', {
          body: {
            action: 'approve_request',
            id: request.id
          }
        })
      );

      await Promise.all(promises);

      toast({
        title: "Todas las solicitudes aprobadas",
        description: `Se aprobaron ${requestCount} solicitudes de acceso`,
      });
    } catch (error) {
      console.error('Error approving all requests:', error);
      // Recargar en caso de error
      loadPendingApprovals();
      toast({
        title: "Error",
        description: "No se pudieron aprobar todas las solicitudes",
        variant: "destructive",
      });
    }
  };

  const rejectAllRequests = async () => {
    if (pendingApprovals.length === 0) return;

    try {
      const requestCount = pendingApprovals.length;
      
      // Actualizar estado local inmediatamente para UI responsiva
      setPendingApprovals([]);
      
      const promises = pendingApprovals.map(request => 
        supabase.functions.invoke('admin-actions', {
          body: {
            action: 'reject_request',
            id: request.id
          }
        })
      );

      await Promise.all(promises);

      toast({
        title: "Todas las solicitudes rechazadas",
        description: `Se rechazaron ${requestCount} solicitudes de acceso`,
      });
    } catch (error) {
      console.error('Error rejecting all requests:', error);
      // Recargar en caso de error
      loadPendingApprovals();
      toast({
        title: "Error",
        description: "No se pudieron rechazar todas las solicitudes",
        variant: "destructive",
      });
    }
  };

  return {
    pendingTasks,
    pendingApprovals,
    approveClientAccess,
    rejectClientAccess,
    markTaskCompleted,
    approveAllRequests,
    rejectAllRequests,
  };
}