import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
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
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Save,
  Download,
  List,
  Image as ImageIcon,
  MapPin,
} from 'lucide-react';
import {
  estimateSpanishBillTotal,
  getFallbackInvoiceEstimateTaxConfig,
  rowToInvoiceEstimateTaxConfig,
  type InvoiceEstimateTaxConfig,
} from '@/config/invoiceEstimateTaxes';

const SIMULATE_API = import.meta.env.VITE_SIMULATE_INVOICE_API_URL ?? '/api/simulate-invoice';
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp';
const MAX_SIZE_MB = 20;

// ---------- types ----------

interface InvoiceExtraction {
  company_name: string | null;
  consumption_kwh: number | null;
  total_factura: number | null;
  importe_energia_activa?: number | null;
  importe_potencia?: number | null;
  period_start: string | null;
  period_end: string | null;
  period_months: number;
  confidence: number;
  potencia_contratada_kw: number | null;
  potencia_p1_kw: number | null;
  potencia_p2_kw: number | null;
  potencia_p3_kw: number | null;
  potencia_p4_kw: number | null;
  potencia_p5_kw: number | null;
  potencia_p6_kw: number | null;
  precio_energia_kwh: number | null;
  precio_p1_kwh: number | null;
  precio_p2_kwh: number | null;
  precio_p3_kwh: number | null;
  precio_p4_kwh: number | null;
  precio_p5_kwh: number | null;
  precio_p6_kwh: number | null;
  consumo_p1_kwh: number | null;
  consumo_p2_kwh: number | null;
  consumo_p3_kwh: number | null;
  consumo_p4_kwh: number | null;
  consumo_p5_kwh: number | null;
  consumo_p6_kwh: number | null;
  tipo_tarifa: string | null;
  cups: string | null;
  titular: string | null;
  direccion_suministro: string | null;
}

interface EnergyOffer {
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
}

interface OfferWithCost extends EnergyOffer {
  monthlyCost: number;
  /** Solo energía + potencia (sin impuestos); para alinear con Excel antes de IE/IVA. */
  terminoEnergia?: number;
  terminoPotencia?: number;
  isBest: boolean;
  isCurrent: boolean;
}

interface ComparisonSnapshot {
  current_monthly_cost: number;
  best_offer_company: string | null;
  best_offer_monthly_cost: number | null;
  savings_amount: number | null;
  savings_percent: number | null;
  selected_offer_id: string | null;
  selected_offer_company: string | null;
  offers: OfferWithCost[];
}

interface SimulationRow {
  id: string;
  client_name: string;
  file_name: string | null;
  thumbnail_base64: string | null;
  extraction: InvoiceExtraction;
  comparison_result: ComparisonSnapshot | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- helpers ----------

const DEFAULT_POWER_KW = 4.6;
/** Solo si no hay fechas en la factura: mismo criterio que antes (30 días/mes). */
const FALLBACK_POWER_DAYS_PER_MONTH = 30;

/** Días del periodo facturado (inclusive). Alinea el término de potencia (€/kW/día × kW × días) con facturas y Excel. */
function countBillingDaysInclusive(periodStart: string | null, periodEnd: string | null): number | null {
  if (!periodStart || !periodEnd) return null;
  try {
    const s = new Date(`${periodStart}T12:00:00`);
    const e = new Date(`${periodEnd}T12:00:00`);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()) || e < s) return null;
    const days = Math.round((e.getTime() - s.getTime()) / (86400000)) + 1;
    if (days < 1 || days > 370) return null;
    return days;
  } catch {
    return null;
  }
}

function calcMonthlyCostBreakdown(
  consumptionKwh: number,
  offer: EnergyOffer,
  powerKw: number | null,
  powersByPeriod?: (number | null)[],
  consumptionByPeriod?: (number | null)[],
  powerDaysPerBillMonth: number = FALLBACK_POWER_DAYS_PER_MONTH,
): { terminoEnergia: number; terminoPotencia: number; total: number } {
  const offerPrices = [offer.price_p1, offer.price_p2, offer.price_p3, offer.price_p4, offer.price_p5, offer.price_p6];
  const hasPeriodPrices = offerPrices.some((v) => v != null);

  let terminoEnergia: number;
  if (hasPeriodPrices && consumptionByPeriod && consumptionByPeriod.some((v) => v != null && v > 0)) {
    terminoEnergia = 0;
    for (let i = 0; i < 6; i++) {
      const cons = consumptionByPeriod[i] ?? 0;
      const price = offerPrices[i] ?? offer.price_per_kwh;
      terminoEnergia += cons * price;
    }
  } else {
    terminoEnergia = consumptionKwh * offer.price_per_kwh;
  }

  const offerPotPeriods = [offer.p1, offer.p2, offer.p3, offer.p4, offer.p5, offer.p6];
  const activePotPeriods = offerPotPeriods.filter((v) => v != null) as number[];

  if (activePotPeriods.length === 0) {
    const total = terminoEnergia + offer.monthly_fixed_cost;
    return { terminoEnergia, terminoPotencia: offer.monthly_fixed_cost, total };
  }

  let terminoPotencia = 0;
  if (powersByPeriod && powersByPeriod.length >= activePotPeriods.length) {
    for (let i = 0; i < activePotPeriods.length; i++) {
      const pw = powersByPeriod[i] ?? powerKw ?? DEFAULT_POWER_KW;
      terminoPotencia += pw * powerDaysPerBillMonth * activePotPeriods[i];
    }
  } else {
    const power = powerKw ?? DEFAULT_POWER_KW;
    for (const period of activePotPeriods) {
      terminoPotencia += power * powerDaysPerBillMonth * period;
    }
  }

  const total = terminoEnergia + terminoPotencia;
  return { terminoEnergia, terminoPotencia, total };
}

function calcMonthlyCost(
  consumptionKwh: number,
  offer: EnergyOffer,
  powerKw: number | null,
  powersByPeriod?: (number | null)[],
  consumptionByPeriod?: (number | null)[],
  powerDaysPerBillMonth: number = FALLBACK_POWER_DAYS_PER_MONTH,
): number {
  return calcMonthlyCostBreakdown(consumptionKwh, offer, powerKw, powersByPeriod, consumptionByPeriod, powerDaysPerBillMonth).total;
}

