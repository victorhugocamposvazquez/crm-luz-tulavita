import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { waLink } from './colaboradores-config';

// ═══════════════════════════════════════════════════════════════
// Lara · bot rule-based para captación de colaboradores
// Sin IA. Árbol de decisión + chips + fuzzy match + form por pasos.
// 0€/mes. Edita las constantes de abajo para evolucionar el guion.
// ═══════════════════════════════════════════════════════════════

// ─── árbol de conversación ───
// Cada nodo: { text, replies: [{ label, go, action? }], action?, input?, end? }
const LARA_NODES = {

  // ════════════════════════════
  //   ENTRADA
  // ════════════════════════════
  start: {
    text: "¡Hola! Soy Lara 👋\n¿Qué te apetece saber?",
    replies: [
      { label: "💰 ¿Cuánto puedo ganar?", go: "ganar" },
      { label: "🤔 ¿Cómo funciona?", go: "funciona" },
      { label: "🧑‍💼 ¿Es para mí?", go: "perfil" },
      { label: "⏱️ ¿Cuándo cobro?", go: "cobro" },
      { label: "🛡️ ¿Sois fiables?", go: "confianza" },
      { label: "📞 Quiero apuntarme", go: "lead_intro" },
    ],
  },

  // ════════════════════════════
  //   1 · GANAR
  // ════════════════════════════
  ganar: {
    text: "Cobras **45€ al firmar** cada cliente + **4,5€/mes recurrente** mientras siga contratado. Sin techo y sin cuota mensual para ti.",
    replies: [
      { label: "📊 Probar el simulador", go: "scroll_sim", action: "scroll_simulador" },
      { label: "Ejemplos reales", go: "ejemplos" },
      { label: "¿Hay objetivos mínimos?", go: "minimos" },
      { label: "¿Hay bonus por volumen?", go: "bonus" },
      { label: "¿Y el IVA / Hacienda?", go: "fiscal" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  scroll_sim: {
    text: "Te he hecho scroll hasta el simulador 👆 — mueve el deslizador y verás tus ingresos estimados al año.",
    replies: [
      { label: "Vale, otra duda", go: "start" },
      { label: "📞 Quiero apuntarme", go: "lead_intro" },
    ],
  },
  ejemplos: {
    text: "Te paso tres reales:\n\n• **Marta**, peluquería en Lugo: pega el QR en el espejo. ~280€/mes extra.\n• **Iván**, estudiante en Ourense: capta entre familia y vecinas. ~180€/mes.\n• **Sandra**, gestoría en Santiago: pasó media cartera de PYMES. ~890€/mes recurrente.",
    replies: [
      { label: "Más historias", go: "ejemplos_2" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "🤔 ¿Cómo funciona?", go: "funciona" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  ejemplos_2: {
    text: "Más:\n\n• **Pablo**, agente inmobiliario en Vigo: al cerrar pisos ofrece luz. 4-5 firmas/mes.\n• **Lucía**, profe: lo comparte en el grupo del cole. 180€/mes con cero esfuerzo.\n• **Carmen y Antón**, jubilados en Pontevedra: comparten en su barrio. 220€/mes.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  minimos: {
    text: "**No.** No tienes que captar un mínimo. Si en un mes no firmas ninguno, no pasa nada — sigues teniendo tu enlace activo y el recurrente de los anteriores.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  bonus: {
    text: "Sí, escalado por volumen:\n\n• **10 firmas/mes**: +50€ bonus extra\n• **25 firmas/mes**: subes a recurrente premium (5,5€/mes)\n• **50 firmas/mes**: gestor dedicado + tarifa preferente para tus clientes\n\nDetalles completos en la formación.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  fiscal: {
    text: "Depende de tu situación:\n\n• **Particular**: te pagamos por SEPA neto. Lo declaras en la renta como rendimiento del trabajo. No hay que darse de alta en Hacienda hasta ~3.000€/año.\n• **Autónomo / empresa**: facturas tú con IVA al 21%.\n\nSi tienes dudas, te explicamos en la primera llamada.",
    replies: [
      { label: "¿Y si estoy en el paro?", go: "paro" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  paro: {
    text: "Sí, puedes. Las comisiones como particular no cuentan como contrato laboral — el SEPE no las considera empleo. Si pasas el umbral en algún mes, conviene declararlas para no tener sustos.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },

  // ════════════════════════════
  //   2 · FUNCIONA
  // ════════════════════════════
  funciona: {
    text: "Cuatro pasos, sin literatura:\n\n**1.** Te das de alta gratis\n**2.** Recibes tu enlace personal + QR\n**3.** Lo compartes (cliente, vecino, en el local, redes...)\n**4.** Cobras cada mes vía SEPA",
    replies: [
      { label: "¿Tengo que vender algo?", go: "vender" },
      { label: "¿Y si me da vergüenza?", go: "vergonzoso" },
      { label: "¿Qué materiales me dais?", go: "materiales" },
      { label: "¿Hay panel de seguimiento?", go: "panel" },
      { label: "¿Cómo me pagáis?", go: "pago" },
      { label: "¿Y la formación?", go: "formacion" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  vender: {
    text: "**No.** No vendes nada. Compartes el enlace o pasas el contacto y nuestro equipo se encarga de todo: llamar, asesorar y firmar el contrato.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  vergonzoso: {
    text: "Lo entiendo. **No tienes que hablar con nadie ni 'convencer'.** Pega el QR donde tengas visibilidad (espejo, escaparate, perfil de Instagram, mensajes de Whatsapp privados) y la gente que tenga interés escanea sola. Nada de discursos forzados.",
    replies: [
      { label: "¿Y si nadie escanea?", go: "minimos" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  materiales: {
    text: "Todo gratis y listo para usar:\n\n• Enlace personal con tu código de colaborador\n• QR físico impreso (te lo enviamos por mensajería)\n• QR digital para redes sociales\n• Carteles A4 y A5 listos para imprimir\n• Plantillas validadas para Instagram, Facebook y Stories\n• Mensaje tipo para WhatsApp\n• Vídeo explicativo de 30 segundos",
    replies: [
      { label: "¿Puedo hacer Meta Ads?", go: "meta_ads" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  meta_ads: {
    text: "Sí. Te pasamos plantillas **pre-validadas** para que no tengas problemas con la política de Meta (sector energético tiene restricciones). Hay colaboradores que sacan 3-4 firmas/mes solo con Ads bien hechos. En la formación te enseñamos.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  panel: {
    text: "Sí, panel web 24/7. Ves en tiempo real:\n\n• Leads que han llegado por tu enlace/QR\n• Estado de cada uno (contactado, firmado, baja)\n• Comisiones del mes y recurrente acumulado\n• Próximo pago y movimientos\n\nUsuario y contraseña los recibes al alta.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  pago: {
    text: "**Día 1 de cada mes** te llega la liquidación por SEPA.\n\n• Si eres particular: transferencia directa, tú declaras lo que toque.\n• Si tienes empresa o eres autónomo: nos facturas las comisiones.",
    replies: [
      { label: "¿Cuándo entra el primer pago?", go: "primer_pago" },
      { label: "¿Mínimo para cobrar?", go: "minimo_pago" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  primer_pago: {
    text: "Cuando el cliente firma y validamos la activación (suele ir en 48h), la comisión queda imputada al ciclo. El día 1 del mes siguiente, al banco.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  minimo_pago: {
    text: "**No.** Si en un mes solo tienes 4,5€ de recurrente, te entran 4,5€. No acumulamos ni retenemos nada.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  formacion: {
    text: "Videollamada de **30 min**, basta para empezar. Te enseñamos a:\n\n• Usar el panel\n• Leer una factura de luz en 1 min\n• Explicar el ahorro en 3 frases\n• Configurar tu QR y materiales\n\nDespués, masterclass mensual opcional para ir afilando.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },

  // ════════════════════════════
  //   3 · PERFIL
  // ════════════════════════════
  perfil: {
    text: "**Cualquiera puede.** No hay un perfil único ni hace falta cumplir nada concreto. Cuéntame el tuyo y te digo cómo encajaría:",
    replies: [
      { label: "Tengo un comercio o local", go: "perfil_local" },
      { label: "Soy autónomo / freelance", go: "perfil_autonomo" },
      { label: "Tengo trabajo fijo", go: "perfil_empleado" },
      { label: "Estoy en paro", go: "paro" },
      { label: "Estudiante / pensionista", go: "perfil_libre" },
      { label: "Administrador de fincas", go: "perfil_admin" },
      { label: "Soy menor de edad", go: "menor" },
      { label: "Soy extranjero/a", go: "extranjero" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  perfil_local: {
    text: "Perfecto. Pegas el QR en el local (mostrador, espejo, pared) y cuando un cliente pregunta o escanea, nos llega. Tú apenas tienes que hacer nada — solo recoger comisiones.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "Quiero info por WhatsApp", go: "wa" },
    ],
  },
  perfil_autonomo: {
    text: "Ideal. Lo facturas tú como servicio de intermediación. La mayoría de gestorías e inmobiliarias lo combinan con su actividad principal y cobran recurrente sin esfuerzo extra.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  perfil_empleado: {
    text: "Compatible. Lo haces en tu tiempo libre, sin horarios. Las comisiones te entran como particular vía transferencia y tú declaras lo que toque en la renta.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  perfil_libre: {
    text: "Mucha gente nuestra encaja aquí. Sin horarios, sin objetivos, comparte el enlace en tu círculo cuando quieras. Las comisiones llegan por transferencia.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  perfil_admin: {
    text: "Mina de oro 💰. Los administradores de fincas nos traen comunidades enteras (12-40 vecinos por edificio). Comisión por cada uno + recurrente. Te asignamos gestor dedicado desde el día 1.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  menor: {
    text: "Tienes que ser mayor de edad para abrir cuenta como colaborador. Pero podemos asignar la cuenta a un familiar adulto de confianza y tú llevas la actividad. Déjanos vuestros datos:",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  extranjero: {
    text: "Sí, con NIE en regla. Cobramos a cuenta bancaria española o de cualquier país SEPA. Atención en castellano, gallego, catalán, inglés y portugués.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },

  // ════════════════════════════
  //   4 · COBRO
  // ════════════════════════════
  cobro: {
    text: "**Comisión de firma**: al activar al cliente (~48h desde la firma), queda imputada al ciclo. **Recurrente**: cada día 1 del mes por SEPA mientras el cliente siga contratado.",
    replies: [
      { label: "¿Y si el cliente se va?", go: "cliente_baja" },
      { label: "¿Hay permanencia para mí?", go: "permanencia" },
      { label: "¿Qué pasa si no paga?", go: "impago" },
      { label: "¿Cómo me doy de baja yo?", go: "baja_colab" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  cliente_baja: {
    text: "Pierdes el recurrente de ese cliente, pero **la comisión de firma es tuya para siempre**. El resto de tu cartera sigue facturando normal.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  permanencia: {
    text: "**Cero.** Sin permanencia, sin cuota, sin objetivos. Si un día decides parar, paras. Los recurrentes que tengas activos los seguirías cobrando mientras esos clientes sigan con nosotros.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  impago: {
    text: "Si el cliente deja de pagar y se le da de baja, pierdes el recurrente — pero la comisión de firma sigue siendo tuya. Nunca te descontamos ni nos llevamos parte de comisiones anteriores.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  baja_colab: {
    text: "Cuando quieras. Un email o llamada y damos de baja la cuenta. Te seguimos pagando los recurrentes que tengas activos mientras esos clientes sigan con nosotros, salvo que pidas cancelación total.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },

  // ════════════════════════════
  //   5 · CONFIANZA
  // ════════════════════════════
  confianza: {
    text: "Pregunta tranquila lo que necesites. ¿Qué quieres saber?",
    replies: [
      { label: "¿Esto es piramidal / MLM?", go: "no_mlm" },
      { label: "¿Qué empresa es Tulavita?", go: "quienes_somos" },
      { label: "¿Cuánto lleváis funcionando?", go: "trayectoria" },
      { label: "¿Mis datos están seguros?", go: "privacidad" },
      { label: "¿Sois fiables?", go: "fiabilidad" },
      { label: "¿Tenéis oficina física?", go: "oficina" },
      { label: "Quiero hablar con un humano", go: "humano" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  no_mlm: {
    text: "**No.** No reclutas a nadie ni cobras por debajo de otros colaboradores. Es una comisión directa de la empresa por cada cliente que activamos. **Cero estructura piramidal.** Si encuentras otro colaborador, sois iguales — no hay jerarquía.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  quienes_somos: {
    text: "**Tulavita Energía** es una comercializadora eléctrica española con sede en Galicia. Registrada en CNMC. Operamos en toda España con tarifas indexadas y fijas, y ahora también gas natural.",
    replies: [
      { label: "¿Cuánto lleváis funcionando?", go: "trayectoria" },
      { label: "¿Cubrís toda España?", go: "cobertura" },
      { label: "¿También gas?", go: "gas" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
    ],
  },
  trayectoria: {
    text: "Llevamos **5 años operando**, con +12.000 clientes activos, +312 colaboradores y 4,9★ de valoración media (750 reseñas). Crecemos porque el ahorro real es real.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  privacidad: {
    text: "Tus datos solo se usan para pagarte y contactarte. Cumplimos **RGPD** y la legislación española. Si te das de baja, los borramos completamente. Nunca compartimos con terceros.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  fiabilidad: {
    text: "Sí. Comercializadora con **registro en CNMC** (organismo público regulador del sector). Auditoría externa anual. Pagos garantizados por SEPA (no manejamos tu dinero). Cancelas cuando quieras.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  oficina: {
    text: "Sí, oficina central en Galicia. Si vives cerca y prefieres pasarte en persona para firmar, lo organizamos sin problema.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  humano: {
    text: "Claro. Déjame tu nombre y teléfono y te llama un compañero en breve — esta vez sí, persona real 😉",
    replies: [
      { label: "📞 Vale, apuntadme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },

  // ════════════════════════════
  //   6 · COBERTURA / PRODUCTO
  // ════════════════════════════
  cobertura: {
    text: "**Toda España** peninsular, Baleares, Canarias, Ceuta y Melilla. Si tienes contactos en cualquier zona, podemos atenderlos.",
    replies: [
      { label: "¿También gas?", go: "gas" },
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  gas: {
    text: "¡Sí! También somos comercializadora de **gas natural**. Comisión: **30€ firma + 3€/mes recurrente** por cada cliente. Si captas luz+gas del mismo cliente, ambas comisiones acumulan.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  empresas_grandes: {
    text: "Sí, atendemos PYMES y empresas. Para clientes B2B grandes (consumos >50.000 kWh/año) hay tarifa especial y la comisión sube proporcionalmente. Te asignamos gestor dedicado.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  que_ofrecemos: {
    text: "Al cliente le ofrecemos:\n\n• Tarifa indexada o fija (suele ahorrar 20-40%)\n• Sin permanencia\n• Atención humana en español/gallego/catalán\n• Factura sin letra pequeña\n• Cambio gestionado por nosotros (sin cortes)\n\nNada de letra pequeña ni cláusulas raras.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },
  colision: {
    text: "El cliente queda asignado al colaborador que lo trajo primero — lo decide el código del enlace o QR que usó al registrarse. Cero peleas, todo trazado en el panel.",
    replies: [
      { label: "👍 Quiero apuntarme", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },

  // ════════════════════════════
  //   WhatsApp
  // ════════════════════════════
  wa: {
    text: "Pulsa el botón verde de WhatsApp 👉 abajo a la derecha. Ahí te respondo igual de rápido.",
    replies: [
      { label: "Mejor por aquí", go: "lead_intro" },
      { label: "⬅️ Volver al inicio", go: "start" },
    ],
  },

  // ════════════════════════════
  //   LEAD CAPTURE → WhatsApp
  // ════════════════════════════
  lead_intro: {
    text: "¡Genial! Para que el seguimiento sea rápido, sigamos por WhatsApp. ¿Cómo te llamas?",
    input: "name",
  },
  lead_whatsapp: {
    text: "Perfecto, {name} 🤝. Sigue por WhatsApp — yo ya he pasado tu contexto. Pulsa el botón verde y enviamos el primer mensaje listo:",
    replies: [
      { label: "📲 Continuar por WhatsApp", waMessage: "Hola Tulavita, soy {name}, vengo del bot Lara y quiero apuntarme como colaborador" },
      { label: "Antes prefiero seguir aquí", go: "start" },
    ],
  },

  // ════════════════════════════
  //   FALLBACK
  // ════════════════════════════
  fallback: {
    text: "No estoy segura de entenderte. Prueba a elegir una opción 👇 o dime con otras palabras qué quieres saber.",
    replies: [
      { label: "💰 ¿Cuánto puedo ganar?", go: "ganar" },
      { label: "🤔 ¿Cómo funciona?", go: "funciona" },
      { label: "🧑‍💼 ¿Es para mí?", go: "perfil" },
      { label: "🛡️ ¿Sois fiables?", go: "confianza" },
      { label: "📞 Quiero apuntarme", go: "lead_intro" },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// MATCHERS por palabras clave para texto libre.
// Se evalúan en orden — el primero que matchea gana. Las claves
// se comparan sin acentos y en minúsculas (ver laraMatch).
// ═══════════════════════════════════════════════════════════════
const LARA_MATCHERS = [
  // ── ganar / comisión ──
  { keys: ['cuanto gano', 'cuanto puedo ganar', 'cuanto cobro', 'cuanto se gana', 'cuanto pagan', 'cuanto pagais'], go: 'ganar' },
  { keys: ['ganar', 'gano', 'gana', 'comision', 'comisiones', 'dinero', 'sueldo', 'ingresos', 'pagan', 'pagais', 'cobrar', 'cobro', 'precio', 'pasta', 'guita'], go: 'ganar' },
  { keys: ['bonus', 'bono', 'extra', 'premio', 'incentivo', 'objetivos', 'ranking', 'top'], go: 'bonus' },
  { keys: ['minimo', 'minima', 'objetivo', 'cuota', 'tengo que vender x', 'meter al mes', 'firmar al mes'], go: 'minimos' },
  { keys: ['ejemplo', 'ejemplos', 'caso', 'casos', 'historia', 'historias', 'cuanto sacan otros', 'cuanto ganan'], go: 'ejemplos' },

  // ── funciona / proceso ──
  { keys: ['como funciona', 'como va', 'como es', 'proceso', 'pasos', 'que hay que hacer'], go: 'funciona' },
  { keys: ['vender', 'venta', 'vendedor', 'vendedora', 'tengo que vender'], go: 'vender' },
  { keys: ['verguenza', 'timido', 'timida', 'no se vender', 'no quiero hablar', 'me da palo', 'corte', 'apuro'], go: 'vergonzoso' },
  { keys: ['material', 'materiales', 'qr fisico', 'cartel', 'plantilla', 'recursos', 'flyer', 'me dais', 'que dais'], go: 'materiales' },
  { keys: ['panel', 'app', 'dashboard', 'plataforma', 'seguimiento', 'donde veo'], go: 'panel' },
  { keys: ['meta ads', 'facebook ads', 'instagram ads', 'redes ads', 'publicidad redes', 'anuncios'], go: 'meta_ads' },
  { keys: ['formacion', 'curso', 'enseñar', 'enseñais', 'aprender', 'me forman', 'capacitar'], go: 'formacion' },

  // ── pago ──
  { keys: ['como me pagais', 'forma de pago', 'sepa', 'transferencia', 'cuenta bancaria'], go: 'pago' },
  { keys: ['primer pago', 'cuando cobro la primera', 'cuando entra primera'], go: 'primer_pago' },
  { keys: ['minimo para cobrar', 'umbral pago', 'minimo de pago'], go: 'minimo_pago' },
  { keys: ['cuando cobro', 'cuando pagais', 'cuando me pagan', 'tiempo de pago', 'fecha de pago', 'dia de pago'], go: 'cobro' },
  { keys: ['hacienda', 'iva', 'impuesto', 'impuestos', 'renta', 'declarar', 'fiscal', 'fiscalidad'], go: 'fiscal' },
  { keys: ['paro', 'sepe', 'desempleo', 'subsidio', 'ayuda'], go: 'paro' },

  // ── perfil ──
  { keys: ['es para mi', 'me vale', 'vale para mi', 'sirvo', 'soy valido', 'perfil', 'requisito', 'requisitos'], go: 'perfil' },
  { keys: ['autonomo', 'autonoma', 'freelance', 'empresa', 'sociedad', 'sl ', 's.l.'], go: 'perfil_autonomo' },
  { keys: ['empleado', 'empleada', 'trabajo fijo', 'asalariado', 'asalariada', 'nomina', 'mi curro', 'mi trabajo'], go: 'perfil_empleado' },
  { keys: ['comercio', 'local', 'tienda', 'bar', 'cafeteria', 'peluqueria', 'restaurante', 'taller', 'farmacia'], go: 'perfil_local' },
  { keys: ['estudiante', 'universidad', 'fp', 'pensionista', 'jubilado', 'jubilada', 'jubi', 'casa', 'ama de casa'], go: 'perfil_libre' },
  { keys: ['administrador de fincas', 'fincas', 'comunidad', 'comunidades', 'vecinos', 'edificio'], go: 'perfil_admin' },
  { keys: ['menor', 'menor de edad', 'tengo 16', 'tengo 17', '16 años', '17 años', 'mayor de edad'], go: 'menor' },
  { keys: ['extranjero', 'extranjera', 'nie', 'inmigrante', 'no soy español', 'rumano', 'venezolano', 'colombiano'], go: 'extranjero' },

  // ── confianza / objeciones ──
  { keys: ['fiable', 'fiables', 'fiabilidad', 'seguro', 'seguros', 'estafa', 'engaño', 'timo', 'fraude', 'serio'], go: 'fiabilidad' },
  { keys: ['piramide', 'piramidal', 'mlm', 'multinivel', 'amway', 'herbalife', 'forever', 'piramidal?'], go: 'no_mlm' },
  { keys: ['quienes sois', 'que empresa', 'que es tulavita', 'sois quien', 'sobre vosotros', 'about', 'historia empresa'], go: 'quienes_somos' },
  { keys: ['cuanto lleváis', 'cuanto llevais', 'antiguedad', 'desde cuando', 'años funcionando', 'recientes'], go: 'trayectoria' },
  { keys: ['privacidad', 'datos', 'rgpd', 'gdpr', 'protección de datos', 'borrar datos'], go: 'privacidad' },
  { keys: ['oficina', 'sede', 'presencial', 'reunirme', 'persona'], go: 'oficina' },
  { keys: ['humano', 'persona real', 'no robot', 'no bot', 'hablar con alguien', 'una persona', 'real'], go: 'humano' },
  { keys: ['confianza', 'me da yuyu', 'me huele', 'sospecho', 'desconfianza', 'duda', 'dudas'], go: 'confianza' },

  // ── permanencia / baja ──
  { keys: ['permanencia', 'compromiso', 'atado', 'amarrado', 'penalizacion', 'multa'], go: 'permanencia' },
  { keys: ['cliente se va', 'cliente se baja', 'se da de baja', 'cambia de luz', 'cancela'], go: 'cliente_baja' },
  { keys: ['no paga', 'impago', 'moroso', 'morosidad', 'deja de pagar'], go: 'impago' },
  { keys: ['me doy de baja', 'darme baja', 'cancelar mi cuenta', 'dejar de colaborar', 'salirme'], go: 'baja_colab' },

  // ── cobertura / producto ──
  { keys: ['cobertura', 'toda españa', 'donde operais', 'mi region', 'mi ciudad', 'pueblo', 'galicia', 'andalucia', 'cataluña', 'madrid'], go: 'cobertura' },
  { keys: ['gas', 'gas natural', 'butano', 'propano'], go: 'gas' },
  { keys: ['empresa grande', 'pyme', 'industria', 'industrial', 'fabrica', 'naves', 'b2b', 'comunidad de propietarios'], go: 'empresas_grandes' },
  { keys: ['que ofreceis al cliente', 'tarifa', 'tarifas', 'que vendeis', 'pvpc', 'indexada', 'fija', 'precio luz'], go: 'que_ofrecemos' },
  { keys: ['colision', 'mismo cliente', 'dos colaboradores', 'duplicado', 'a quien le toca'], go: 'colision' },

  // ── acciones ──
  { keys: ['whatsapp', 'wapp', 'wsap', 'wa', 'wsp'], go: 'wa' },
  { keys: ['llamadme', 'llamame', 'que me llamen', 'contacto', 'apuntar', 'apuntarme', 'registrarme', 'registro', 'darme alta', 'alta', 'empezar', 'quiero empezar', 'firmar', 'inscribirme', 'sign up', 'unirme'], go: 'lead_intro' },

  // ── cortesía ──
  { keys: ['hola', 'hey', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'ola'], go: 'start' },
  { keys: ['gracias', 'thanks', 'graciñas', 'grazas', 'mil gracias', 'muchas gracias'], go: 'start' },
];

function laraMatch(text) {
  const t = text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  for (const m of LARA_MATCHERS) {
    for (const k of m.keys) {
      const kn = k.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      if (t.includes(kn)) return m.go;
    }
  }
  return null;
}

function laraInterpolate(text, lead) {
  return text.replace(/\{(\w+)\}/g, (_, k) => lead[k] || '');
}

function laraFormat(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p}</Fragment>
  );
}

// ═══════════════════════════════════════════════════════════════

function TvBot() {
  const [messages, setMessages] = useState([
    { role: 'bot', node: 'start' },
  ]);
  const [current, setCurrent] = useState('start');
  const [input, setInput] = useState('');
  const [lead, setLead] = useState({});
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const node = LARA_NODES[current] || LARA_NODES.fallback;
  const isLeadInput = node && node.input;
  const ended = node && node.end;

  const goTo = (nextId, action) => {
    if (action === 'scroll_simulador') {
      setTimeout(() => {
        const root = scrollRef.current && scrollRef.current.closest('.tv-root');
        const sim = root && root.querySelector('input[type=range]');
        if (sim) sim.closest('.tv-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    }
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setCurrent(nextId);
      setMessages((m) => [...m, { role: 'bot', node: nextId }]);
    }, 420 + Math.random() * 280);
  };

  const sendUser = (text, options = {}) => {
    const displayText = options.displayText || text;
    setMessages((m) => [...m, { role: 'user', text: displayText }]);

    if (options.directGo) {
      goTo(options.directGo, options.action);
      return;
    }

    if (isLeadInput) {
      const v = text.trim();
      if (node.input === 'name') {
        setLead((l) => ({ ...l, name: v.split(' ')[0] }));
        goTo('lead_whatsapp');
        return;
      }
    }

    const target = laraMatch(text);
    goTo(target || 'fallback');
  };

  const submit = (e) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setInput('');
    sendUser(v);
  };

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--line)',
      borderRadius: 22,
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(10,10,10,.06)',
    }}>
      {/* header */}
      <div style={{
        padding: '16px 18px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fcfcf9',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--accent)',
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 16,
          position: 'relative',
        }}>
          L
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 11, height: 11, borderRadius: '50%',
            background: '#18a058',
            border: '2px solid #fcfcf9',
          }}></span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Habla con Lara</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#18a058' }}></span>
            Disponible · responde al momento
          </div>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} style={{
        padding: '16px 18px',
        maxHeight: 380,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 10,
        scrollbarWidth: 'none',
      }}>
        {messages.map((m, i) => {
          const text = m.text || (m.node && laraInterpolate(LARA_NODES[m.node].text, lead));
          return (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
            }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: 16,
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-warm)',
                color: 'var(--fg)',
                fontSize: 14, lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
              }}>{laraFormat(text)}</div>
            </div>
          );
        })}
        {typing && (
          <div style={{ alignSelf: 'flex-start' }}>
            <div style={{
              padding: '12px 14px', borderRadius: 16,
              background: 'var(--bg-warm)', borderBottomLeftRadius: 4,
              display: 'flex', gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', animation: 'tv-dot 1.2s infinite' }}></span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', animation: 'tv-dot 1.2s infinite .15s' }}></span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', animation: 'tv-dot 1.2s infinite .3s' }}></span>
            </div>
          </div>
        )}
      </div>

      {/* quick replies */}
      {!typing && !ended && node && node.replies && (
        <div style={{
          padding: '4px 18px 14px',
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {node.replies.map((r, i) => {
            // reply tipo WhatsApp: renderiza <a> verde prominente
            if (r.waMessage) {
              const msg = laraInterpolate(r.waMessage, lead);
              return (
                <a key={i} href={waLink(msg)} target="_blank" rel="noopener" style={{
                  padding: '12px 18px',
                  border: 'none',
                  borderRadius: 999,
                  background: '#25D366',
                  color: '#fff',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 4px 12px rgba(37,211,102,.3)',
                  width: '100%',
                  justifyContent: 'center',
                }}>{r.label}</a>
              );
            }
            return (
              <button key={i} onClick={() => { sendUser(r.label, { displayText: r.label, directGo: r.go, action: r.action }); }} style={{
                padding: '8px 13px',
                border: '1px solid var(--line)',
                borderRadius: 999,
                background: 'var(--card)',
                fontSize: 12.5,
                fontFamily: 'inherit',
                color: 'var(--fg-soft)',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'background .12s, border-color .12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-warm)'; e.currentTarget.style.borderColor = 'var(--fg-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--line)'; }}
              >{r.label}</button>
            );
          })}
        </div>
      )}

      {/* input */}
      <form onSubmit={submit}
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--line)',
          background: '#fcfcf9',
          display: 'flex', gap: 8,
        }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={ended}
          placeholder={
            ended ? '¡Hablamos pronto!' :
            isLeadInput && node.input === 'name' ? 'Tu nombre...' :
            isLeadInput && node.input === 'phone' ? 'Tu teléfono...' :
            'Escribe o pulsa una opción...'
          }
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            padding: '10px 6px',
            fontFamily: 'inherit', fontSize: 14,
            color: 'var(--fg)',
            outline: 'none',
          }}
        />
        <button type="submit" disabled={!input.trim() || ended} style={{
          width: 38, height: 38, borderRadius: '50%',
          border: 'none',
          background: input.trim() && !ended ? 'var(--fg)' : 'var(--bg-warm)',
          color: input.trim() && !ended ? '#fff' : 'var(--muted)',
          cursor: input.trim() && !ended ? 'pointer' : 'default',
          display: 'grid', placeItems: 'center',
          transition: 'all .15s',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7"/>
          </svg>
        </button>
      </form>
    </div>
  );
}


export { TvBot };
