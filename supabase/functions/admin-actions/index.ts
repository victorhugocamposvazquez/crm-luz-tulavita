import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Get the allowed origins for CORS
const getAllowedOrigin = (requestOrigin: string | null) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'https://lovable.dev',
    'https://crm.ilustracioneslarum.com', // Tu dominio personalizado
    'https://crm.virvita.es',
    /^https:\/\/.*\.lovable\.dev$/,
    /^https:\/\/.*\.lovable\.app$/,
    /^https:\/\/.*\.sandbox\.lovable\.dev$/,
    /^https:\/\/.*\.vercel\.app$/,
  ];
  
  if (!requestOrigin) return null;
  
  for (const origin of allowedOrigins) {
    if (typeof origin === 'string') {
      if (requestOrigin === origin) return requestOrigin;
    } else if (origin instanceof RegExp) {
      if (origin.test(requestOrigin)) return requestOrigin;
    }
  }
  
  return null;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Get the origin for CORS
  const origin = req.headers.get('origin');
  const allowedOrigin = getAllowedOrigin(origin);
  
  const dynamicCorsHeaders = {
    ...corsHeaders,
    'Access-Control-Allow-Origin': allowedOrigin || 'null'
  };
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: dynamicCorsHeaders })
  }

  try {
    const requestBody = await req.json();
    const { action, id, email, new_password, user_id, first_name, last_name, password, role, company_id } = requestBody;
    
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
      
      case 'create_user':
        {
          console.log('Creating user');
          
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

          // Validate required fields
          if (!email || !password) {
            throw new Error('Email y contraseña son requeridos');
          }
          
          if (password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres');
          }

          if (!role || !['admin', 'commercial'].includes(role)) {
            throw new Error('Rol inválido');
          }

          // Create the user
          const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              first_name: first_name || '',
              last_name: last_name || ''
            }
          });

          if (createError) {
            console.error('Error creating user:', createError);
            throw createError;
          }

          if (!newUser.user?.id) {
            throw new Error('Error al crear el usuario');
          }

          // Update profile (created by trigger)
          const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({
              first_name: first_name || '',
              last_name: last_name || '',
              company_id: company_id === 'none' ? null : company_id
            })
            .eq('id', newUser.user.id);

          if (profileError) {
            console.error('Error creating profile:', profileError);
            // If profile creation fails, delete the user
            await supabaseClient.auth.admin.deleteUser(newUser.user.id);
            throw profileError;
          }

          // Assign role
          const { error: roleError } = await supabaseClient
            .from('user_roles')
            .insert({
              user_id: newUser.user.id,
              role: role
            });

          if (roleError) {
            console.error('Error assigning role:', roleError);
            // If role assignment fails, delete the user and profile
            await supabaseClient.auth.admin.deleteUser(newUser.user.id);
            throw roleError;
          }

          result = { 
            data: { 
              success: true, 
              user: {
                id: newUser.user.id,
                email: newUser.user.email
              }
            }, 
            error: null 
          };
          break;
        }
      
      case 'create_admin_user':
        {
          console.log('Creating admin user');
          
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

          // Validate required fields
          if (!email || !password) {
            throw new Error('Email y contraseña son requeridos');
          }
          
          if (password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres');
          }

          // Create the user
          const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              first_name: first_name || '',
              last_name: last_name || ''
            }
          });

          if (createError) {
            console.error('Error creating user:', createError);
            throw createError;
          }

          if (!newUser.user?.id) {
            throw new Error('Error al crear el usuario');
          }

          // Update profile (created by trigger)
          const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({
              first_name: first_name || '',
              last_name: last_name || ''
            })
            .eq('id', newUser.user.id);

          if (profileError) {
            console.error('Error creating profile:', profileError);
            // If profile creation fails, delete the user
            await supabaseClient.auth.admin.deleteUser(newUser.user.id);
            throw profileError;
          }

          // Assign admin role
          const { error: roleError } = await supabaseClient
            .from('user_roles')
            .insert({
              user_id: newUser.user.id,
              role: 'admin'
            });

          if (roleError) {
            console.error('Error assigning role:', roleError);
            // If role assignment fails, delete the user and profile
            await supabaseClient.auth.admin.deleteUser(newUser.user.id);
            throw roleError;
          }

          result = { 
            data: { 
              success: true, 
              user: {
                id: newUser.user.id,
                email: newUser.user.email
              }
            }, 
            error: null 
          };
          break;
        }
      
      case 'delete_user':
        {
          console.log('Deleting user');
          
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

          if (!user_id) {
            throw new Error('user_id es requerido');
          }

          // Delete the user
          const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(user_id);
          
          if (deleteError) {
            console.error('Error deleting user:', deleteError);
            throw deleteError;
          }

          result = { 
            data: { success: true }, 
            error: null 
          };
          break;
        }
      
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
        headers: { ...dynamicCorsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...dynamicCorsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})