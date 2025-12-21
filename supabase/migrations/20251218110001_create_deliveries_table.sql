CREATE TABLE public.deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE NOT NULL,
  delivery_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (visit_id)
);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_deliveries_updated_at 
  BEFORE UPDATE ON public.deliveries 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_deliveries_visit_id ON public.deliveries(visit_id);
CREATE INDEX idx_deliveries_delivery_id ON public.deliveries(delivery_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE INDEX idx_deliveries_created_by ON public.deliveries(created_by);

CREATE POLICY "Admins can manage all deliveries" 
ON public.deliveries 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Delivery users can view their assigned deliveries" 
ON public.deliveries 
FOR SELECT 
USING (delivery_id = auth.uid());

CREATE POLICY "Delivery users can update their assigned deliveries" 
ON public.deliveries 
FOR UPDATE 
USING (delivery_id = auth.uid());

CREATE POLICY "Delivery users can view visits assigned to them" 
ON public.visits 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d 
    WHERE d.visit_id = visits.id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can update visits assigned to them" 
ON public.visits 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d 
    WHERE d.visit_id = visits.id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can view sales of assigned visits" 
ON public.sales 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d 
    WHERE d.visit_id = sales.visit_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can create sales for assigned visits" 
ON public.sales 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deliveries d 
    WHERE d.visit_id = sales.visit_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can update sales of assigned visits" 
ON public.sales 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d 
    WHERE d.visit_id = sales.visit_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can view sale_lines of assigned visits" 
ON public.sale_lines 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.sales s
    JOIN public.deliveries d ON d.visit_id = s.visit_id
    WHERE s.id = sale_lines.sale_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can create sale_lines for assigned visits" 
ON public.sale_lines 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales s
    JOIN public.deliveries d ON d.visit_id = s.visit_id
    WHERE s.id = sale_lines.sale_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can update sale_lines of assigned visits" 
ON public.sale_lines 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.sales s
    JOIN public.deliveries d ON d.visit_id = s.visit_id
    WHERE s.id = sale_lines.sale_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can view clients of assigned visits" 
ON public.clients 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.visits v
    JOIN public.deliveries d ON d.visit_id = v.id
    WHERE v.client_id = clients.id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can view visit_progress_history of assigned visits" 
ON public.visit_progress_history 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d 
    WHERE d.visit_id = visit_progress_history.visit_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can create visit_progress_history for assigned visits" 
ON public.visit_progress_history 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deliveries d 
    WHERE d.visit_id = visit_progress_history.visit_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (id = auth.uid() AND has_role(auth.uid(), 'delivery'::app_role));

CREATE POLICY "Delivery users can view sale_lines_products of assigned visits" 
ON public.sale_lines_products 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.sale_lines sl
    JOIN public.sales s ON s.id = sl.sale_id
    JOIN public.deliveries d ON d.visit_id = s.visit_id
    WHERE sl.id = sale_lines_products.sale_line_id 
    AND d.delivery_id = auth.uid()
  )
);

CREATE POLICY "Delivery users can create sale_lines_products for assigned visits" 
ON public.sale_lines_products 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sale_lines sl
    JOIN public.sales s ON s.id = sl.sale_id
    JOIN public.deliveries d ON d.visit_id = s.visit_id
    WHERE sl.id = sale_lines_products.sale_line_id 
    AND d.delivery_id = auth.uid()
  )
);
