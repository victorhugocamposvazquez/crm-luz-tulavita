import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import UserManagement from '@/components/dashboard/UserManagement';
import CompanyManagement from '@/components/dashboard/CompanyManagement';
import UnifiedVisitsManagement from '@/components/dashboard/UnifiedVisitsManagement';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import CommercialVisitsManager from '@/components/dashboard/CommercialVisitsManager';
import CommercialStatistics from '@/components/dashboard/CommercialStatistics';
import AdminVisitsView from '@/components/dashboard/AdminVisitsView';
import RemindersManagement from '@/components/reminders/RemindersManagement';
import LeadsManagement from '@/components/dashboard/LeadsManagement';
import EnergyOffersManagement from '@/components/dashboard/EnergyOffersManagement';
import InvoiceSimulator from '@/components/dashboard/InvoiceSimulator';

const ClientManagement = lazy(() => import('@/components/dashboard/ClientManagement'));
const InvoiceEstimateSettingsManagement = lazy(() => import('@/components/dashboard/InvoiceEstimateSettingsManagement'));

export default function Dashboard() {
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!user) {
    return null;
  }

  const renderView = () => {
    const isAdmin = userRole?.role === 'admin';
    
    switch (currentView) {
      case 'dashboard':
        return isAdmin ? <AdminDashboard /> : <CommercialVisitsManager />;
      case 'leads':
        return <LeadsManagement />;
      case 'users':
        return isAdmin ? <UserManagement /> : <CommercialVisitsManager />;
      case 'companies':
        return isAdmin ? <CompanyManagement /> : <CommercialVisitsManager />;
      case 'clients':
        return isAdmin ? (
          <Suspense fallback={<div>Cargando cliente...</div>}>
            <ClientManagement />
          </Suspense>
        ) : <CommercialVisitsManager />;
      case 'visits':
        return isAdmin ? <AdminVisitsView /> : <CommercialVisitsManager />;
      case 'reminders':
        return isAdmin ? <RemindersManagement /> : <CommercialVisitsManager />;
      case 'energy-offers':
        return isAdmin ? <EnergyOffersManagement /> : <CommercialVisitsManager />;
      case 'invoice-simulator':
        return isAdmin ? <InvoiceSimulator /> : <CommercialVisitsManager />;
      case 'invoice-estimate-settings':
        return isAdmin ? (
          <Suspense fallback={<div className="p-6">Cargando…</div>}>
            <InvoiceEstimateSettingsManagement />
          </Suspense>
        ) : <CommercialVisitsManager />;
      case 'stats':
        return <CommercialStatistics />;
      default:
        return isAdmin ? <UnifiedVisitsManagement /> : <CommercialVisitsManager />;
    }
  };

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {renderView()}
    </Layout>
  );
}