-- Add foreign key constraints with CASCADE DELETE to handle client deletion
ALTER TABLE admin_tasks 
DROP CONSTRAINT IF EXISTS admin_tasks_client_id_fkey;

ALTER TABLE admin_tasks 
ADD CONSTRAINT admin_tasks_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Add similar cascading deletes for other tables
ALTER TABLE visits 
DROP CONSTRAINT IF EXISTS visits_client_id_fkey;

ALTER TABLE visits 
ADD CONSTRAINT visits_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE sales 
DROP CONSTRAINT IF EXISTS sales_client_id_fkey;

ALTER TABLE sales 
ADD CONSTRAINT sales_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Also fix the RLS policy for sales to allow creation when commercial_id matches auth.uid() and is from same company
DROP POLICY IF EXISTS "Commercials can create their own sales" ON sales;

CREATE POLICY "Commercials can create their own sales" ON sales
FOR INSERT 
WITH CHECK (
  commercial_id = auth.uid() 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR company_id = get_user_company(auth.uid())
  )
);