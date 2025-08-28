-- Drop the existing foreign key constraint
ALTER TABLE client_approval_requests 
DROP CONSTRAINT IF EXISTS client_approval_requests_client_id_fkey;

-- Add the foreign key constraint with CASCADE delete
ALTER TABLE client_approval_requests 
ADD CONSTRAINT client_approval_requests_client_id_fkey 
FOREIGN KEY (client_id) 
REFERENCES clients(id) 
ON DELETE CASCADE;