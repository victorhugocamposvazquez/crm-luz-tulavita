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

const ClientManagement = lazy(() => import('@/components/dashboard/ClientManagement'));

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