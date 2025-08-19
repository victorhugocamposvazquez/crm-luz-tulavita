import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (user) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/auth', { replace: true });
      }
    }
  }, [user, loading, navigate]);

  // Show loading spinner while determining where to redirect
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div>Cargando...</div>
    </div>
  );
};

export default Index;
