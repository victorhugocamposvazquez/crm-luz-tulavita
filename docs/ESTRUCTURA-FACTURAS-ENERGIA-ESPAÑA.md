# Estructura típica de facturas de energía (luz/gas) en España

Referencia para la extracción de campos (compañía, consumo kWh, total, periodo) en `server-lib/invoice/extract-fields.ts` y Document AI Invoice Parser.

---

## 1. Comercializadora / empresa

- Suele aparecer en cabecera o pie: **nombre de la empresa** (logo, “Factura de Luz”, “Factura de Gas”).
- Textos típicos: *“Comercializadora”*, *“Empresa suministradora”*, *“Suministrador”*.
- Nombres habituales: **Iberdrola**, **Endesa**, **Naturgy** (antes Gas Natural), **Repsol**, **EDP**, **Total Energies**, **Viesgo**, **Holaluz**, **Octopus**, **Plenitude**, **Cepsa**, **Luz en Casa**, etc.

---

## 2. Consumo (kWh)

- **Término de energía / energía activa**: coste variable según kWh consumidos.
- Frases típicas:
  - *“Consumo (kWh)”*, *“Consumo total”*, *“Consumo de energía”*
  - *“Energía activa”*, *“Término de energía”*
  - *“X.XXX kWh”*, *“X XXX kWh”* (con punto o espacio como separador de miles)
- En gas: consumo en **m³** que se convierte a kWh (factor ~10–11); si solo hay m³, se puede aproximar o ignorar para comparadoras de luz.
- A veces el consumo aparece como diferencia de lecturas: *“Lectura actual – Lectura anterior”*.

---

## 3. Importe total a pagar

- Frases habituales:
  - *“Total a pagar”*, *“Total importe”*, *“Importe total”*
  - *“Total factura”*, *“Total (IVA incluido)”*, *“TOTAL”*
  - *“Amount due”* (versiones bilingües)
- Formato: **número + €** o **€ + número**; decimales con **coma** (español) o **punto** (inglés/informático).
- El total suele ser el último importe destacado de la factura (pie o resumen).

---

## 4. Periodo de facturación

- Define si la factura es **mensual**, **bimensual** o **trimestral** (para pasar el total a “coste mensual”).
- Frases típicas:
  - *“Periodo de facturación”*, *“Periodo facturado”*, *“Facturación bimensual”*, *“Facturación trimestral”*, *“Facturación mensual”*
  - *“Del DD/MM/AAAA al DD/MM/AAAA”*, *“2 meses”*, *“3 meses”*
- Por defecto: **1 mes** si no se detecta otro periodo.

---

## 5. Desglose típico (contexto)

La factura suele incluir:

1. **Término de potencia** (€/kW y días)
2. **Término de energía** (consumo kWh × precio)
3. **Impuesto sobre la Electricidad (IEE)** ~5,1%
4. **Alquiler del contador** (si aplica)
5. **IVA** (21% o 10% reducido)
6. **Total a pagar**

No es necesario extraer cada línea; con **consumo (kWh)** y **total a pagar** basta para comparar ofertas.

---

## 6. Fuentes

- [Selectra – Factura de luz](https://selectra.es/energia/info/factura-luz)
- [Endesa – Sobre tu factura](https://endesa.com/es/te-ayudamos/sobre-tu-factura/ver-factura)
- [Naturgy – Entiende tu factura](https://www.naturgy.es/hogar/ayuda/entiende_tu_factura)
- [Iberdrola – Factura](https://www.iberdrola.es/luz/factura)
- [Todoluzygas – Entender la factura](https://www.todoluzygas.es/luz/tramites/entender-factura)
