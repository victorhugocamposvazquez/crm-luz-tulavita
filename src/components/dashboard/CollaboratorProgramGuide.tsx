/**
 * Panel de inicio del programa de colaboradores: explica el ciclo de vida
 * (Captar → Activar → Operar → Liquidar) y da accesos directos a cada paso.
 * El KPI destacado es el de leads de reclutamiento pendientes de revisar.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Megaphone, Rocket, Users, Wallet, ArrowRight, Inbox, HelpCircle, Link2 } from 'lucide-react';
import { RECRUITMENT_CAMPAIGNS } from '@/components/colaboradores/colaboradores-config';

export type CollaboratorTab = 'inicio' | 'colaboradores' | 'reclutamiento' | 'ajustes';

type Step = {
  n: number;
  title: string;
  description: string;
  icon: typeof Megaphone;
  cta: string;
  tab: CollaboratorTab;
};

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Captar colaboradores',
    description:
      'Comparte la landing «Hazte colaborador» y el material por canal (QR/enlaces con seguimiento). Los interesados llegan como leads de reclutamiento.',
    icon: Megaphone,
    cta: 'Ir a Reclutamiento',
    tab: 'reclutamiento',
  },
  {
    n: 2,
    title: 'Activar al colaborador',
    description:
      'Convierte un lead (o da de alta manual) y genera su kit: enlaces firmados, QR y acceso al portal para que empiece a captar clientes.',
    icon: Rocket,
    cta: 'Ir a Colaboradores',
    tab: 'colaboradores',
  },
  {
    n: 3,
    title: 'Operar y atribuir',
    description:
      'El colaborador capta clientes con su enlace. Esos leads se asignan automáticamente al responsable de colaboradores que configures en Ajustes.',
    icon: Users,
    cta: 'Configurar responsable',
    tab: 'ajustes',
  },
  {
    n: 4,
    title: 'Liquidar comisiones',
    description:
      'En la ficha de cada colaborador revisas los clientes convertidos, generas liquidaciones y validas las facturas que sube en su portal.',
    icon: Wallet,
    cta: 'Ver colaboradores',
    tab: 'colaboradores',
  },
];

type Faq = { q: string; a: ReactNode };

const FAQS: Faq[] = [
  {
    q: 'Hay tres tipos de enlace. ¿Cuál es cuál?',
    a: (
      <ul className="ml-4 list-disc space-y-1.5">
        <li>
          <strong>Landing «Hazte colaborador»</strong> (pestaña Reclutamiento): para que entren{' '}
          <em>colaboradores nuevos</em>. Es pública; quien la rellena aparece como lead de reclutamiento.
        </li>
        <li>
          <strong>Kit de captación del colaborador</strong> (ficha del colaborador → Accesos y kit): para que el
          colaborador capte <em>clientes</em>. Cada cliente que entra queda atribuido a ese colaborador.
        </li>
        <li>
          <strong>Enlace de reclutamiento del colaborador</strong> (dentro del kit): es su enlace de{' '}
          <em>referido</em> para que él traiga <em>otros colaboradores</em>.
        </li>
      </ul>
    ),
  },
  {
    q: '¿Cómo se atribuye un cliente a un colaborador?',
    a: (
      <p>
        Cuando el cliente entra por el enlace del kit (lleva el código o un token firmado del colaborador), el lead se
        guarda con <code className="rounded bg-muted px-1">collaborator_id</code> de ese colaborador. Por eso es
        importante que el colaborador comparta SU enlace y no la landing genérica.
      </p>
    ),
  },
  {
    q: '¿Qué es el «responsable de colaboradores» y por qué configurarlo?',
    a: (
      <p>
        Es la persona del equipo a la que se asignan automáticamente los leads de reclutamiento y los clientes captados
        por colaboradores. Si no lo configuras (pestaña Ajustes), esos leads entran sin responsable y nadie los gestiona.
      </p>
    ),
  },
  {
    q: 'Enlace firmado vs enlace directo, ¿qué diferencia hay?',
    a: (
      <p>
        El <strong>firmado</strong> usa un token único (se puede revocar y medir). El <strong>directo</strong> lleva el
        código del colaborador en la URL (más simple pero no revocable). Para campañas y QR, usa el firmado.
      </p>
    ),
  },
  {
    q: '¿Cómo se paga al colaborador?',
    a: (
      <p>
        Defines una <strong>comisión por cliente convertido</strong> en su ficha. Cuando tenga clientes convertidos,
        desde la ficha (pestaña Pagos y facturas) generas una <strong>liquidación</strong> con los convertidos aún no
        pagados. El colaborador puede subir su factura desde el portal para que la valides.
      </p>
    ),
  },
  {
    q: '¿Qué es el portal del colaborador?',
    a: (
      <p>
        Una zona de autoservicio (acceso por enlace mágico/token) donde el colaborador ve sus enlaces, sus clientes y
        sube facturas. Generas su acceso desde la ficha → Accesos y kit.
      </p>
    ),
  },
];

type Props = {
  collaboratorCount: number;
  onNavigate: (tab: CollaboratorTab) => void;
};

export function CollaboratorProgramGuide({ collaboratorCount, onNavigate }: Props) {
  const [pendingRecruitment, setPendingRecruitment] = useState<number | null>(null);

  const loadPending = useCallback(async () => {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'web_form')
      .in('campaign', [...RECRUITMENT_CAMPAIGNS])
      .eq('status', 'new');
    setPendingRecruitment(count ?? 0);
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cómo funciona el programa</CardTitle>
          <CardDescription>
            El flujo es lineal: captas colaboradores, los activas con su kit, ellos captan clientes y, cuando
            convierten, liquidas su comisión. Cada paso te lleva a su sección.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const showBadge = step.tab === 'reclutamiento' && pendingRecruitment != null && pendingRecruitment > 0;
              return (
                <div
                  key={step.n}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Paso {step.n}</span>
                      <h3 className="text-sm font-semibold">{step.title}</h3>
                      {showBadge && (
                        <Badge variant="destructive" className="ml-auto">
                          {pendingRecruitment} pendiente{pendingRecruitment === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                    <Button variant="outline" size="sm" onClick={() => onNavigate(step.tab)}>
                      {step.cta}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate('reclutamiento')}
          className="flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{pendingRecruitment ?? '…'}</p>
            <p className="text-sm text-muted-foreground">Leads de reclutamiento pendientes de revisar</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('colaboradores')}
          className="flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{collaboratorCount}</p>
            <p className="text-sm text-muted-foreground">Colaboradores dados de alta</p>
          </div>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Conceptos clave y preguntas frecuentes
          </CardTitle>
          <CardDescription>
            Lo esencial para manejar el programa sin liarte con los enlaces, la atribución y los pagos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Regla rápida: la <strong>landing</strong> capta colaboradores; el <strong>kit</strong> de cada
              colaborador capta clientes. Para que un cliente cuente para un colaborador, debe entrar por el enlace de
              su kit.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
