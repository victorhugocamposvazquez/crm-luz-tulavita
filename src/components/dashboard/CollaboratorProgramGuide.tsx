/**
 * Panel de inicio del programa de colaboradores: explica el ciclo de vida
 * (Captar → Activar → Operar → Liquidar) y da accesos directos a cada paso.
 * El KPI destacado es el de leads de reclutamiento pendientes de revisar.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Rocket, Users, Wallet, ArrowRight, Inbox } from 'lucide-react';
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
    </div>
  );
}
