import { ColaboradoresLandingLayout } from '@/components/colaboradores/ColaboradoresLandingLayout';
import { LandingHazteColaborador } from '@/components/colaboradores/LandingHazteColaborador';

export default function HazteColaboradorPage() {
  return (
    <ColaboradoresLandingLayout
      title="Tulavita · Hazte colaborador"
      description="Recomienda luz y cobra cada mes. Programa de colaboradores con simulador, FAQ y bot de atención."
    >
      <LandingHazteColaborador />
    </ColaboradoresLandingLayout>
  );
}