function normalizeCompany(name: string): string {
  return name.replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?|S\.?L\.?|S\.?Coop\.?)$/i, '').replace(/\s+/g, ' ').trim();
}

function detectTarifaTipo(extraction: InvoiceExtraction): string {
  const t = (extraction.tipo_tarifa ?? '').toUpperCase().replace(/\s+/g, '');
  if (t.includes('3.0') || t.includes('30TD')) return '3.0TD';
  return '2.0TD';
}

/** Total factura / kWh (todo incluido). En 3.0TD, >~0,47 suele indicar consumo subestimado (bloque temporal omitido). */
function impliedTotalPerKwh(extraction: InvoiceExtraction): number | null {
  const c = extraction.consumption_kwh;
  const tf = extraction.total_factura;
  if (c == null || c <= 0 || tf == null || tf <= 0) return null;
  return tf / c;
}

function suspicious30tdConsumption(extraction: InvoiceExtraction): boolean {
  if (detectTarifaTipo(extraction) !== '3.0TD') return false;
  const r = impliedTotalPerKwh(extraction);
  return r != null && r > 0.47;
}

function filterOffersByTarifa(offers: EnergyOffer[], tarifaTipo: string): EnergyOffer[] {
  const matched = offers.filter((o) => o.tarifa_tipo === tarifaTipo);
  return matched.length > 0 ? matched : offers;
}

function buildComparison(
  extraction: InvoiceExtraction,
  offers: EnergyOffer[],
  taxConfig: InvoiceEstimateTaxConfig,
): { snapshot: ComparisonSnapshot; offersWithCost: OfferWithCost[] } {
  const periodMonths = Math.max(1, extraction.period_months || 1);
  const currentMonthlyCost = (extraction.total_factura ?? 0) / periodMonths;
  const consumptionMonthly = (extraction.consumption_kwh ?? 0) / periodMonths;
  const billDays = countBillingDaysInclusive(extraction.period_start, extraction.period_end);
  const powerDaysPerBillMonth = billDays != null && billDays >= 28
    ? billDays / periodMonths
    : FALLBACK_POWER_DAYS_PER_MONTH;
  const taxBillingDays = billDays != null && billDays >= 28 && billDays <= 370
    ? billDays
    : FALLBACK_POWER_DAYS_PER_MONTH;
  const currentCompany = extraction.company_name ? normalizeCompany(extraction.company_name) : null;
  const extractedPower = extraction.potencia_contratada_kw
    ?? (extraction.potencia_p1_kw != null && extraction.potencia_p2_kw != null
      ? (extraction.potencia_p1_kw + extraction.potencia_p2_kw) / 2
      : null);

  const powersByPeriod: (number | null)[] = [
    extraction.potencia_p1_kw, extraction.potencia_p2_kw, extraction.potencia_p3_kw,
    extraction.potencia_p4_kw, extraction.potencia_p5_kw, extraction.potencia_p6_kw,
  ];

  const consumptionByPeriod: (number | null)[] = [
    extraction.consumo_p1_kwh, extraction.consumo_p2_kwh, extraction.consumo_p3_kwh,
    extraction.consumo_p4_kwh, extraction.consumo_p5_kwh, extraction.consumo_p6_kwh,
  ].map((v) => v != null ? v / periodMonths : null);

  const offersWithCost: OfferWithCost[] = offers.map((o) => {
    const { terminoEnergia, terminoPotencia, total } = calcMonthlyCostBreakdown(
      consumptionMonthly, o, extractedPower, powersByPeriod, consumptionByPeriod, powerDaysPerBillMonth,
    );
    const isCurrent = currentCompany != null
      && o.company_name.trim().toLowerCase() === currentCompany.trim().toLowerCase();
    return {
      ...o,
      monthlyCost: Math.round(total * 100) / 100,
      terminoEnergia: Math.round(terminoEnergia * 100) / 100,
      terminoPotencia: Math.round(terminoPotencia * 100) / 100,
      isBest: false,
      isCurrent,
    };
  });

  const comparable = offersWithCost.filter((o) => !o.isCurrent);
  if (comparable.length > 0) {
    const bestIdx = comparable.reduce((minI, o, i, arr) => o.monthlyCost < arr[minI].monthlyCost ? i : minI, 0);
    comparable[bestIdx].isBest = true;
  }

  const best = comparable.find((o) => o.isBest);
  const bestApproxBill = best ? estimateSpanishBillTotal(best.monthlyCost, taxBillingDays, taxConfig) : null;
  /** Ahorro frente al total factura actual, usando la misma capa IE+IVA+cargos que el Excel (~756 € vs ~585 € base). */
  const savingsAmount = bestApproxBill != null
    ? Math.round((currentMonthlyCost - bestApproxBill) * 100) / 100
    : null;
  const savingsPercent = currentMonthlyCost > 0 && savingsAmount != null
    ? Math.round((savingsAmount / currentMonthlyCost) * 10000) / 100
    : null;

  return {
    snapshot: {
      current_monthly_cost: Math.round(currentMonthlyCost * 100) / 100,
      best_offer_company: best?.company_name ?? null,
      best_offer_monthly_cost: best?.monthlyCost ?? null,
      savings_amount: savingsAmount,
      savings_percent: savingsPercent,
      selected_offer_id: best?.id ?? null,
      selected_offer_company: best?.company_name ?? null,
      offers: offersWithCost,
    },
    offersWithCost,
  };
}

let pdfjsWorkerReady = false;
async function ensurePdfWorker() {
  if (pdfjsWorkerReady) return;
  const pdfjsLib = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  pdfjsWorkerReady = true;
}

