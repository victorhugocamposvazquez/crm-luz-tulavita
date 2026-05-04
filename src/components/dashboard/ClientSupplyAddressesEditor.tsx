import type { SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2 } from 'lucide-react';
import type { SupplyAddressDraft } from '@/lib/clients/supplyAddresses';
import { emptySupplyAddressDraft } from '@/lib/clients/supplyAddresses';

export type SupplyDraftsUpdater = SetStateAction<SupplyAddressDraft[]>;

interface ClientSupplyAddressesEditorProps {
  value: SupplyAddressDraft[];
  onChange: (next: SupplyDraftsUpdater) => void;
  disabled?: boolean;
}

export default function ClientSupplyAddressesEditor({
  value,
  onChange,
  disabled,
}: ClientSupplyAddressesEditorProps) {
  const updateRow = (localId: string, patch: Partial<SupplyAddressDraft>) => {
    onChange((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const removeRow = (localId: string) => {
    onChange((prev) => prev.filter((r) => r.localId !== localId));
  };

  return (
    <div className="space-y-3">
      <Separator />
      <div>
        <Label className="text-base">Puntos de suministro</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Direcciones de suministro y CUPS (opcional). Puedes añadir varios por cliente.
        </p>
      </div>

      <div className="space-y-4">
        {value.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Ninguno. Usa &quot;Añadir&quot; si aplica.</p>
        )}
        {value.map((row, idx) => (
          <div
            key={row.localId}
            className="rounded-lg border bg-muted/20 p-3 space-y-3 relative"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Punto {idx + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-destructive hover:text-destructive"
                disabled={disabled}
                onClick={() => removeRow(row.localId)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Quitar
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Etiqueta (opcional)</Label>
                <Input
                  placeholder="Ej. Casa, local, segunda residencia"
                  value={row.label}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.localId, { label: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Dirección de suministro</Label>
                <Input
                  placeholder="Calle, número, piso…"
                  value={row.direccion}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.localId, { direccion: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Localidad</Label>
                <Input
                  value={row.localidad}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.localId, { localidad: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Código postal</Label>
                <Input
                  value={row.codigo_postal}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.localId, { codigo_postal: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">CUPS (opcional)</Label>
                <Input
                  className="font-mono text-sm"
                  placeholder="ES0022…"
                  value={row.cups}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.localId, { cups: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Nota</Label>
                <Textarea
                  rows={2}
                  className="resize-none text-sm"
                  value={row.note}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.localId, { note: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full sm:w-auto gap-1.5"
        disabled={disabled}
        onClick={() => onChange((prev) => [...prev, emptySupplyAddressDraft()])}
      >
        <Plus className="h-4 w-4" />
        Añadir punto de suministro
      </Button>
    </div>
  );
}
