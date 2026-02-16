/**
 * Loader con mensajes rotativos mientras se procesa la factura
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const MESSAGES = [
  'Analizando consumo…',
  'Comparando tarifas…',
  'Calculando mejor opción…',
];

const ROTATE_MS = 1500;

export function EnergySavingsLoader() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      <Loader2 className="h-12 w-12 animate-spin text-[#26606b]" aria-hidden />
      <p className="text-lg font-medium text-gray-700">{MESSAGES[index]}</p>
    </div>
  );
}