async function generateThumbnail(file: File): Promise<string | null> {
  try {
    if (file.type === 'application/pdf') {
      await ensurePdfWorker();
      const pdfjsLib = await import('pdfjs-dist');
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const page = await pdf.getPage(1);
      const scale = 400 / Math.max(page.getViewport({ scale: 1 }).width, 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.6);
    }

    if (!file.type.startsWith('image/')) return null;
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.05,
      maxWidthOrHeight: 400,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(compressed);
    });
  } catch (err) {
    console.warn('Thumbnail generation failed:', err);
    return null;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function exportCsv(simulations: SimulationRow[]) {
  const headers = ['Cliente', 'Comercializadora', 'Oferta propuesta', 'Consumo kWh', 'Total €', 'Mejor oferta', 'Ahorro €/mes', 'Ahorro %', 'Fecha'];
  const rows = simulations.map((s) => [
    s.client_name,
    s.extraction.company_name ?? '',
    s.comparison_result?.selected_offer_company ?? '',
    s.extraction.consumption_kwh ?? '',
    s.extraction.total_factura ?? '',
    s.comparison_result?.best_offer_company ?? '',
    s.comparison_result?.savings_amount ?? '',
    s.comparison_result?.savings_percent ?? '',
    formatDate(s.created_at),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `simulaciones-facturas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
          </div>
          <span className={`text-sm hidden sm:inline ${step >= s.n ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <div className={`w-8 sm:w-12 h-0.5 ${step > s.n ? 'bg-primary' : 'bg-muted'}`} />}
        </div>
      ))}
    </div>
  );
}

