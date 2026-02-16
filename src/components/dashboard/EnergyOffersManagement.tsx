/**
 * Configuración de ofertas energéticas (comercializadoras) para el cálculo de ahorro.
 * Solo visible para admin. Campos: company_name, price_per_kwh, monthly_fixed_cost, active.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Zap, Edit } from 'lucide-react';

export interface EnergyOfferRow {
  id: string;
  company_name: string;
  price_per_kwh: number;
  monthly_fixed_cost: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export default function EnergyOffersManagement() {
  const [offers, setOffers] = useState<EnergyOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<EnergyOfferRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPriceKwh, setFormPriceKwh] = useState('');
  const [formFixedCost, setFormFixedCost] = useState('');
  const [formActive, setFormActive] = useState(true);

  const fetchOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('energy_offers')
        .select('id, company_name, price_per_kwh, monthly_fixed_cost, active, created_at, updated_at')
        .order('company_name');

      if (error) throw error;
      setOffers((data as EnergyOfferRow[]) || []);
    } catch (err: unknown) {
      console.error('Error fetching energy offers:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las ofertas energéticas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const openEdit = (offer: EnergyOfferRow) => {
    setEditingOffer(offer);
    setFormName(offer.company_name);
    setFormPriceKwh(String(offer.price_per_kwh));
    setFormFixedCost(String(offer.monthly_fixed_cost));
    setFormActive(offer.active);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingOffer(null);
    setFormName('');
    setFormPriceKwh('');
    setFormFixedCost('');
    setFormActive(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOffer) return;
    const price = parseFloat(formPriceKwh.replace(',', '.'));
    const fixed = parseFloat(formFixedCost.replace(',', '.'));
    if (Number.isNaN(price) || price < 0 || Number.isNaN(fixed) || fixed < 0) {
      toast({
        title: 'Datos inválidos',
        description: 'Precio por kWh y coste fijo deben ser números ≥ 0',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('energy_offers')
        .update({
          company_name: formName.trim(),
          price_per_kwh: price,
          monthly_fixed_cost: fixed,
          active: formActive,
        })
        .eq('id', editingOffer.id);

      if (error) throw error;
      toast({
        title: 'Oferta actualizada',
        description: 'Los datos de la comercializadora se han guardado.',
      });
      closeDialog();
      fetchOffers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar';
      toast({
        title: 'Error',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Ofertas energéticas
        </CardTitle>
        <CardDescription>
          Comercializadoras y precios usados para calcular el ahorro en la landing. Solo ofertas activas se usan en las comparaciones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comercializadora</TableHead>
                <TableHead className="text-right">Precio kWh (€)</TableHead>
                <TableHead className="text-right">Coste fijo mensual (€)</TableHead>
                <TableHead>Activa</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay ofertas. Ejecuta la migración con seed o añade una.
                  </TableCell>
                </TableRow>
              ) : (
                offers.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell className="font-medium">{offer.company_name}</TableCell>
                    <TableCell className="text-right">{Number(offer.price_per_kwh).toFixed(4)}</TableCell>
                    <TableCell className="text-right">{Number(offer.monthly_fixed_cost).toFixed(2)}</TableCell>
                    <TableCell>{offer.active ? 'Sí' : 'No'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(offer)} aria-label="Editar">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar oferta energética</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="energy-company-name">Comercializadora</Label>
                  <Input
                    id="energy-company-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. Iberdrola"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="energy-price-kwh">Precio por kWh (€)</Label>
                  <Input
                    id="energy-price-kwh"
                    type="text"
                    inputMode="decimal"
                    value={formPriceKwh}
                    onChange={(e) => setFormPriceKwh(e.target.value)}
                    placeholder="0.145"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="energy-fixed-cost">Coste fijo mensual (€)</Label>
                  <Input
                    id="energy-fixed-cost"
                    type="text"
                    inputMode="decimal"
                    value={formFixedCost}
                    onChange={(e) => setFormFixedCost(e.target.value)}
                    placeholder="5.50"
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="energy-active"
                    checked={formActive}
                    onCheckedChange={setFormActive}
                  />
                  <Label htmlFor="energy-active">Incluir en comparaciones</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
