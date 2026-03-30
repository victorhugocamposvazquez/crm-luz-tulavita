import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import {
  Upload,
  FileText,
  Loader2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  TrendingDown,
  Building2,
  User,
  Calendar,
  Gauge,
  Euro,
  Hash,
} from 'lucide-react';

const SIMULATE_API = import.meta.env.VITE_SIMULATE_INVOICE_API_URL ?? '/api/simulate-invoice';
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp';
const MAX_SIZE_MB = 20;

// ---------- types (mirrored from server for frontend use) ----------

interface InvoiceExtraction {
  company_name: string | null;
  consumption_kwh: number | null;
  total_factura: number | null;
  period_start: string | null;
  period_end: string | null;
  period_months: number;
  confidence: number;
  potencia_contratada_kw: number | null;
  potencia_p1_kw: number | null;
  potencia_p2_kw: number | null;
  potencia_p3_kw: number | null;
  precio_energia_kwh: number | null;
  precio_p1_kwh: number | null;
  precio_p2_kwh: number | null;
  precio_p3_kwh: number | null;
  tipo_tarifa: string | null;
  cups: string | null;
  titular: string | null;
}

interface EnergyOffer {
  id: string;
  company_name: string;
  p1: number | null;
  p2: number | null;
  price_per_kwh: number;
  monthly_fixed_cost: number;
  active: boolean;
}

interface OfferWithCost extends EnergyOffer {
  monthlyCost: number;
  isBest: boolean;
  isCurrent: boolean;
}

// ---------- pure calculation helpers (same logic as server) ----------

const DEFAULT_POWER_KW = 4.6;
const DAYS_PER_MONTH = 30;

function calcMonthlyCost(consumptionKwh: number, offer: EnergyOffer, powerKw: number | null): number {
  const terminoEnergia = consumptionKwh * offer.price_per_kwh;
  const p1 = offer.p1 ?? null;
  const p2 = offer.p2 ?? null;
  const power = powerKw ?? DEFAULT_POWER_KW;
  const terminoPotencia =
    p1 != null && p2 != null
      ? power * DAYS_PER_MONTH * ((p1 + p2) / 2)
      : offer.monthly_fixed_cost;
  return terminoEnergia + terminoPotencia;
}

function normalizeCompany(name: string): string {
  return name.replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?|S\.?L\.?|S\.?Coop\.?)$/i, '').replace(/\s+/g, ' ').trim();
}

// ---------- sub-components ----------

