import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Sale {
  id: string;
  amount: number;
  sale_date: string;
  sale_lines?: {
    products: { product_name: string }[];
    quantity: number;
    unit_price: number;
    financiada: boolean;
    transferencia: boolean;
    nulo: boolean;
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
                  <div key={index} className="text-xs space-y-2">
                    {line.products && line.products.length > 1 ? (
                      // Pack: mostrar productos en filas separadas
                      <div className="space-y-1">
                        {line.products.map((product, productIndex: number) => (
                          <div key={productIndex} className="text-muted-foreground">
                            {product.product_name || 'Sin nombre'}
                          </div>
                        ))}
                        <div className="flex gap-3 mt-2">
                          <span className={`px-2 py-1 rounded ${line.financiada ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {line.financiada ? '✓' : '✗'} Financiada
                          </span>
                          <span className={`px-2 py-1 rounded ${line.transferencia ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {line.transferencia ? '✓' : '✗'} Transferencia
                          </span>
                          <span className={`px-2 py-1 rounded ${line.nulo ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                            {line.nulo ? '✓' : '✗'} Nulo
                          </span>
                        </div>
                        <div className="text-right font-medium text-sm">
                          €{line.unit_price.toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      // Producto individual
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {line.quantity}x ({line.products.map(p => p.product_name).join(', ') || 'Sin productos'}) - €{line.unit_price.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1">
                          <span className={`px-2 py-1 rounded ${line.financiada ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {line.financiada ? '✓' : '✗'} Financiada
                          </span>
                          <span className={`px-2 py-1 rounded ${line.transferencia ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {line.transferencia ? '✓' : '✗'} Transferencia
                          </span>
                          <span className={`px-2 py-1 rounded ${line.nulo ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                            {line.nulo ? '✓' : '✗'} Nulo
                          </span>
                        </div>
                      </div>
                    )}
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