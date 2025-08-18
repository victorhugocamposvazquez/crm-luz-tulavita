import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, id, email, new_password, user_id } = await req.json()
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let result;

    switch (action) {
      case 'complete_task':
        result = await supabaseClient
          .from('admin_tasks')
          .update({ status: 'completed' })
          .eq('id', id)
        break
      
      
      case 'approve_request':
        console.log('Approving request:', id)
        
        // Get the approval request first
        const approvalQuery = await supabaseClient
          .from('client_approval_requests')
          .select('client_id')
          .eq('id', id)
          .single()

        if (approvalQuery.error) {
          console.error('Error fetching approval:', approvalQuery.error)
          throw approvalQuery.error
        }

        // Update approval request
        const approveResult = await supabaseClient
          .from('client_approval_requests')
          .update({ status: 'approved' })
          .eq('id', id)

        if (approveResult.error) {
          console.error('Error updating approval:', approveResult.error)
          throw approveResult.error
        }

        // Update corresponding visit status to 'in_progress'
        console.log('Updating visit for client_id:', approvalQuery.data.client_id)
        const updateVisitApprove = await supabaseClient
          .from('visits')
          .update({ 
            status: 'in_progress',
            approval_status: 'approved'
          })
          .eq('client_id', approvalQuery.data.client_id)
          .eq('approval_status', 'waiting_admin')

        if (updateVisitApprove.error) {
          console.error('Error updating visit:', updateVisitApprove.error)
        }

        result = { data: { success: true }, error: null }
        break
      
      case 'reject_request':
        console.log('Rejecting request:', id)
        
        // Get the approval request first
        const rejectQuery = await supabaseClient
          .from('client_approval_requests')
          .select('client_id')
          .eq('id', id)
          .single()

        if (rejectQuery.error) {
          console.error('Error fetching approval:', rejectQuery.error)
          throw rejectQuery.error
        }

        // Update approval request
        const rejectResult = await supabaseClient
          .from('client_approval_requests')
          .update({ status: 'rejected' })
          .eq('id', id)

        if (rejectResult.error) {
          console.error('Error updating approval:', rejectResult.error)
          throw rejectResult.error
        }

        // Update corresponding visit approval_status to 'rejected'
        console.log('Updating visit for client_id:', rejectQuery.data.client_id)
        const updateVisitReject = await supabaseClient
          .from('visits')
          .update({ 
            approval_status: 'rejected'
          })
          .eq('client_id', rejectQuery.data.client_id)
          .eq('approval_status', 'waiting_admin')

        if (updateVisitReject.error) {
          console.error('Error updating visit:', updateVisitReject.error)
        }

        result = { data: { success: true }, error: null }
        break
      
      case 'change_user_password':
        {
          console.log('Changing user password');
          // Verify caller is admin
          const supabaseRLS = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
          );
          const { data: authUser } = await supabaseRLS.auth.getUser();
          const callerId = authUser?.user?.id;
          if (!callerId) throw new Error('Unauthorized');
          const { data: roleData, error: roleErr } = await supabaseClient
            .from('user_roles')
            .select('role')
            .eq('user_id', callerId)
            .single();
          if (roleErr || roleData?.role !== 'admin') {
            throw new Error('not_admin');
          }

          let targetId = user_id;
          if (!targetId) {
            if (!email) throw new Error('email or user_id is required');
            const { data: prof, error: profErr } = await supabaseClient
              .from('profiles')
              .select('id')
              .eq('email', email)
              .single();
            if (profErr) throw profErr;
            targetId = prof?.id;
          }
          if (!new_password || new_password.length < 6) {
            throw new Error('Nueva contraseña inválida');
          }
          const { data: upd, error: updateError } = await supabaseClient.auth.admin.updateUserById(targetId, {
            password: new_password,
          });
          if (updateError) throw updateError;
          result = { data: { success: true }, error: null };
          break;
        }
      default:
        throw new Error('Invalid action')
    }

    if (result.error) {
      throw result.error
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})