function StepIndicator({ step }: { step: number }) {
  const steps = [
    { n: 1, label: 'Subir factura' },
    { n: 2, label: 'Datos extraídos' },
    { n: 3, label: 'Comparativa' },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
              step >= s.n
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
          </div>
          <span className={`text-sm hidden sm:inline ${step >= s.n ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={`w-8 sm:w-12 h-0.5 ${step > s.n ? 'bg-primary' : 'bg-muted'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function UploadStep({
  onExtracted,
}: {
  onExtracted: (data: InvoiceExtraction, fileName: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast({ title: 'Error', description: `El archivo excede ${MAX_SIZE_MB} MB`, variant: 'destructive' });
        return;
      }

      setFileName(file.name);
      setLoading(true);

      try {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch(SIMULATE_API, { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Error procesando la factura');
        }

        onExtracted(data.extraction as InvoiceExtraction, file.name);
      } catch (err) {
        toast({
          title: 'Error al procesar',
          description: err instanceof Error ? err.message : 'Error desconocido',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [onExtracted]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Subir factura
        </CardTitle>
        <CardDescription>
          Arrastra un PDF o imagen de factura, o haz clic para seleccionar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !loading && inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center min-h-[220px] border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
          } ${loading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_TYPES}
            onChange={handleChange}
            disabled={loading}
          />

          {loading ? (
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Procesando con GPT-4o...</p>
              <p className="text-xs text-muted-foreground">{fileName}</p>
              <p className="text-xs text-muted-foreground">Esto puede tardar 15-30 segundos</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <div className="p-4 bg-muted rounded-full">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Arrastra tu factura aquí</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, JPG, PNG o WebP · Máx. {MAX_SIZE_MB} MB
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExtractionStep({
  extraction,
  fileName,
  onChange,
  onCalculate,
  onBack,
}: {
  extraction: InvoiceExtraction;
  fileName: string;
  onChange: (field: keyof InvoiceExtraction, value: string) => void;
  onCalculate: () => void;
  onBack: () => void;
}) {
  const numField = (
    label: string,
    field: keyof InvoiceExtraction,
    icon: React.ReactNode,
    suffix?: string
  ) => (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </Label>
      <div className="relative">
        <Input
          type="number"
          step="any"
          value={extraction[field] != null ? String(extraction[field]) : ''}
          onChange={(e) => onChange(field, e.target.value)}
          className="text-sm pr-10"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );

  const textField = (
    label: string,
    field: keyof InvoiceExtraction,
    icon: React.ReactNode
  ) => (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </Label>
      <Input
        type="text"
        value={(extraction[field] as string) ?? ''}
        onChange={(e) => onChange(field, e.target.value)}
        className="text-sm"
      />
    </div>
  );

  const hasMinData = extraction.consumption_kwh != null && extraction.consumption_kwh > 0
    && extraction.total_factura != null && extraction.total_factura > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Datos extraídos
            </CardTitle>
            <CardDescription className="mt-1">
              {fileName} · Confianza: {Math.round(extraction.confidence * 100)}%
            </CardDescription>
          </div>
          <Badge variant={extraction.confidence >= 0.8 ? 'default' : 'secondary'}>
            {extraction.confidence >= 0.8 ? 'Alta confianza' : 'Revisar datos'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comercializadora y titular */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            Comercializadora y titular
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {textField('Comercializadora', 'company_name', <Building2 className="h-3 w-3" />)}
            {textField('Titular', 'titular', <User className="h-3 w-3" />)}
            {textField('CUPS', 'cups', <Hash className="h-3 w-3" />)}
            {textField('Tarifa', 'tipo_tarifa', <Zap className="h-3 w-3" />)}
          </div>
        </div>

        <Separator />

        {/* Consumo y factura */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            Consumo y factura
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {numField('Consumo total', 'consumption_kwh', <Zap className="h-3 w-3" />, 'kWh')}
            {numField('Total factura', 'total_factura', <Euro className="h-3 w-3" />, '€')}
            {numField('Meses periodo', 'period_months', <Calendar className="h-3 w-3" />)}
            {textField('Inicio periodo', 'period_start', <Calendar className="h-3 w-3" />)}
          </div>
        </div>

        <Separator />

        {/* Potencia */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Gauge className="h-4 w-4" />
            Potencia contratada
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {numField('Potencia general', 'potencia_contratada_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {numField('P1', 'potencia_p1_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {numField('P2', 'potencia_p2_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {numField('P3', 'potencia_p3_kw', <Gauge className="h-3 w-3" />, 'kW')}
          </div>
        </div>

        <Separator />

        {/* Precios */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Euro className="h-4 w-4" />
            Precios energía
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {numField('Precio medio', 'precio_energia_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {numField('P1', 'precio_p1_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {numField('P2', 'precio_p2_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {numField('P3', 'precio_p3_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Otra factura
          </Button>
          <Button onClick={onCalculate} disabled={!hasMinData}>
            Calcular oferta
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {!hasMinData && (
          <p className="text-xs text-destructive text-center">
            Se necesitan al menos consumo (kWh) y total factura (€) para calcular
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ComparisonStep({
  extraction,
  offers,
  onBack,
  onReset,
}: {
  extraction: InvoiceExtraction;
  offers: EnergyOffer[];
  onBack: () => void;
  onReset: () => void;
}) {
  const periodMonths = Math.max(1, extraction.period_months || 1);
  const currentMonthlyCost = (extraction.total_factura ?? 0) / periodMonths;
  const consumptionMonthly = (extraction.consumption_kwh ?? 0) / periodMonths;
  const currentCompany = extraction.company_name ? normalizeCompany(extraction.company_name) : null;

  const extractedPower = extraction.potencia_contratada_kw
    ?? (extraction.potencia_p1_kw != null && extraction.potencia_p2_kw != null
      ? (extraction.potencia_p1_kw + extraction.potencia_p2_kw) / 2
      : null);

  const offersWithCost: OfferWithCost[] = offers.map((o) => {
    const cost = calcMonthlyCost(consumptionMonthly, o, extractedPower);
    const isCurrent = currentCompany != null
      && o.company_name.trim().toLowerCase() === currentCompany.trim().toLowerCase();
    return { ...o, monthlyCost: Math.round(cost * 100) / 100, isBest: false, isCurrent };
  });

  const comparable = offersWithCost.filter((o) => !o.isCurrent);
  if (comparable.length > 0) {
    const bestIdx = comparable.reduce((minI, o, i, arr) => o.monthlyCost < arr[minI].monthlyCost ? i : minI, 0);
    comparable[bestIdx].isBest = true;
  }

  const best = comparable.find((o) => o.isBest);
  const savingsAmount = best ? currentMonthlyCost - best.monthlyCost : 0;
  const savingsPercent = currentMonthlyCost > 0 && best ? (savingsAmount / currentMonthlyCost) * 100 : 0;

  const sorted = [...offersWithCost].sort((a, b) => a.monthlyCost - b.monthlyCost);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Coste actual mensual</p>
            <p className="text-2xl font-bold">{currentMonthlyCost.toFixed(2)} €</p>
            <p className="text-xs text-muted-foreground mt-1">
              {currentCompany ?? 'Comercializadora no identificada'}
            </p>
          </CardContent>
        </Card>

        {best && (
          <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-1">Mejor oferta</p>
              <p className="text-2xl font-bold text-emerald-600">{best.monthlyCost.toFixed(2)} €</p>
              <p className="text-xs text-muted-foreground mt-1">{best.company_name}</p>
            </CardContent>
          </Card>
        )}

        {best && savingsAmount > 0 && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-1">Ahorro estimado</p>
              <p className="text-2xl font-bold text-blue-600">
                {savingsAmount.toFixed(2)} €/mes
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <TrendingDown className="h-3 w-3 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-600">
                  {savingsPercent.toFixed(1)}%
                </span>
                {savingsPercent > 45 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    Prudente
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Extraction summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Datos de la factura</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Consumo:</span>{' '}
              <span className="font-medium">{extraction.consumption_kwh} kWh</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total:</span>{' '}
              <span className="font-medium">{extraction.total_factura} €</span>
            </div>
            <div>
              <span className="text-muted-foreground">Potencia:</span>{' '}
              <span className="font-medium">{extractedPower ?? DEFAULT_POWER_KW} kW</span>
              {!extractedPower && <span className="text-xs text-muted-foreground"> (defecto)</span>}
            </div>
            <div>
              <span className="text-muted-foreground">Periodo:</span>{' '}
              <span className="font-medium">{periodMonths} {periodMonths === 1 ? 'mes' : 'meses'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Offers table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Todas las ofertas activas</CardTitle>
          <CardDescription>
            Coste mensual estimado para {consumptionMonthly.toFixed(0)} kWh/mes
            con {extractedPower ?? DEFAULT_POWER_KW} kW de potencia
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comercializadora</TableHead>
                <TableHead className="text-right">€/kWh</TableHead>
                <TableHead className="text-right">P1 (€/kW día)</TableHead>
                <TableHead className="text-right">P2 (€/kW día)</TableHead>
                <TableHead className="text-right">Coste mensual</TableHead>
                <TableHead className="text-right">Ahorro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((o) => {
                const saving = currentMonthlyCost - o.monthlyCost;
                const savingPct = currentMonthlyCost > 0 ? (saving / currentMonthlyCost) * 100 : 0;

                return (
                  <TableRow
                    key={o.id}
                    className={
                      o.isBest
                        ? 'bg-emerald-50 dark:bg-emerald-950/20'
                        : o.isCurrent
                        ? 'bg-amber-50 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {o.company_name}
                        {o.isBest && (
                          <Badge className="bg-emerald-600 text-[10px] px-1.5 py-0">Mejor</Badge>
                        )}
                        {o.isCurrent && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Actual</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{o.price_per_kwh.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{o.p1 != null ? o.p1.toFixed(6) : '—'}</TableCell>
                    <TableCell className="text-right">{o.p2 != null ? o.p2.toFixed(6) : '—'}</TableCell>
                    <TableCell className="text-right font-medium">{o.monthlyCost.toFixed(2)} €</TableCell>
                    <TableCell className="text-right">
                      {saving > 0 ? (
                        <span className="text-emerald-600 font-medium">
                          -{saving.toFixed(2)} € ({savingPct.toFixed(1)}%)
                        </span>
                      ) : saving < 0 ? (
                        <span className="text-red-500 text-xs">
                          +{Math.abs(saving).toFixed(2)} €
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No hay ofertas activas configuradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Editar datos
        </Button>
        <Button onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Nueva factura
        </Button>
      </div>
    </div>
  );
}

// ---------- main component ----------

export default function InvoiceSimulator() {
  const [step, setStep] = useState(1);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [fileName, setFileName] = useState('');
  const [offers, setOffers] = useState<EnergyOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  useEffect(() => {
    async function fetchOffers() {
      setLoadingOffers(true);
      try {
        const { data, error } = await supabase
          .from('energy_offers')
          .select('id, company_name, p1, p2, price_per_kwh, monthly_fixed_cost, active')
          .eq('active', true)
          .order('company_name');
        if (error) throw error;
        setOffers(
          (data || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            company_name: r.company_name as string,
            p1: r.p1 != null ? Number(r.p1) : null,
            p2: r.p2 != null ? Number(r.p2) : null,
            price_per_kwh: Number(r.price_per_kwh),
            monthly_fixed_cost: Number(r.monthly_fixed_cost),
            active: r.active as boolean,
          }))
        );
      } catch {
        toast({ title: 'Error', description: 'No se pudieron cargar las ofertas', variant: 'destructive' });
      } finally {
        setLoadingOffers(false);
      }
    }
    fetchOffers();
  }, []);

  const handleExtracted = useCallback((data: InvoiceExtraction, name: string) => {
    setExtraction(data);
    setFileName(name);
    setStep(2);
  }, []);

  const handleFieldChange = useCallback((field: keyof InvoiceExtraction, value: string) => {
    setExtraction((prev) => {
      if (!prev) return prev;
      const numericFields: (keyof InvoiceExtraction)[] = [
        'consumption_kwh', 'total_factura', 'period_months', 'confidence',
        'potencia_contratada_kw', 'potencia_p1_kw', 'potencia_p2_kw', 'potencia_p3_kw',
        'precio_energia_kwh', 'precio_p1_kwh', 'precio_p2_kwh', 'precio_p3_kwh',
      ];
      if (numericFields.includes(field)) {
        const num = value === '' ? null : parseFloat(value);
        return { ...prev, [field]: num };
      }
      return { ...prev, [field]: value || null };
    });
  }, []);

  const reset = useCallback(() => {
    setStep(1);
    setExtraction(null);
    setFileName('');
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6" />
          Simulador de facturas
        </h2>
        <p className="text-muted-foreground mt-1">
          Sube una factura, revisa los datos extraídos y consulta la mejor oferta
        </p>
      </div>

      <StepIndicator step={step} />

      {step === 1 && <UploadStep onExtracted={handleExtracted} />}

      {step === 2 && extraction && (
        <ExtractionStep
          extraction={extraction}
          fileName={fileName}
          onChange={handleFieldChange}
          onCalculate={() => setStep(3)}
          onBack={reset}
        />
      )}

      {step === 3 && extraction && (
        <>
          {loadingOffers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando ofertas...
            </div>
          ) : (
            <ComparisonStep
              extraction={extraction}
              offers={offers}
              onBack={() => setStep(2)}
              onReset={reset}
            />
          )}
        </>
      )}
    </div>
  );
}
