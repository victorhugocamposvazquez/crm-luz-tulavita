import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import AuthPage from "@/components/AuthPage";
import LeadLanding from "./pages/LeadLanding";
import AhorroLuz from "./pages/AhorroLuz";
import NotFound from "./pages/NotFound";

const HazteColaborador = lazy(() => import("./pages/HazteColaborador"));
const ColaboradorPortalAcceso = lazy(() => import("./pages/ColaboradorPortalAcceso"));
const ColaboradorPortalPanel = lazy(() => import("./pages/ColaboradorPortal"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/lead" element={<LeadLanding />} />
            <Route path="/ahorra-factura-luz" element={<AhorroLuz />} />
            <Route
              path="/hazte-colaborador"
              element={
                <Suspense fallback={null}>
                  <HazteColaborador />
                </Suspense>
              }
            />
            <Route path="/colaboradores" element={<Navigate to="/hazte-colaborador" replace />} />
            <Route path="/colaboradores/hibrida" element={<Navigate to="/hazte-colaborador" replace />} />
            <Route
              path="/colaborador/acceso"
              element={
                <Suspense fallback={null}>
                  <ColaboradorPortalAcceso />
                </Suspense>
              }
            />
            <Route
              path="/colaborador/panel"
              element={
                <Suspense fallback={null}>
                  <ColaboradorPortalPanel />
                </Suspense>
              }
            />
            <Route path="/colaborador" element={<Navigate to="/colaborador/acceso" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
