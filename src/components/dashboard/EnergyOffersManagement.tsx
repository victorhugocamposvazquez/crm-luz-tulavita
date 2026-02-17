/**
 * Configuración de ofertas energéticas: Nombre, P1, P2, Precio consumo.
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
  p1: number | null;
  p2: number | null;
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
  const [formP1, setFormP1] = useState('');
  const [formP2, setFormP2] = useState('');
  const [formPriceKwh, setFormPriceKwh] = useState('');
  const [formActive, setFormActive] = useState(true);

  const fetchOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('energy_offers')
        .select('id, company_name, p1, p2, price_per_kwh, monthly_fixed_cost, active, created_at, updated_at')
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
    setFormP1(offer.p1 != null ? String(offer.p1) : '');
    setFormP2(offer.p2 != null ? String(offer.p2) : '');
    setFormPriceKwh(String(offer.price_per_kwh));
    setFormActive(offer.active);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingOffer(null);
    setFormName('');
    setFormP1('');
    setFormP2('');
    setFormPriceKwh('');
    setFormActive(true);
  };

  const parseNum = (s: string): number | null => {
    const n = parseFloat(s.replace(',', '.').trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOffer) return;
    const price = parseNum(formPriceKwh);
    if (price === null || price < 0) {
      toast({
        title: 'Datos inválidos',
        description: 'Precio consumo debe ser un número ≥ 0',
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
          p1: parseNum(formP1) ?? null,
          p2: parseNum(formP2) ?? null,
          price_per_kwh: price,
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
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">P1</TableHead>
                <TableHead className="text-right">P2</TableHead>
                <TableHead className="text-right">Precio consumo (€/kWh)</TableHead>
                <TableHead>Activa</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay ofertas. Ejecuta la migración con seed o añade una.
                  </TableCell>
                </TableRow>
              ) : (
                offers.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell className="font-medium">{offer.company_name}</TableCell>
                    <TableCell className="text-right">{offer.p1 != null ? Number(offer.p1).toFixed(4) : '–'}</TableCell>
                    <TableCell className="text-right">{offer.p2 != null ? Number(offer.p2).toFixed(4) : '–'}</TableCell>
                    <TableCell className="text-right">{Number(offer.price_per_kwh).toFixed(4)}</TableCell>
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
                  <Label htmlFor="energy-company-name">Nombre empresa</Label>
                  <Input
                    id="energy-company-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. Iberdrola"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="energy-p1">P1</Label>
                    <Input
                      id="energy-p1"
                      type="text"
                      inputMode="decimal"
                      value={formP1}
                      onChange={(e) => setFormP1(e.target.value)}
                      placeholder="0.xxxxx"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="energy-p2">P2</Label>
                    <Input
                      id="energy-p2"
                      type="text"
                      inputMode="decimal"
                      value={formP2}
                      onChange={(e) => setFormP2(e.target.value)}
                      placeholder="0.xxxxx"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="energy-price-kwh">Precio consumo (€/kWh)</Label>
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