function UploadStep({
  onExtracted,
  onThumbnailReady,
}: {
  onExtracted: (data: InvoiceExtraction, fileName: string) => void;
  onThumbnailReady: (fileName: string, thumbnail: string | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadSeqRef = useRef(0);

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({ title: 'Error', description: `El archivo excede ${MAX_SIZE_MB} MB`, variant: 'destructive' });
      return;
    }
    const uploadSeq = ++uploadSeqRef.current;
    setFileName(file.name);
    setLoading(true);
    try {
      void generateThumbnail(file)
        .then((thumbnail) => {
          if (uploadSeqRef.current !== uploadSeq) return;
          onThumbnailReady(file.name, thumbnail);
        })
        .catch((err) => {
          console.warn('Thumbnail background generation failed:', err);
        });

      const form = new FormData();
      form.append('file', file);
      const res = await fetch(SIMULATE_API, { method: 'POST', body: form });
      const raw = await res.text();
      let data: { success?: boolean; error?: string; extraction?: InvoiceExtraction };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 180) || 'El servidor devolvió una respuesta no válida');
      }
      if (!res.ok || !data.success) throw new Error(data.error || 'Error procesando la factura');
      if (uploadSeqRef.current !== uploadSeq) return;
      onExtracted(data.extraction as InvoiceExtraction, file.name);
    } catch (err) {
      toast({ title: 'Error al procesar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      if (uploadSeqRef.current === uploadSeq) {
        setLoading(false);
      }
    }
  }, [onExtracted, onThumbnailReady]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Subir factura</CardTitle>
        <CardDescription>Arrastra un PDF o imagen de factura, o haz clic para seleccionar</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          onClick={() => !loading && inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center min-h-[220px] border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'} ${loading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input ref={inputRef} type="file" className="hidden" accept={ACCEPTED_TYPES} onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} disabled={loading} />
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Zap className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div>
                <p className="text-sm font-medium">Analizando factura<span className="inline-flex w-6 text-left"><span className="animate-pulse">...</span></span></p>
                <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span>Extrayendo datos de consumo, potencia y tarifas</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <div className="p-4 bg-muted rounded-full"><FileText className="h-8 w-8 text-muted-foreground" /></div>
              <div>
                <p className="text-sm font-medium">Arrastra tu factura aquí</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG o WebP · Máx. {MAX_SIZE_MB} MB</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExtractionStep({
  extraction, fileName, onChange, onCalculate, onBack,
}: {
  extraction: InvoiceExtraction; fileName: string;
  onChange: (field: keyof InvoiceExtraction, value: string) => void;
  onCalculate: () => void; onBack: () => void;
}) {
  const numField = (label: string, field: keyof InvoiceExtraction, icon: React.ReactNode, suffix?: string) => (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">{icon}{label}</Label>
      <div className="relative">
        <Input type="number" step="any" value={extraction[field] != null ? String(extraction[field]) : ''} onChange={(e) => onChange(field, e.target.value)} className="text-sm pr-10" />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
  const textField = (label: string, field: keyof InvoiceExtraction, icon: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">{icon}{label}</Label>
      <Input type="text" value={(extraction[field] as string) ?? ''} onChange={(e) => onChange(field, e.target.value)} className="text-sm" />
    </div>
  );
  const hasMinData = extraction.consumption_kwh != null && extraction.consumption_kwh > 0 && extraction.total_factura != null && extraction.total_factura > 0;
  const is30 = detectTarifaTipo(extraction) === '3.0TD';
  const implied = impliedTotalPerKwh(extraction);
  const suspiciousConsumo = suspicious30tdConsumption(extraction);
  const canCalculate = hasMinData;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Datos extraídos</CardTitle>
            <CardDescription className="mt-1">{fileName} · Confianza: {Math.round(extraction.confidence * 100)}%</CardDescription>
          </div>
          <Badge variant={extraction.confidence >= 0.8 ? 'default' : 'secondary'}>{extraction.confidence >= 0.8 ? 'Alta confianza' : 'Revisar datos'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {suspiciousConsumo && implied != null && (
          <Alert className="border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-900 dark:text-amber-100">Consumo posiblemente incompleto (3.0TD)</AlertTitle>
            <AlertDescription className="text-amber-900/90 dark:text-amber-100/90 text-sm">
              Total factura ÷ consumo ≈ {implied.toFixed(2)} €/kWh. En tarifas 3.0TD suele haber <strong>dos o más tramos</strong> de energía en el mismo mes; si solo se leyó el primero, el kWh queda ~a la mitad y la oferta sale artificialmente barata.
              Revisa en el PDF todas las tablas de «energía activa» y el <strong>total kWh</strong> del apartado; corrige consumo total y P1–P6 antes de calcular.
            </AlertDescription>
          </Alert>
        )}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><Building2 className="h-4 w-4" />Comercializadora y titular</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {textField('Comercializadora', 'company_name', <Building2 className="h-3 w-3" />)}
            {textField('Titular', 'titular', <User className="h-3 w-3" />)}
            {textField('CUPS', 'cups', <Hash className="h-3 w-3" />)}
            {textField('Tarifa', 'tipo_tarifa', <Zap className="h-3 w-3" />)}
          </div>
          <div className="grid grid-cols-1 gap-3 mt-3">
            {textField('Dirección suministro', 'direccion_suministro', <MapPin className="h-3 w-3" />)}
          </div>
        </div>
        <Separator />
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><Zap className="h-4 w-4" />Consumo y factura</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {numField('Consumo total', 'consumption_kwh', <Zap className="h-3 w-3" />, 'kWh')}
            {numField('Total factura', 'total_factura', <Euro className="h-3 w-3" />, '€')}
            {numField('Meses periodo', 'period_months', <Calendar className="h-3 w-3" />)}
            {textField('Inicio periodo', 'period_start', <Calendar className="h-3 w-3" />)}
          </div>
          {is30 && (
            <div className="mt-3">
              <Label className="text-xs text-muted-foreground mb-1 block">Consumo por periodo (kWh)</Label>
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                Suma <strong>todos los bloques temporales</strong> del mismo mes (fechas distintas). Los periodos con consumo dependen del calendario horario; puede haber ceros en P3–P5.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {numField('P1', 'consumo_p1_kwh', <Zap className="h-3 w-3" />, 'kWh')}
                {numField('P2', 'consumo_p2_kwh', <Zap className="h-3 w-3" />, 'kWh')}
                {numField('P3', 'consumo_p3_kwh', <Zap className="h-3 w-3" />, 'kWh')}
                {numField('P4', 'consumo_p4_kwh', <Zap className="h-3 w-3" />, 'kWh')}
                {numField('P5', 'consumo_p5_kwh', <Zap className="h-3 w-3" />, 'kWh')}
                {numField('P6', 'consumo_p6_kwh', <Zap className="h-3 w-3" />, 'kWh')}
              </div>
            </div>
          )}
        </div>
        <Separator />
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><Gauge className="h-4 w-4" />Potencia contratada</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {numField('Potencia general', 'potencia_contratada_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {numField('P1', 'potencia_p1_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {numField('P2', 'potencia_p2_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {numField('P3', 'potencia_p3_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {is30 && numField('P4', 'potencia_p4_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {is30 && numField('P5', 'potencia_p5_kw', <Gauge className="h-3 w-3" />, 'kW')}
            {is30 && numField('P6', 'potencia_p6_kw', <Gauge className="h-3 w-3" />, 'kW')}
          </div>
        </div>
        <Separator />
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><Euro className="h-4 w-4" />Precios energía</h4>
          {is30 && (
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              Los €/kWh por periodo solo se rellenan si la factura los muestra. Si un periodo no tiene consumo ese mes, suele no haber precio en papel: el campo puede quedar vacío; el precio medio y la comparativa usan solo los periodos con consumo y precio.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {numField('Precio medio', 'precio_energia_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {numField('P1', 'precio_p1_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {numField('P2', 'precio_p2_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {numField('P3', 'precio_p3_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {is30 && numField('P4', 'precio_p4_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {is30 && numField('P5', 'precio_p5_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
            {is30 && numField('P6', 'precio_p6_kwh', <Euro className="h-3 w-3" />, '€/kWh')}
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Volver</Button>
          <Button onClick={onCalculate} disabled={!canCalculate}>Calcular oferta<ArrowRight className="h-4 w-4 ml-2" /></Button>
        </div>
        {!hasMinData && <p className="text-xs text-destructive text-center">Se necesitan al menos consumo (kWh) y total factura (€) para calcular</p>}
      </CardContent>
    </Card>
  );
}

function ComparisonView({
  extraction, offersWithCost, snapshot, thumbnail, selectedOfferId, onSelectOffer, readonly, taxConfig,
}: {
  extraction: InvoiceExtraction; offersWithCost: OfferWithCost[]; snapshot: ComparisonSnapshot;
  thumbnail?: string | null; selectedOfferId?: string | null;
  onSelectOffer?: (offerId: string) => void; readonly?: boolean;
  taxConfig: InvoiceEstimateTaxConfig;
}) {
  const [thumbOpen, setThumbOpen] = useState(false);
  const periodMonths = Math.max(1, extraction.period_months || 1);
  const billDaysForTax = countBillingDaysInclusive(extraction.period_start, extraction.period_end);
  const taxBillingDays = billDaysForTax != null && billDaysForTax >= 28 && billDaysForTax <= 370
    ? billDaysForTax
    : FALLBACK_POWER_DAYS_PER_MONTH;
  const currentMonthlyCost = snapshot.current_monthly_cost;
  const consumptionMonthly = (extraction.consumption_kwh ?? 0) / periodMonths;
  const currentCompany = extraction.company_name ? normalizeCompany(extraction.company_name) : null;
  const extractedPower = extraction.potencia_contratada_kw
    ?? (extraction.potencia_p1_kw != null && extraction.potencia_p2_kw != null ? (extraction.potencia_p1_kw + extraction.potencia_p2_kw) / 2 : null);
  const best = offersWithCost.find((o) => o.isBest);
  const displayBestApprox = best ? estimateSpanishBillTotal(best.monthlyCost, taxBillingDays, taxConfig) : null;
  const displaySavingsAmount = displayBestApprox != null && currentMonthlyCost > displayBestApprox
    ? Math.round((currentMonthlyCost - displayBestApprox) * 100) / 100
    : 0;
  const displaySavingsPercent = currentMonthlyCost > 0 && displaySavingsAmount > 0
    ? Math.round((displaySavingsAmount / currentMonthlyCost) * 10000) / 100
    : 0;
  const sorted = [...offersWithCost].sort((a, b) => a.monthlyCost - b.monthlyCost);
  const selected = selectedOfferId ? offersWithCost.find((o) => o.id === selectedOfferId) : null;
  const impliedKwh = impliedTotalPerKwh(extraction);
  const consumoSospechoso = suspicious30tdConsumption(extraction);
  const selectedApproxBill = selected
    ? estimateSpanishBillTotal(selected.monthlyCost, taxBillingDays, taxConfig)
    : null;
  const selectedAhorroVsFacturaEst = selectedApproxBill != null
    ? Math.round((currentMonthlyCost - selectedApproxBill) * 100) / 100
    : null;
  const selectedAhorroSoloBase = selected
    ? Math.round((currentMonthlyCost - selected.monthlyCost) * 100) / 100
    : null;

  return (
    <div className="space-y-4">
      {consumoSospechoso && impliedKwh != null && (
        <Alert className="border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900 dark:text-amber-100">Revisa el consumo (kWh)</AlertTitle>
          <AlertDescription className="text-amber-900/90 dark:text-amber-100/90 text-sm">
            Total ÷ consumo ≈ {impliedKwh.toFixed(2)} €/kWh: es habitual cuando en 3.0TD <strong>falta un segundo tramo</strong> de energía en el mismo mes. La oferta se calcula con los kWh extraídos; si son bajos, la base y el ahorro se ven «demasiado buenos». Vuelve al paso anterior y cuadra con el total kWh de la factura.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {thumbnail && (
              <div className="shrink-0">
                <img
                  src={thumbnail} alt="Factura"
                  className="h-32 rounded-lg border object-contain cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setThumbOpen(true)}
                />
                <Dialog open={thumbOpen} onOpenChange={setThumbOpen}>
                  <DialogContent className="max-w-3xl p-2">
                    <img src={thumbnail} alt="Factura" className="w-full rounded-lg object-contain max-h-[80vh]" />
                  </DialogContent>
                </Dialog>
              </div>
            )}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">Coste actual mensual</p>
                <p className="text-2xl font-bold">{currentMonthlyCost.toFixed(2)} €</p>
                <p className="text-xs text-muted-foreground mt-1">{currentCompany ?? 'No identificada'}</p>
              </div>
              {best && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Mejor oferta (energía + potencia)</p>
                  <p className="text-2xl font-bold text-emerald-600">{best.monthlyCost.toFixed(2)} €</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {best.company_name}
                    {' · '}
                    ≈ {estimateSpanishBillTotal(best.monthlyCost, taxBillingDays, taxConfig).toFixed(2)} € con IE+IVA (est., {taxBillingDays} d.)
                  </p>
                </div>
              )}
              {best && displaySavingsAmount > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Ahorro estimado (total c/ IE+IVA est.)</p>
                  <p className="text-2xl font-bold text-blue-600">{displaySavingsAmount.toFixed(2)} €/mes</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <TrendingDown className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-600">{displaySavingsPercent.toFixed(1)}%</span>
                    {displaySavingsPercent > 45 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Prudente</Badge>}
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
            Coste actual: total de la factura entre meses (IVA, impuesto eléctrico, alquiler, etc.). Las ofertas muestran primero la base comercial (energía + potencia) con los días del periodo de la factura; la columna «≈ Factura» usa coeficientes configurables (por defecto IE
            {' '}
            {(taxConfig.electricityTaxRate * 100).toFixed(3)}
            % sobre esa base, cargos fijos ~
            {' '}
            {taxConfig.fixedChargesEurPerDay.toFixed(4)}
            {' '}
            €/día, IVA
            {' '}
            {(taxConfig.vatRate * 100).toFixed(0)}
            %). Los coeficientes se configuran en el menú «Simulador: IE / IVA»; si falla la base de datos, se usan variables VITE_INVOICE_* o valores por defecto. En 3.0TD, si en la factura la potencia P6 difiere del resto (p. ej. 33 kW frente a 26 kW), revisa que en la extracción estén
            {' '}
            <code className="text-[11px]">potencia_p6_kw</code>
            {' '}
            y consumos P1–P6: si faltan, el CRM repite la potencia media y se desvía del Excel.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Datos de la factura
            {extraction.tipo_tarifa && (
              <Badge variant={detectTarifaTipo(extraction) === '3.0TD' ? 'secondary' : 'default'} className="text-xs">
                {extraction.tipo_tarifa}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(extraction.titular || extraction.cups || extraction.tipo_tarifa || extraction.company_name || extraction.direccion_suministro) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
              {extraction.titular && <div><span className="text-muted-foreground">Titular:</span> <span className="font-medium">{extraction.titular}</span></div>}
              {extraction.cups && <div><span className="text-muted-foreground">CUPS:</span> <span className="font-mono text-xs font-medium">{extraction.cups}</span></div>}
              {extraction.tipo_tarifa && <div><span className="text-muted-foreground">Tarifa:</span> <span className="font-medium">{extraction.tipo_tarifa}</span></div>}
              {extraction.company_name && <div><span className="text-muted-foreground">Comercializadora:</span> <span className="font-medium">{extraction.company_name}</span></div>}
              {extraction.direccion_suministro && <div className="col-span-2 sm:col-span-4"><span className="text-muted-foreground">Dirección suministro:</span> <span className="font-medium">{extraction.direccion_suministro}</span></div>}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div><span className="text-muted-foreground">Consumo:</span> <span className="font-medium">{extraction.consumption_kwh} kWh</span></div>
            <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{extraction.total_factura} €</span></div>
            <div><span className="text-muted-foreground">Potencia:</span> <span className="font-medium">{extractedPower ?? DEFAULT_POWER_KW} kW</span>{!extractedPower && <span className="text-xs text-muted-foreground"> (defecto)</span>}</div>
            <div><span className="text-muted-foreground">Periodo:</span> <span className="font-medium">{periodMonths} {periodMonths === 1 ? 'mes' : 'meses'}</span></div>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Oferta propuesta: <span className="text-primary">{selected.company_name}</span></p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Base {selected.monthlyCost.toFixed(2)} € · ≈ {selectedApproxBill.toFixed(2)} € c/ IE+IVA (est.)
                  <span className="block mt-0.5">
                    Ahorro vs tu factura actual: <span className="font-medium text-foreground">{selectedAhorroVsFacturaEst.toFixed(2)} €/mes</span>
                    {' '}(comparación solo en base comercial: {selectedAhorroSoloBase.toFixed(2)} €/mes)
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Todas las ofertas activas</CardTitle>
          <CardDescription>
            Base comercial (sin IE ni IVA) para {consumptionMonthly.toFixed(0)} kWh/mes; potencia según datos por periodo si existen.
            «≈ Factura» = base + impuesto eléctrico + cargos fijos estimados ({taxBillingDays} d.) + IVA {(taxConfig.vatRate * 100).toFixed(0)} % (coef. desde backoffice o fallback), criterio tipo Excel.
            {!readonly && <span className="ml-1">· Haz clic en una fila para seleccionar la oferta propuesta</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {!readonly && <TableHead className="w-10"></TableHead>}
                <TableHead>Comercializadora</TableHead>
                <TableHead className="text-right">€/kWh</TableHead>
                <TableHead className="text-right">P1</TableHead>
                <TableHead className="text-right">P2</TableHead>
                <TableHead className="text-right">Energía</TableHead>
                <TableHead className="text-right">Potencia</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">≈ Factura</TableHead>
                <TableHead className="text-right">Ahorro*</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((o) => {
                const saving = currentMonthlyCost - o.monthlyCost;
                const savingFactura = currentMonthlyCost - estimateSpanishBillTotal(o.monthlyCost, taxBillingDays, taxConfig);
                const savingFacturaPct = currentMonthlyCost > 0 ? (savingFactura / currentMonthlyCost) * 100 : 0;
                const isSelected = selectedOfferId === o.id;
                const approxBill = estimateSpanishBillTotal(o.monthlyCost, taxBillingDays, taxConfig);
                return (
                  <TableRow
                    key={o.id}
                    className={`${isSelected ? 'bg-primary/10 dark:bg-primary/20' : o.isBest ? 'bg-emerald-50 dark:bg-emerald-950/20' : o.isCurrent ? 'bg-amber-50 dark:bg-amber-950/20' : ''} ${!readonly ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                    onClick={() => !readonly && onSelectOffer?.(o.id)}
                  >
                    {!readonly && (
                      <TableCell>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {o.company_name}
                        {o.isBest && <Badge className="bg-emerald-600 text-[10px] px-1.5 py-0">Mejor</Badge>}
                        {o.isCurrent && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Actual</Badge>}
                        {isSelected && <Badge className="bg-primary text-[10px] px-1.5 py-0">Propuesta</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{o.price_per_kwh.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{o.p1 != null ? o.p1.toFixed(6) : '—'}</TableCell>
                    <TableCell className="text-right">{o.p2 != null ? o.p2.toFixed(6) : '—'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{o.terminoEnergia != null ? `${o.terminoEnergia.toFixed(2)} €` : '—'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{o.terminoPotencia != null ? `${o.terminoPotencia.toFixed(2)} €` : '—'}</TableCell>
                    <TableCell className="text-right font-medium">{o.monthlyCost.toFixed(2)} €</TableCell>
                    <TableCell className="text-right font-medium text-muted-foreground">{approxBill.toFixed(2)} €</TableCell>
                    <TableCell className="text-right text-xs">
                      {savingFactura > 0 ? (
                        <span className="text-emerald-600 font-medium block">-{savingFactura.toFixed(2)} € ({savingFacturaPct.toFixed(1)}%)</span>
                      ) : savingFactura < 0 ? (
                        <span className="text-red-500 block">+{Math.abs(savingFactura).toFixed(2)} €</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <span className="text-muted-foreground font-normal block mt-0.5">
                        base {saving > 0 ? `-${saving.toFixed(2)}` : saving < 0 ? `+${Math.abs(saving).toFixed(2)}` : '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && <TableRow><TableCell colSpan={!readonly ? 11 : 10} className="text-center text-muted-foreground py-8">No hay ofertas activas</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SimulationsList({
  simulations, loading, onNew, onView, onEdit, onDelete, onExport,
}: {
  simulations: SimulationRow[]; loading: boolean;
  onNew: () => void; onView: (s: SimulationRow) => void; onEdit: (s: SimulationRow) => void;
  onDelete: (s: SimulationRow) => void; onExport: () => void;
}) {
  const [filter, setFilter] = useState('');
  const filtered = filter.trim()
    ? simulations.filter((s) => {
        const q = filter.trim().toLowerCase();
        return s.client_name.toLowerCase().includes(q)
          || (s.extraction.company_name ?? '').toLowerCase().includes(q)
          || (s.notes ?? '').toLowerCase().includes(q);
      })
    : simulations;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><List className="h-5 w-5" />Simulaciones guardadas</CardTitle>
            <CardDescription className="mt-1">{simulations.length} simulaciones</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {simulations.length > 0 && (
              <Button variant="outline" size="sm" onClick={onExport}><Download className="h-4 w-4 mr-1" />CSV</Button>
            )}
            <Button size="sm" onClick={onNew}><Plus className="h-4 w-4 mr-1" />Nueva simulación</Button>
          </div>
        </div>
        {simulations.length > 3 && (
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente, comercializadora o notas..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 text-sm" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin mr-2" />Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {simulations.length === 0 ? (
              <div className="space-y-3">
                <FileText className="h-12 w-12 mx-auto opacity-30" />
                <p>No hay simulaciones guardadas</p>
                <Button variant="outline" onClick={onNew}><Plus className="h-4 w-4 mr-1" />Crear primera simulación</Button>
              </div>
            ) : <p>Sin resultados para "{filter}"</p>}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Comercializadora</TableHead>
                <TableHead>Oferta propuesta</TableHead>
                <TableHead className="text-right">Total €</TableHead>
                <TableHead className="text-right">Ahorro</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onView(s)}>
                  <TableCell>
                    {s.thumbnail_base64 ? (
                      <img src={s.thumbnail_base64} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{s.client_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.extraction.company_name ?? '—'}</TableCell>
                  <TableCell>
                    {s.comparison_result?.selected_offer_company ? (
                      <Badge variant="outline" className="text-xs font-medium">{s.comparison_result.selected_offer_company}</Badge>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">{s.extraction.total_factura != null ? `${s.extraction.total_factura} €` : '—'}</TableCell>
                  <TableCell className="text-right">
                    {s.comparison_result?.savings_amount != null && s.comparison_result.savings_amount > 0 ? (
                      <span className="text-emerald-600 text-sm font-medium">-{s.comparison_result.savings_amount.toFixed(2)} €</span>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(s.created_at)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(s)} title="Ver comparativa"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(s)} title="Editar datos"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(s)} title="Eliminar"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- main component ----------

export default function InvoiceSimulator() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'list' | 'wizard' | 'view'>('list');
  const [step, setStep] = useState(1);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [fileName, setFileName] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [offers, setOffers] = useState<EnergyOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [simulations, setSimulations] = useState<SimulationRow[]>([]);
  const [loadingSims, setLoadingSims] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // save dialog
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveClientName, setSaveClientName] = useState('');
  const [saveNotes, setSaveNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // delete dialog
  const [deleteTarget, setDeleteTarget] = useState<SimulationRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // current comparison cache
  const [currentSnapshot, setCurrentSnapshot] = useState<ComparisonSnapshot | null>(null);
  const [currentOffersWithCost, setCurrentOffersWithCost] = useState<OfferWithCost[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [taxConfig, setTaxConfig] = useState<InvoiceEstimateTaxConfig>(() => getFallbackInvoiceEstimateTaxConfig());

  const fetchInvoiceEstimateSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_estimate_settings')
        .select('electricity_tax_rate, vat_rate, fixed_charges_eur_per_day')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      if (data) setTaxConfig(rowToInvoiceEstimateTaxConfig(data));
      else setTaxConfig(getFallbackInvoiceEstimateTaxConfig());
    } catch {
      setTaxConfig(getFallbackInvoiceEstimateTaxConfig());
    }
  }, []);

  const fetchOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const { data, error } = await (supabase as any)
        .from('energy_offers')
        .select('id, company_name, p1, p2, p3, p4, p5, p6, price_per_kwh, price_p1, price_p2, price_p3, price_p4, price_p5, price_p6, monthly_fixed_cost, active, tarifa_tipo')
        .eq('active', true)
        .order('company_name');
      if (error) throw error;
      const mapped = ((data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        company_name: r.company_name as string,
        p1: r.p1 != null ? Number(r.p1) : null,
        p2: r.p2 != null ? Number(r.p2) : null,
        p3: r.p3 != null ? Number(r.p3) : null,
        p4: r.p4 != null ? Number(r.p4) : null,
        p5: r.p5 != null ? Number(r.p5) : null,
        p6: r.p6 != null ? Number(r.p6) : null,
        price_per_kwh: Number(r.price_per_kwh),
        price_p1: r.price_p1 != null ? Number(r.price_p1) : null,
        price_p2: r.price_p2 != null ? Number(r.price_p2) : null,
        price_p3: r.price_p3 != null ? Number(r.price_p3) : null,
        price_p4: r.price_p4 != null ? Number(r.price_p4) : null,
        price_p5: r.price_p5 != null ? Number(r.price_p5) : null,
        price_p6: r.price_p6 != null ? Number(r.price_p6) : null,
        monthly_fixed_cost: Number(r.monthly_fixed_cost),
        active: r.active as boolean,
        tarifa_tipo: (r.tarifa_tipo as string) || '2.0TD',
      }));
      setOffers(mapped);
      return mapped;
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar las ofertas', variant: 'destructive' });
      return [];
    } finally {
      setLoadingOffers(false);
    }
  }, []);

  const fetchSimulations = useCallback(async () => {
    setLoadingSims(true);
    try {
      const { data, error } = await supabase
        .from('invoice_simulations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSimulations((data as unknown as SimulationRow[]) || []);
    } catch (err) {
      const msg = (err as any)?.message ?? (err instanceof Error ? err.message : 'No se pudieron cargar las simulaciones');
      console.error('fetchSimulations error:', err);
      toast({ title: 'Error', description: String(msg), variant: 'destructive' });
    } finally {
      setLoadingSims(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
    fetchSimulations();
    fetchInvoiceEstimateSettings();
  }, [fetchOffers, fetchSimulations, fetchInvoiceEstimateSettings]);

  const goToWizard = useCallback(() => {
    setMode('wizard');
    setStep(1);
    setExtraction(null);
    setFileName('');
    setThumbnail(null);
    setEditingId(null);
    setCurrentSnapshot(null);
    setCurrentOffersWithCost([]);
    setSelectedOfferId(null);
  }, []);

  const goToList = useCallback(() => {
    setMode('list');
    setEditingId(null);
    setCurrentSnapshot(null);
    setCurrentOffersWithCost([]);
    setSelectedOfferId(null);
  }, []);

  const handleExtracted = useCallback((data: InvoiceExtraction, name: string) => {
    setExtraction(data);
    setFileName(name);
    setThumbnail(null);
    setStep(2);
  }, []);

  const handleThumbnailReady = useCallback((name: string, thumb: string | null) => {
    if (fileName === name) {
      setThumbnail(thumb);
    }
  }, [fileName]);

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

  const handleCalculate = useCallback(() => {
    if (!extraction) return;
    if (suspicious30tdConsumption(extraction)) {
      const implied = impliedTotalPerKwh(extraction);
      toast({
        title: 'Atención: consumo puede estar incompleto',
        description: implied != null
          ? `Total/consumo ≈ ${implied.toFixed(2)} €/kWh en 3.0TD; revisa si el total kWh cuadra con la factura.`
          : 'En 3.0TD el consumo podría ser parcial; compara con la factura.',
        variant: 'default',
      });
    }
    const tarifaTipo = detectTarifaTipo(extraction);
    const filtered = filterOffersByTarifa(offers, tarifaTipo);
    const { snapshot, offersWithCost } = buildComparison(extraction, filtered, taxConfig);
    setCurrentSnapshot(snapshot);
    setCurrentOffersWithCost(offersWithCost);
    setSelectedOfferId(snapshot.selected_offer_id);
    setStep(3);
  }, [extraction, offers, taxConfig]);

  const handleViewSimulation = useCallback((s: SimulationRow) => {
    setExtraction(s.extraction);
    setFileName(s.file_name ?? 'Simulación guardada');
    setThumbnail(s.thumbnail_base64);
    setEditingId(s.id);

    if (s.comparison_result) {
      setCurrentSnapshot(s.comparison_result);
      setCurrentOffersWithCost(s.comparison_result.offers || []);
      setSelectedOfferId(s.comparison_result.selected_offer_id ?? null);
    } else {
      const tarifaTipo = detectTarifaTipo(s.extraction);
      const filtered = filterOffersByTarifa(offers, tarifaTipo);
      const { snapshot, offersWithCost } = buildComparison(s.extraction, filtered, taxConfig);
      setCurrentSnapshot(snapshot);
      setCurrentOffersWithCost(offersWithCost);
      setSelectedOfferId(snapshot.selected_offer_id);
    }
    setMode('view');
  }, [offers, taxConfig]);

  const handleEditSimulation = useCallback((s: SimulationRow) => {
    setExtraction(s.extraction);
    setFileName(s.file_name ?? 'Simulación guardada');
    setThumbnail(s.thumbnail_base64);
    setEditingId(s.id);
    setCurrentSnapshot(null);
    setCurrentOffersWithCost([]);
    setMode('wizard');
    setStep(2);
  }, []);

  const handleSelectOffer = useCallback(async (offerId: string) => {
    setSelectedOfferId(offerId);
    const updated = (() => {
      if (!currentSnapshot) return null;
      const offer = currentSnapshot.offers.find((o) => o.id === offerId);
      return {
        ...currentSnapshot,
        selected_offer_id: offerId,
        selected_offer_company: offer?.company_name ?? null,
      };
    })();
    setCurrentSnapshot(updated);

    if (editingId && updated) {
      await supabase
        .from('invoice_simulations')
        .update({ comparison_result: updated as unknown as Json })
        .eq('id', editingId);
      setSimulations((prev) =>
        prev.map((s) => s.id === editingId ? { ...s, comparison_result: updated } : s),
      );
    }
  }, [currentSnapshot, editingId]);

  const openSaveDialog = useCallback(() => {
    if (editingId) {
      const sim = simulations.find((s) => s.id === editingId);
      setSaveClientName(sim?.client_name ?? '');
      setSaveNotes(sim?.notes ?? '');
    } else {
      setSaveClientName(extraction?.titular ?? '');
      setSaveNotes('');
    }
    setSaveOpen(true);
  }, [editingId, simulations, extraction]);

  const handleSave = useCallback(async () => {
    if (!extraction || !currentSnapshot || !saveClientName.trim()) return;
    setSaving(true);
    try {
      const row = {
        client_name: saveClientName.trim(),
        file_name: fileName || null,
        thumbnail_base64: thumbnail,
        extraction: extraction as unknown as Json,
        comparison_result: currentSnapshot as unknown as Json,
        notes: saveNotes.trim() || null,
        created_by: user?.id ?? null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('invoice_simulations')
          .update(row)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Simulación actualizada' });
      } else {
        const { error } = await supabase
          .from('invoice_simulations')
          .insert(row);
        if (error) throw error;
        toast({ title: 'Simulación guardada' });
      }
      setSaveOpen(false);
      await fetchSimulations();
      goToList();
    } catch (err) {
      const msg = (err as any)?.message ?? (err instanceof Error ? err.message : 'No se pudo guardar');
      toast({ title: 'Error', description: String(msg), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [extraction, currentSnapshot, saveClientName, saveNotes, fileName, thumbnail, user, editingId, fetchSimulations, goToList]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('invoice_simulations')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Simulación eliminada' });
      setDeleteTarget(null);
      await fetchSimulations();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'No se pudo eliminar', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchSimulations]);

  return (
    <div className="mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Zap className="h-6 w-6" />Simulador de facturas</h2>
        <p className="text-muted-foreground mt-1">Sube una factura, revisa los datos extraídos y consulta la mejor oferta</p>
      </div>

      {/* LIST MODE */}
      {mode === 'list' && (
        <SimulationsList
          simulations={simulations}
          loading={loadingSims}
          onNew={goToWizard}
          onView={handleViewSimulation}
          onEdit={handleEditSimulation}
          onDelete={setDeleteTarget}
          onExport={() => exportCsv(simulations)}
        />
      )}

      {/* WIZARD MODE */}
      {mode === 'wizard' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={goToList}><ArrowLeft className="h-4 w-4 mr-1" />Volver a lista</Button>
          </div>
          <StepIndicator step={step} />

          {step === 1 && <UploadStep onExtracted={handleExtracted} onThumbnailReady={handleThumbnailReady} />}

          {step === 2 && extraction && (
            <ExtractionStep
              extraction={extraction}
              fileName={fileName}
              onChange={handleFieldChange}
              onCalculate={handleCalculate}
              onBack={editingId ? goToList : goToWizard}
            />
          )}

          {step === 3 && extraction && currentSnapshot && (
            <>
              {loadingOffers ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin mr-2" />Cargando ofertas...</div>
              ) : (
                <>
                  <ComparisonView
                    extraction={extraction}
                    offersWithCost={currentOffersWithCost}
                    snapshot={currentSnapshot}
                    thumbnail={thumbnail}
                    selectedOfferId={selectedOfferId}
                    onSelectOffer={handleSelectOffer}
                    taxConfig={taxConfig}
                  />
                  <div className="flex items-center justify-between pt-4">
                    <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" />Editar datos</Button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={goToWizard}><RotateCcw className="h-4 w-4 mr-2" />Nueva factura</Button>
                      <Button onClick={openSaveDialog}><Save className="h-4 w-4 mr-2" />{editingId ? 'Actualizar' : 'Guardar'}</Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* VIEW MODE (from saved simulation) */}
      {mode === 'view' && extraction && currentSnapshot && (
        <>
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={goToList}><ArrowLeft className="h-4 w-4 mr-1" />Volver a lista</Button>
            <div className="flex items-center gap-2">
              {editingId && (
                <Button variant="outline" size="sm" onClick={() => { setMode('wizard'); setStep(2); }}>
                  <Pencil className="h-4 w-4 mr-1" />Editar datos
                </Button>
              )}
            </div>
          </div>
          <ComparisonView
            extraction={extraction}
            offersWithCost={currentOffersWithCost}
            snapshot={currentSnapshot}
            thumbnail={thumbnail}
            selectedOfferId={selectedOfferId}
            onSelectOffer={handleSelectOffer}
            taxConfig={taxConfig}
          />
        </>
      )}

      {/* SAVE DIALOG */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Actualizar simulación' : 'Guardar simulación'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre del cliente *</Label>
              <Input value={saveClientName} onChange={(e) => setSaveClientName(e.target.value)} placeholder="Ej: Juan García" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea value={saveNotes} onChange={(e) => setSaveNotes(e.target.value)} placeholder="Observaciones sobre esta simulación..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!saveClientName.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Actualizar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar simulación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar la simulación de <strong>{deleteTarget?.client_name}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
