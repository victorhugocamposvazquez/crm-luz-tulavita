import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Users, Building2, MapPin, TrendingUp, LogOut, Menu, User, ChevronDown, Key, Bell, Navigation } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import AdminPasswordDialog from '@/components/AdminPasswordDialog';
import AdminNotifications from '@/components/dashboard/AdminNotifications';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
}

export default function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { signOut, profile, userRole } = useAuth();
  const { pendingTasks, pendingApprovals } = useRealtimeNotifications();
  const { location, loading: geoLoading, hasPermission, requestLocation } = useGeolocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = userRole?.role === 'admin';
  const isCommercial = userRole?.role === 'commercial';
  const totalNotifications = pendingTasks.length + pendingApprovals.length;
  
  // El botón GPS solo debe aparecer para comerciales cuando no hay geolocalización
  const showGpsButton = isCommercial && !location && !geoLoading;

  const navigation = isAdmin ? [
    { name: 'Dashboard', icon: TrendingUp, view: 'dashboard' },
    { name: 'Usuarios', icon: Users, view: 'users' },
    { name: 'Empresas', icon: Building2, view: 'companies' },
    { name: 'Clientes', icon: Users, view: 'clients' },
/*     { name: 'Albaranes', icon: Users, view: 'albaranes' }, */
    { name: 'Visitas', icon: MapPin, view: 'visits' },
    { name: 'Recordatorios', icon: Bell, view: 'reminders' },
  ] : [
    { name: 'Estadísticas', icon: TrendingUp, view: 'stats' },
    { name: 'Visitas', icon: MapPin, view: 'visits' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile menu button */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center space-x-2">
            <span>Backoffice</span>
            {showGpsButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={requestLocation}
                disabled={geoLoading}
                className="relative animate-gps-pulse hover:animate-none h-6 w-6 p-0"
                title="Activar geolocalización"
              >
                <Navigation className="h-4 w-4 text-amber-500" />
              </Button>
            )}
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-sm font-medium">
                {profile?.first_name} {profile?.last_name}
              </div>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {profile?.email}
              </div>
              <DropdownMenuSeparator />
              <AdminPasswordDialog
                userEmail=""
                userName=""
                trigger={
                  <DropdownMenuItem 
                    className="text-blue-600"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <Key className="mr-2 h-4 w-4" />
                    Cambiar contraseña
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex flex-col h-full">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold">Backoffice</h1>
                  {showGpsButton && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={requestLocation}
                      disabled={geoLoading}
                      className="relative animate-gps-pulse hover:animate-none"
                      title="Activar geolocalización"
                    >
                      <Navigation className="h-4 w-4 text-amber-500" />
                    </Button>
                  )}
                </div>
                {isAdmin && totalNotifications > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="relative">
                        <Bell className="h-4 w-4" />
                        <Badge 
                          variant="destructive" 
                          className="absolute -top-1 -right-1 h-5 w-5 text-xs p-0 flex items-center justify-center"
                        >
                          {totalNotifications}
                        </Badge>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-0" align="start">
                      <div className="p-4 border-b">
                        <h3 className="font-semibold">Notificaciones</h3>
                        <p className="text-sm text-muted-foreground">{totalNotifications} pendientes</p>
                      </div>
                      <AdminNotifications />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              
              {/* User dropdown moved here for all users */}
              <div className="mt-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4" />
                        <span className="truncate">
                          {profile?.first_name} {profile?.last_name}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5 text-sm font-medium">
                      {profile?.email}
                    </div>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {userRole?.role === 'admin' ? 'Administrador' : 'Comercial'}
                    </div>
                    <DropdownMenuSeparator />
                    <AdminPasswordDialog
                      userEmail=""
                      userName=""
                      trigger={
                        <DropdownMenuItem 
                          className="text-blue-600"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          Cambiar contraseña
                        </DropdownMenuItem>
                      }
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      Cerrar Sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            <nav className="flex-1 p-4 space-y-2">
              {navigation.map((item) => (
                <Button
                  key={item.view}
                  variant={currentView === item.view ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    onViewChange(item.view);
                    setSidebarOpen(false);
                  }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
                </Button>
              ))}
            </nav>
          </div>
        </div>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <div className="flex-1 lg:ml-0">
          <main className="p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}