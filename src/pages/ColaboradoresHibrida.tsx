import { ColaboradoresLandingLayout } from '@/components/colaboradores/ColaboradoresLandingLayout';
import { LandingHibrida } from '@/components/colaboradores/LandingHibrida';

export default function ColaboradoresHibridaPage() {
  return (
    <ColaboradoresLandingLayout
      title="Tulavita · Colaboradores · Híbrida"
      description="Recomienda luz y cobra cada mes. Programa de colaboradores con simulador, FAQ y bot de atención."
    >
      <LandingHibrida />
    </ColaboradoresLandingLayout>
  );
}
