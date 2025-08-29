import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface ClientFiltersProps {
  filters: {
    nombre: string;
    dni: string;
    localidad: string;
    codigo_postal: string;
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
      
      <div className="grid grid-cols-12 gap-2">
        <Input
          placeholder="Nombre..."
          value={filters.nombre}
          onChange={(e) => onFilterChange('nombre', e.target.value)}
          className="h-8 text-sm col-span-3"
        />
        
        <Input
          placeholder="DNI..."
          value={filters.dni}
          onChange={(e) => onFilterChange('dni', e.target.value)}
          className="h-8 text-sm col-span-1"
        />
        
        <Input
          placeholder="Localidad..."
          value={filters.localidad}
          onChange={(e) => onFilterChange('localidad', e.target.value)}
          className="h-8 text-sm col-span-2"
        />
        
        <Input
          placeholder="CP..."
          value={filters.codigo_postal}
          onChange={(e) => onFilterChange('codigo_postal', e.target.value)}
          className="h-8 text-sm col-span-1"
        />
        
        <Input
          placeholder="Teléfono..."
          value={filters.telefono}
          onChange={(e) => onFilterChange('telefono', e.target.value)}
          className="h-8 text-sm col-span-2"
        />
        
        <Input
          placeholder="Email..."
          value={filters.email}
          onChange={(e) => onFilterChange('email', e.target.value)}
          className="h-8 text-sm col-span-2"
        />

        <Select value={filters.status || "all"} onValueChange={(value) => onFilterChange('status', value === 'all' ? '' : value)}>
          <SelectTrigger className="h-8 text-sm col-span-1">
            <SelectValue placeholder="Estado..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}