# Fixtures para extracción de facturas

Modelos con fixture actual: **Endesa**, **Iberdrola**, **Naturgy**, **Repsol**. Para añadir más (p. ej. EDP, Holaluz), crea `golden/<modelo>.expected.json` y `texts/<modelo>.ocr.txt`; el test los descubre solos.

Cada factura tipo tiene:

- **`golden/<modelo>.expected.json`**: valores esperados (consumo_kwh, total_factura, company_name, period_months) para comparar con la extracción.
- **`texts/<modelo>.ocr.txt`** (opcional): texto OCR/Document AI guardado; permite tests sin llamar a la API.
- **`files/<modelo>.pdf`** o **`.jpg`** (opcional): el PDF o imagen original para tests de pipeline completo.

Los tests de regresión leen estos fixtures y comprueban que la extracción cumple los valores golden.
