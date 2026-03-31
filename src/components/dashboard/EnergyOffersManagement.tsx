/**
 * Configuración de ofertas energéticas separado por tarifa 2.0TD / 3.0TD.
 * 2.0TD: P1-P2 potencia, precio consumo único.
 * 3.0TD: P1-P6 potencia + P1-P6 precio consumo.
 */

import { useState, useEffect, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Zap, Edit, Plus, Trash2 } from 'lucide-react';

export interface EnergyOfferRow {
  id: string;
  company_name: string;
  p1: number | null;
  p2: number | null;
  p3: number | null;
  p4: number | null;
  p5: number | null;
  p6: number | null;
  price_per_kwh: number;
  price_p1: number | null;
  price_p2: number | null;
  price_p3: number | null;
  price_p4: number | null;
  price_p5: number | null;
  price_p6: number | null;
  monthly_fixed_cost: number;
  active: boolean;
  tarifa_tipo: string;
  created_at: string;
  updated_at: string;
}

const POT_KEYS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
const PRICE_KEYS = ['price_p1', 'price_p2', 'price_p3', 'price_p4', 'price_p5', 'price_p6'] as const;

type OfferNumericKey = typeof POT_KEYS[number] | typeof PRICE_KEYS[number];

export default function EnergyOffersManagement() {
  const [offers, setOffers] = useState<EnergyOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<EnergyOfferRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [formPriceKwh, setFormPriceKwh] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formTarifaTipo, setFormTarifaTipo] = useState<'2.0TD' | '3.0TD'>('2.0TD');
  const [isNew, setIsNew] = useState(false);

  const offers20 = useMemo(() => offers.filter((o) => o.tarifa_tipo === '2.0TD'), [offers]);
  const offers30 = useMemo(() => offers.filter((o) => o.tarifa_tipo === '3.0TD'), [offers]);

  const potPeriodsForTipo = (tipo: string) => tipo === '3.0TD' ? POT_KEYS : POT_KEYS.slice(0, 2);
  const pricePeriodsForTipo = (tipo: string) => tipo === '3.0TD' ? PRICE_KEYS : ([] as typeof PRICE_KEYS[number][]);
  const is30 = (tipo: string) => tipo === '3.0TD';

  const allFieldKeys: OfferNumericKey[] = [...POT_KEYS, ...PRICE_KEYS];

  const fetchOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('energy_offers')
        .select('id, company_name, p1, p2, p3, p4, p5, p6, price_p1, price_p2, price_p3, price_p4, price_p5, price_p6, price_per_kwh, monthly_fixed_cost, active, tarifa_tipo, created_at, updated_at')
        .order('tarifa_tipo')
        .order('company_name');

      if (error) throw error;
      setOffers((data as EnergyOfferRow[]) || []);
    } catch (err: unknown) {
      console.error('Error fetching energy offers:', err);
      toast({ title: 'Error', description: 'No se pudieron cargar las ofertas energéticas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOffers(); }, []);

  const resetFormFields = (offer?: EnergyOfferRow | null) => {
    const vals: Record<string, string> = {};
    for (const k of allFieldKeys) {
      vals[k] = offer && offer[k] != null ? String(offer[k]) : '';
    }
    setFormFields(vals);
  };

  const openEdit = (offer: EnergyOfferRow) => {
    setIsNew(false);
    setEditingOffer(offer);
    setFormName(offer.company_name);
    resetFormFields(offer);
    setFormPriceKwh(String(offer.price_per_kwh));
    setFormActive(offer.active);
    setFormTarifaTipo(offer.tarifa_tipo as '2.0TD' | '3.0TD');
    setDialogOpen(true);
  };

  const openNew = (tipo: '2.0TD' | '3.0TD') => {
    setIsNew(true);
    setEditingOffer(null);
    setFormName('');
    resetFormFields();
    setFormPriceKwh('');
    setFormActive(true);
    setFormTarifaTipo(tipo);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingOffer(null);
    setIsNew(false);
    setFormName('');
    resetFormFields();
    setFormPriceKwh('');
    setFormActive(true);
  };

  const handleDelete = async (offer: EnergyOfferRow) => {
    if (!window.confirm(`¿Eliminar oferta de ${offer.company_name} (${offer.tarifa_tipo})?`)) return;
    try {
      const { error } = await supabase.from('energy_offers').delete().eq('id', offer.id);
      if (error) throw error;
      toast({ title: 'Oferta eliminada' });
      fetchOffers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const parseNum = (s: string): number | null => {
    const n = parseFloat(s.replace(',', '.').trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseNum(formPriceKwh);
    if (!is30(formTarifaTipo) && (price === null || price < 0)) {
      toast({ title: 'Datos inválidos', description: 'Precio consumo debe ser un número ≥ 0', variant: 'destructive' });
      return;
    }
    if (!formName.trim()) {
      toast({ title: 'Datos inválidos', description: 'El nombre de empresa es obligatorio', variant: 'destructive' });
      return;
    }

    const fieldData: Record<string, number | null> = {};
    for (const k of potPeriodsForTipo(formTarifaTipo)) {
      fieldData[k] = parseNum(formFields[k] ?? '') ?? null;
    }
    for (const k of pricePeriodsForTipo(formTarifaTipo)) {
      fieldData[k] = parseNum(formFields[k] ?? '') ?? null;
    }

    const priceKwh = is30(formTarifaTipo)
      ? computeAvgPrice(fieldData)
      : (price ?? 0);

    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from('energy_offers').insert({
          company_name: formName.trim(),
          ...fieldData,
          price_per_kwh: priceKwh,
          active: formActive,
          tarifa_tipo: formTarifaTipo,
        });
        if (error) throw error;
        toast({ title: 'Oferta creada', description: `${formName.trim()} añadida a ${formTarifaTipo}` });
      } else if (editingOffer) {
        const { error } = await supabase
          .from('energy_offers')
          .update({
            company_name: formName.trim(),
            ...fieldData,
            price_per_kwh: priceKwh,
            active: formActive,
          })
          .eq('id', editingOffer.id);
        if (error) throw error;
        toast({ title: 'Oferta actualizada' });
      }
      closeDialog();
      fetchOffers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const computeAvgPrice = (data: Record<string, number | null>): number => {
    const vals = PRICE_KEYS.map((k) => data[k]).filter((v) => v != null) as number[];
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const fmtNum = (v: number | null) => v != null ? Number(v).toFixed(6) : '–';

  const renderTable = (items: EnergyOfferRow[], tipo: '2.0TD' | '3.0TD') => {
    const potPeriods = potPeriodsForTipo(tipo);
    const pricePeriods = pricePeriodsForTipo(tipo);
    const showSinglePrice = !is30(tipo);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Badge variant={tipo === '2.0TD' ? 'default' : 'secondary'}>{tipo}</Badge>
            Tarifas {tipo}
          </h3>
          <Button variant="outline" size="sm" onClick={() => openNew(tipo)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Añadir
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                {potPeriods.map((p) => (
                  <TableHead key={p} className="text-right text-xs">Pot {p.toUpperCase()}</TableHead>
                ))}
                {showSinglePrice ? (
                  <TableHead className="text-right">€/kWh</TableHead>
                ) : (
                  pricePeriods.map((p) => (
                    <TableHead key={p} className="text-right text-xs">€ {p.replace('price_', '').toUpperCase()}</TableHead>
                  ))
                )}
                <TableHead>Activa</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={1 + potPeriods.length + (showSinglePrice ? 1 : pricePeriods.length) + 2} className="text-center text-muted-foreground">
                    No hay ofertas {tipo}. Pulsa "Añadir" para crear una.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell className="font-medium">{offer.company_name}</TableCell>
                    {potPeriods.map((p) => (
                      <TableCell key={p} className="text-right tabular-nums text-xs">{fmtNum(offer[p])}</TableCell>
                    ))}
                    {showSinglePrice ? (
                      <TableCell className="text-right tabular-nums">{Number(offer.price_per_kwh).toFixed(4)}</TableCell>
                    ) : (
                      pricePeriods.map((p) => (
                        <TableCell key={p} className="text-right tabular-nums text-xs">{fmtNum(offer[p])}</TableCell>
                      ))
                    )}
                    <TableCell>{offer.active ? 'Sí' : 'No'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(offer)} aria-label="Editar">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(offer)} aria-label="Eliminar" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const dialogPotPeriods = potPeriodsForTipo(formTarifaTipo);
  const dialogPricePeriods = pricePeriodsForTipo(formTarifaTipo);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Ofertas energéticas
        </CardTitle>
        <CardDescription>
          Comercializadoras y precios usados en las comparaciones del simulador. Solo ofertas activas se usan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : (
          <>
            {renderTable(offers20, '2.0TD')}
            <div className="border-t" />
            {renderTable(offers30, '3.0TD')}
          </>
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent className={is30(formTarifaTipo) ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isNew ? 'Nueva oferta' : 'Editar oferta'}
                <Badge variant={formTarifaTipo === '3.0TD' ? 'secondary' : 'default'}>{formTarifaTipo}</Badge>
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-1">
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

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Término de potencia (€/kW/día)</Label>
                  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${is30(formTarifaTipo) ? 3 : 2}, 1fr)` }}>
                    {dialogPotPeriods.map((p) => (
                      <div key={p} className="grid gap-1">
                        <Label htmlFor={`energy-${p}`} className="text-xs">{p.toUpperCase()}</Label>
                        <Input
                          id={`energy-${p}`}
                          type="text"
                          inputMode="decimal"
                          value={formFields[p] ?? ''}
                          onChange={(e) => setFormFields((prev) => ({ ...prev, [p]: e.target.value }))}
                          placeholder="0.xxxxxx"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {is30(formTarifaTipo) ? (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Precio consumo por periodo (€/kWh)</Label>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                      {dialogPricePeriods.map((p) => (
                        <div key={p} className="grid gap-1">
                          <Label htmlFor={`energy-${p}`} className="text-xs">{p.replace('price_', '').toUpperCase()}</Label>
                          <Input
                            id={`energy-${p}`}
                            type="text"
                            inputMode="decimal"
                            value={formFields[p] ?? ''}
                            onChange={(e) => setFormFields((prev) => ({ ...prev, [p]: e.target.value }))}
                            placeholder="0.xxxxxx"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
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
                )}

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
                  {saving ? 'Guardando...' : isNew ? 'Crear' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
