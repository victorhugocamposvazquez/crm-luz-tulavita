import { useState } from "react";
import { cn } from "@/lib/utils";
import { AHORRO_LUZ_CTA_GREEN } from "@/lib/ahorro-luz-public-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ctaBtn =
  "rounded-xl border border-neutral-900/15 px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-none transition-[filter] hover:brightness-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2";

const AVISO_LEGAL_TEXT = `En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico, se informa de que el titular de este sitio es Tulavita S.L.

Los contenidos de este sitio web, incluidos textos, gráficos y diseño, están protegidos por la legislación vigente en materia de propiedad intelectual e industrial. Queda prohibida su reproducción, distribución o comunicación pública sin autorización expresa.

La información ofrecida en esta página tiene carácter meramente informativo y orientativo, sin que constituya asesoramiento jurídico ni contractual vinculante. Tulavita S.L no se responsabiliza de los daños derivados del uso de la información aquí publicada cuando dicha información haya sido utilizada de forma independiente de un contrato o relación comercial formalizada.

Para cualquier consulta relacionada con este aviso o con el tratamiento de sus datos personales, puede contactar con nosotros a través de los canales indicados en el sitio web.`;

export function AhorroLuzPublicFooter({ className }: { className?: string }) {
  const [legalOpen, setLegalOpen] = useState(false);
  const year = new Date().getFullYear();

  return (
    <>
      <footer
        className={cn(
          "w-full shrink-0 border-t border-neutral-200 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-6",
          className,
        )}
      >
        <div className="mx-auto flex max-w-lg flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-[11px] leading-snug text-neutral-500 sm:text-xs">
          <span className="tabular-nums">
            Tulavita S.L {year}, derechos reservados
          </span>
          <span
            className="inline-block h-3 w-px shrink-0 bg-neutral-300"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setLegalOpen(true)}
            className="font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-900"
          >
            Aviso legal
          </button>
        </div>
      </footer>

      <Dialog open={legalOpen} onOpenChange={setLegalOpen}>
        <DialogContent className="z-[110] max-h-[85dvh] max-w-lg overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-left text-neutral-950">
              Aviso legal
            </DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-line text-left text-sm leading-relaxed text-neutral-600">
            {AVISO_LEGAL_TEXT}
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setLegalOpen(false)}
              className={cn(ctaBtn, "w-full py-3")}
              style={{ backgroundColor: AHORRO_LUZ_CTA_GREEN }}
            >
              Cerrar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
