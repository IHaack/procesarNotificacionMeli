import { ProcessableState } from "../interfaces/meli.interfaces";

/**
 * @fileoverview Archivo de configuración centralizado para la aplicación.
 * Contiene constantes y configuraciones esenciales para el funcionamiento
 * de las Cloud Functions, incluyendo credenciales de API, nombres de colecciones
 * de Firestore y reglas de negocio.
 */

/**
 * @description Configuración general del proyecto en Google Cloud.
 * @property {string} projectId - El ID del proyecto en Google Cloud.
 * @property {string} region - La región donde se despliegan las funciones.
 */
export const projectConfig = {
  projectId: process.env.GCLOUD_PROJECT || "pickinglist-523b2",
  region: "us-central1",
};

/**
 * @description Define los nombres de las colecciones utilizadas en Firestore.
 * Esto centraliza los nombres para evitar errores de tipeo y facilitar
 * el mantenimiento si se necesita renombrar una colección.
 */
export const firestoreCollections = {
  // Colección donde se guardan las notificaciones crudas de MELI
  meliNotifications: "webhookRecibidosMercadoLibre",

  // --- COLECCIÓN DE PREPARACIÓN (A DEPRECAR) ---
  // Esta colección se usaba en la versión anterior y será eliminada
  // una vez que la nueva arquitectura esté completamente implementada.
  stagingOrders: "ordenesMercadoLibre",

  // --- COLECCIÓN FINAL DE DESTINO ---
  // Esta es la colección principal donde se almacenan los pedidos procesados.
  processedOrders: "PedidosBS",

  // --- COLECCIONES DE SOPORTE ---
  failedOrders: "pedidosConError",
  oAuthResponses: "oAuthResponses",
  products: "BaseDeDatosProductosBSale",
  packs: "BaseDeDatosPacksBSale",

  // --- COLECCIONES DE ERRORES ---
  reviewQueue: "enviosConInconsistencias", // Cola para revisión manual

  // --- NUEVAS COLECCIONES NORMALIZADAS (Nuestra Fuente de Verdad) ---
  orders: "Orders",
  orderItems: "OrderItems",
  shipments: "Shipments",
};

/**
 * @description Configuración relacionada con la API de Mercado Libre (MELI).
 */
export const meliConfig = {
  apiUrl: "https://api.mercadolibre.com",
  // Usaremos el ID del secreto para cargarlo de forma segura.
  appIdSecretKey: "CLIENT_ID_MERCADOLIBRE",
  redirectUri: "https://us-central1-pickinglist-523b2.cloudfunctions.net/oauthmercadolibre",
  oAuthDocId: "UXzSDkmBSknCwKlMxcUP",
};

/**
 * @description Define reglas de negocio y constantes utilizadas en la lógica de la aplicación.
 */
export const businessRules = {
  // Tasa de impuesto para cálculos
  taxRateIVA: 0.19,

  // --- Constantes migradas de la lógica de BSale ---

  // Descripciones de items que deben ser filtradas y no son productos reales
  EXCLUDED_DESCRIPTIONS: [
    "BLUEXPRESS",
    "SAFE LOGISTIC SERVICES (SLS)",
    "SLS LOGISTIC",
    "DESPACHO RM",
    "DESPACHO ZONA B",
    "DESPACHO ZONA A",
    "ZONA B",
    "ZONA A",
    "OTROS CARGOS",
  ],

  // URL por defecto para productos sin imagen
  URL_IMAGEN_DEFAULT:
    "https://s3.amazonaws.com/bsalemarket/imagenes/imagen-no-disponible.jpg",

  // --- AÑADIR NUEVAS CONSTANTES ---
  BSALE_MERCADOS_IMAGENES: [1, 3], // Los IDs de mercado para buscar imágenes


  // Constantes específicas de la lógica de BSale que podríamos necesitar
  VALID_DOCUMENT_TYPES: [22, 5, 32, 37, 2], //
  WHATSAPP_SELLER_ID: 7, //

  // --- AÑADIR NUEVA CONSTANTE AQUÍ ---
  /**
   * Define los estados y sub-estados de un envío de MELI que se consideran
   * válidos para iniciar nuestro proceso de consolidación de  pedidos.
   * Basado en la documentación oficial de MELI.
   */
  // Cambiamos el nombre para reflejar que son estados completos, no solo strings.
  MELI_SHIPMENT_PROCESSABLE_STATES: [
    { status: "ready_to_ship" },
  ] as ProcessableState[],
  ALLOWED_LOGISTIC_TYPES: ["Flex", "Colecta"], // Ejemplo: Ignoraremos los pedidos "Full"
};

/**
 * @description Configuración para la API de BSale.
 */
export const bsaleConfig = {
  secretId: "bsale-api-token", // El nombre de tu secreto en Secret Manager
  apiUrl: "https://api.bsale.io/v1",
};

/**
 * @description Configuración de seguridad para funciones específicas.
 */
export const securityConfig = {
  // Define un secreto que se usará para autorizar llamadas del Scheduler.
  // Es mejor gestionarlo como una variable de entorno en producción.
  schedulerSecret: process.env.SCHEDULER_SECRET || "KdXIffUU42cC4I53EyHmBuovZ",
};