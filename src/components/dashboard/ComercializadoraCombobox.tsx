import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COMERCIALIZADORAS_ESPANA } from '@/constants/comercializadoras-espana';

export interface ComercializadoraComboboxProps {
  id?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Clases del contenido del popover (ancho). */
  popoverContentClassName?: string;
}

export function ComercializadoraCombobox({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'Sin comercializadora',
  popoverContentClassName,
}: ComercializadoraComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const label = value ?? '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal min-h-9 h-auto py-2 whitespace-normal text-left"
        >
          <span className={cn(!value && 'text-muted-foreground', 'line-clamp-2')}>
            {value ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'comercializadora-combobox-popover w-[min(100vw-2rem,28rem)] p-0 z-[400]',
          popoverContentClassName,
        )}
        align="start"
      >
        <Command
          filter={(cmdValue, search) => {
            const q = search.trim().toLowerCase();
            if (!q) return 1;
            return cmdValue.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar comercializadora…" />
          <CommandList className="max-h-[min(60vh,320px)]">
            <CommandEmpty>No hay coincidencias.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ sin comercializadora vacío"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value ? 'opacity-0' : 'opacity-100')} />
                Sin comercializadora
              </CommandItem>
              {COMERCIALIZADORAS_ESPANA.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  className="whitespace-normal"
                >
                  <Check
                    className={cn('mr-2 h-4 w-4 shrink-0', label === name ? 'opacity-100' : 'opacity-0')}
                  />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
