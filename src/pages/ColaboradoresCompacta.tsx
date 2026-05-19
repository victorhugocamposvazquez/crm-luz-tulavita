import { ColaboradoresLandingLayout } from '@/components/colaboradores/ColaboradoresLandingLayout';
import { LandingCompacta } from '@/components/colaboradores/LandingCompacta';

export default function ColaboradoresCompactaPage() {
  return (
    <ColaboradoresLandingLayout
      title="Tulavita · Colaboradores"
      description="Recomienda luz y cobra cada mes. 45€ al firmar + 4,5€/mes recurrente. Sin permanencia."
    >
      <LandingCompacta />
    </ColaboradoresLandingLayout>
  );
}
