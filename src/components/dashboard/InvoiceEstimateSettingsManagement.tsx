import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, Percent, Save } from 'lucide-react';
import { getFallbackInvoiceEstimateTaxConfig, rowToInvoiceEstimateTaxConfig } from '@/config/invoiceEstimateTaxes';

const SETTINGS_ID = 1;

export default function InvoiceEstimateSettingsManagement() {
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [electricityTaxPct, setElectricityTaxPct] = useState('');
  const [vatPct, setVatPct] = useState('');
  const [fixedPerDay, setFixedPerDay] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_estimate_settings')
        .select('electricity_tax_rate, vat_rate, fixed_charges_eur_per_day, updated_at')
        .eq('id', SETTINGS_ID)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const c = rowToInvoiceEstimateTaxConfig(data);
        setElectricityTaxPct(String((c.electricityTaxRate * 100).toFixed(6)));
        setVatPct(String((c.vatRate * 100).toFixed(2)));
        setFixedPerDay(String(c.fixedChargesEurPerDay));
        setUpdatedAt(data.updated_at);
      } else {
        const fb = getFallbackInvoiceEstimateTaxConfig();
        setElectricityTaxPct(String((fb.electricityTaxRate * 100).toFixed(6)));
        setVatPct(String((fb.vatRate * 100).toFixed(2)));
        setFixedPerDay(String(fb.fixedChargesEurPerDay));
        setUpdatedAt(null);
        toast({
          title: 'Sin fila en base de datos',
          description: 'Ejecuta migraciones Supabase o revisa la tabla invoice_estimate_settings.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error(err);
      const fb = getFallbackInvoiceEstimateTaxConfig();
      setElectricityTaxPct(String((fb.electricityTaxRate * 100).toFixed(6)));
      setVatPct(String((fb.vatRate * 100).toFixed(2)));
      setFixedPerDay(String(fb.fixedChargesEurPerDay));
      toast({
        title: 'Error al cargar',
        description: err instanceof Error ? err.message : 'No se pudieron leer los ajustes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const parsePctToRate = (s: string): number | null => {
    const n = Number(String(s).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return n / 100;
  };

  const parseFixed = (s: string): number | null => {
    const n = Number(String(s).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const handleSave = async () => {
    if (userRole?.role !== 'admin') {
      toast({ title: 'Sin permiso', description: 'Solo administradores', variant: 'destructive' });
      return;
    }

    const ie = parsePctToRate(electricityTaxPct);
    const vat = parsePctToRate(vatPct);
    const fixed = parseFixed(fixedPerDay);

    if (ie == null || vat == null || fixed == null) {
      toast({
        title: 'Valores no válidos',
        description: 'Revisa porcentajes (0–100) y cargos fijos (≥ 0).',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('invoice_estimate_settings')
        .update({
          electricity_tax_rate: ie,
          vat_rate: vat,
          fixed_charges_eur_per_day: fixed,
        })
        .eq('id', SETTINGS_ID);

      if (error) throw error;
      toast({ title: 'Ajustes guardados', description: 'El simulador usará estos coeficientes al recargar o al abrir de nuevo.' });
      await load();
    } catch (err) {
      toast({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'No se pudo actualizar',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Cargando ajustes…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Percent className="h-6 w-6" />
          Ajustes del simulador de facturas
        </h2>
        <p className="text-muted-foreground mt-1">
          Coeficientes para la estimación «≈ Factura» (impuesto eléctrico, IVA y cargos fijos por día). Actualízalos cuando cambie la normativa o las tarifas de acceso.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coeficientes</CardTitle>
          <CardDescription>
            El impuesto eléctrico se aplica sobre la suma energía + potencia. El IVA sobre la base que incluye ese impuesto y los cargos fijos × días del periodo.
            {updatedAt && (
              <span className="block mt-2 text-xs">
                Última actualización: {new Date(updatedAt).toLocaleString('es-ES')}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ie-pct">Impuesto eléctrico (%)</Label>
            <Input
              id="ie-pct"
              inputMode="decimal"
              value={electricityTaxPct}
              onChange={(e) => setElectricityTaxPct(e.target.value)}
              placeholder="5.112697"
            />
            <p className="text-xs text-muted-foreground">Fracción legal sobre término energía + potencia (orientativo ~5,11%).</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat-pct">IVA (%)</Label>
            <Input
              id="vat-pct"
              inputMode="decimal"
              value={vatPct}
              onChange={(e) => setVatPct(e.target.value)}
              placeholder="21"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fixed-day">Cargos fijos (€ / día)</Label>
            <Input
              id="fixed-day"
              inputMode="decimal"
              value={fixedPerDay}
              onChange={(e) => setFixedPerDay(e.target.value)}
              placeholder="0.211"
            />
            <p className="text-xs text-muted-foreground">Orden de magnitud: alquiler contador + financiación bono social (tu plantilla Excel ~6,54 € en 31 d.).</p>
          </div>
          <Button onClick={handleSave} disabled={saving || userRole?.role !== 'admin'}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
