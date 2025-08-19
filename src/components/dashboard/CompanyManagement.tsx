import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Building2, Edit, Trash2 } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  created_at: string;
  _count?: {
    profiles: number;
    clients: number;
  };
}

export default function CompanyManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (error) throw error;

      // Get counts for each company
      const companiesWithCounts = await Promise.all(
        (data || []).map(async (company) => {
          const [profilesCount, clientsCount] = await Promise.all([
            supabase
              .from('profiles')
              .select('id', { count: 'exact' })
              .eq('company_id', company.id),
            supabase
              .from('clients')
              .select('id', { count: 'exact' })
          ]);

          return {
            ...company,
            _count: {
              profiles: profilesCount.count || 0,
              clients: clientsCount.count || 0,
            }
          };
        })
      );

      setCompanies(companiesWithCounts);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las empresas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    try {
      if (editingCompany) {
        const { error } = await supabase
          .from('companies')
          .update({ name })
          .eq('id', editingCompany.id);

        if (error) throw error;

        toast({
          title: "Empresa actualizada",
          description: "La empresa ha sido actualizada exitosamente",
        });
      } else {
        const { error } = await supabase
          .from('companies')
          .insert({ name });

        if (error) throw error;

        toast({
          title: "Empresa creada",
          description: "La empresa ha sido creada exitosamente",
        });
      }

      setDialogOpen(false);
      setEditingCompany(null);
      fetchCompanies();
    } catch (error: any) {
      console.error('Error saving company:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la empresa",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (companyId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta empresa? Todos los usuarios y clientes asociados quedarán sin empresa.')) return;

    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId);

      if (error) throw error;

      toast({
        title: "Empresa eliminada",
        description: "La empresa ha sido eliminada exitosamente",
      });

      fetchCompanies();
    } catch (error: any) {
      console.error('Error deleting company:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la empresa",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div>Cargando empresas...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Gestión de empresas</h2>
          <p className="text-muted-foreground">Administra las empresas del holding</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingCompany(null)}>
              <Building2 className="mr-2 h-4 w-4" />
              Nueva empresa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? 'Editar empresa' : 'Crear nueva empresa'}
              </DialogTitle>
              <DialogDescription>
                {editingCompany ? 'Modifica los datos de la empresa' : 'Crea una nueva empresa en el holding'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre de la Empresa</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    defaultValue={editingCompany?.name || ''}
                    placeholder="Introduce el nombre de la empresa"
                    required 
                  />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingCompany ? 'Actualizar' : 'Crear empresa'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empresas registradas</CardTitle>
          <CardDescription>
            Lista de todas las empresas del holding
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Clientes</TableHead>
                <TableHead>Fecha de Creación</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell>{company._count?.profiles || 0}</TableCell>
                  <TableCell>{company._count?.clients || 0}</TableCell>
                  <TableCell>
                    {new Date(company.created_at).toLocaleDateString('es-ES')}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditingCompany(company);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}