-- Add approval status to visits
CREATE TYPE public.visit_approval_status AS ENUM ('pending', 'approved', 'rejected', 'waiting_admin');

-- Add approval status column to visits table
ALTER TABLE public.visits ADD COLUMN approval_status public.visit_approval_status DEFAULT 'pending';

-- Add approval admin and approval date columns
ALTER TABLE public.visits ADD COLUMN approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.visits ADD COLUMN approval_date timestamp with time zone;

-- Add batch_id for bulk visit creation
ALTER TABLE public.visits ADD COLUMN batch_id uuid;