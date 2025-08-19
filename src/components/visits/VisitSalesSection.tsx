import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Sale {
  id: string;
  amount: number;
  sale_date: string;
  sale_lines?: {
    product_name: string;
    quantity: number;
    unit_price: number;
    paid_cash: boolean;
    is_paid: boolean;
    is_delivered: boolean;
  }[];
}

interface VisitSalesSectionProps {
  visitSales: Sale[];
}

export default function VisitSalesSection({ visitSales }: VisitSalesSectionProps) {
  if (visitSales.length === 0) return null;

  return (
    <div>
      <label className="text-sm font-medium">Ventas</label>
      <div className="mt-2 space-y-2">
        {visitSales.map((sale) => (
          <div key={sale.id} className="p-3 border rounded-lg bg-muted/50">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">€{sale.amount.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(sale.sale_date), "dd/MM/yyyy HH:mm", { locale: es })}
                </p>
              </div>
            </div>
            {sale.sale_lines && sale.sale_lines.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground">Productos:</p>
                {sale.sale_lines.map((line, index: number) => (
                  <div key={index} className="text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        {line.quantity}x {line.product_name} - €{line.unit_price.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className={`px-2 py-1 rounded ${line.paid_cash ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {line.paid_cash ? '✓' : '✗'} Efectivo
                      </span>
                      <span className={`px-2 py-1 rounded ${line.is_paid ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {line.is_paid ? '✓' : '✗'} Pagado
                      </span>
                      <span className={`px-2 py-1 rounded ${line.is_delivered ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {line.is_delivered ? '✓' : '✗'} Entregado
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}