import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface ClientFiltersProps {
  filters: {
    nombre: string;
    dni: string;
    direccion: string;
    telefono: string;
    email: string;
    status: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

export default function ClientFilters({ filters, onFilterChange, onClearFilters }: ClientFiltersProps) {
  const hasActiveFilters = Object.values(filters).some(value => value.trim() !== '');

  return (
    <div className="bg-muted/30 px-4 py-3 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4" />
          <Label className="text-sm font-medium">Filtros</Label>
        </div>
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Input
          placeholder="Nombre..."
          value={filters.nombre}
          onChange={(e) => onFilterChange('nombre', e.target.value)}
          className="h-8 text-sm"
        />
        
        <Input
          placeholder="DNI..."
          value={filters.dni}
          onChange={(e) => onFilterChange('dni', e.target.value)}
          className="h-8 text-sm"
        />
        
        <Input
          placeholder="Dirección..."
          value={filters.direccion}
          onChange={(e) => onFilterChange('direccion', e.target.value)}
          className="h-8 text-sm"
        />
        
        <Input
          placeholder="Teléfono..."
          value={filters.telefono}
          onChange={(e) => onFilterChange('telefono', e.target.value)}
          className="h-8 text-sm"
        />
        
        <Input
          placeholder="Email..."
          value={filters.email}
          onChange={(e) => onFilterChange('email', e.target.value)}
          className="h-8 text-sm"
        />

        <Select value={filters.status} onValueChange={(value) => onFilterChange('status', value)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Estado..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}