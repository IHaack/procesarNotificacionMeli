/**
 * @fileoverview Define las interfaces de TypeScript para los objetos de la API de Mercado Libre.
 * Basado en la estructura de respuesta de la API de orders_v2 y las notificaciones de webhooks.
 */

// --- Interfaces para el Payload de un Pedido (API orders_v2) ---

/**
 * @interface MeliItem
 * @description Define la estructura de un ítem dentro del array 'order_items'.
 */
export interface MeliItem {
  id: string;
  title: string;
  category_id: string;
  variation_id: number | null;
  seller_custom_field: string | null;
  variation_attributes: any[];
  warranty: string;
  condition: string;
  seller_sku: string | null;
  global_price: number | null;
  net_weight: number | null;
  user_product_id: string;
  release_date: string | null;
}

/**
 * @interface MeliRequestedQuantity
 * @description Define la estructura de la cantidad solicitada.
 */
export interface MeliRequestedQuantity {
  measure: string;
  value: number;
}

/**
 * @interface MeliOrderItem
 * @description Define la estructura de un objeto dentro del array 'order_items'.
 */
export interface MeliOrderItem {
  item: MeliItem;
  quantity: number;
  requested_quantity: MeliRequestedQuantity;
  picked_quantity: number | null;
  unit_price: number;
  full_unit_price: number;
  full_unit_price_currency_id: string;
  currency_id: string;
  manufacturing_days: number | null;
  sale_fee: number;
  listing_type_id: string;
  base_exchange_rate: number | null;
  base_currency_id: string | null;
  element_id: number | null;
  discounts: any | null;
  bundle: any | null;
  compat_id: number | null;
  stock: any | null;
  kit_instance_id: string | null;
}

/**
 * @interface MeliPayment
 * @description Define la estructura de un objeto de pago en el array 'payments'.
 */
export interface MeliPayment {
  id: number;
  order_id: number;
  payer_id: number;
  collector: { id: number };
  card_id: number | null;
  reason: string;
  site_id: string;
  payment_method_id: string;
  currency_id: string;
  installments: number;
  issuer_id: string;
  atm_transfer_reference: {
    transaction_id: string | null;
    company_id: string | null;
  };
  coupon_id: number | null;
  activation_uri: string | null;
  operation_type: string;
  payment_type: string;
  available_actions: string[];
  status: string;
  status_code: string | null;
  status_detail: string;
  transaction_amount: number;
  transaction_amount_refunded: number;
  taxes_amount: number;
  shipping_cost: number;
  coupon_amount: number;
  overpaid_amount: number;
  total_paid_amount: number;
  installment_amount: number | null;
  deferred_period: number | null;
  date_approved: string;
  transaction_order_id: number | null;
  date_created: string;
  date_last_modified: string;
  marketplace_fee: number;
  reference_id: string | null;
  authorization_code: string | null;
}

/**
 * @interface MeliOrderPayload
 * @description La interfaz principal que define la estructura completa del payload de un pedido de MELI.
 */
export interface MeliOrderPayload {
  id: number;
  date_created: string;
  last_updated: string;
  date_closed: string;
  pack_id: number | null;
  fulfilled: boolean | null;
  buying_mode: string;
  shipping_cost: number | null;
  mediations: any[];
  total_amount: number;
  paid_amount: number;
  order_items: MeliOrderItem[];
  currency_id: string;
  payments: MeliPayment[];
  shipping: {
    id: number;
    receiver_address?: {
      city?: { name?: string };
      country?: { name?: string };
      state?: { name?: string };
      street_name?: string;
    };
  };
  status: string;
  status_detail: string | null;
  tags: string[];
  internal_tags: string[];
  feedback: {
    seller: any | null;
    buyer: any | null;
  };
  context: {
    channel: string;
    site: string;
    flows: string[];
  };
  seller: { id: number };
  buyer: {
    id: number;
    nickname: string;
    first_name: string;
    last_name: string;
    billing_info?: {
      id: string;
    };
  };
  taxes: {
    amount: number | null;
    currency_id: string | null;
    id: string | null;
  };
  cancel_detail: any | null;
  manufacturing_ending_date: string | null;
  order_request: {
    change: any | null;
    return: any | null;
  };
}

// --- Interfaz para la Notificación de Webhook ---

/**
 * @interface MeliNotification
 * @description Define la estructura de la notificación que llega al primer webhook
 *              y que se guarda en la colección 'webhookRecibidosMercadoLibre'.
 */
export interface MeliNotification {
  resource: string;
  user_id: number;
  topic: string;
  received: string;
  attempts: number;
  sent: string;
  application_id: number;
}

// --- Interfaz para el Payload de un Envío (API shipments) ---
// --- INICIO: VERSIÓN ACTUALIZADA Y DETALLADA ---

/**
 * @interface MeliShipmentPayload
 * @description Define la estructura del payload completo de un envío de MELI (formato nuevo con x-format-new: true).
 */
export interface MeliShipmentPayload {
  id: number;
  status: string;
  substatus?: string | null;
  tracking_number?: string | null;
  tracking_method?: string | null;
  external_reference?: string | null; // ← Pack ID asociado al shipment
  order_id?: number | null;
  date_created?: string;
  last_updated?: string;
  declared_value?: number;
  tags?: string[];
  logistic?: {
    mode?: string;
    type?: string;
    direction?: string;
  };
  lead_time?: {
    processing_time?: number | null;
    cost?: number;
    cost_type?: string;
    list_cost?: number;
    delivery_promise?: string;
    delivery_type?: string;
    service_id?: number;
    option_id?: number;
    currency_id?: string;
    estimated_delivery_time?: {
      date?: string;
      pay_before?: string;
      shipping?: number;
      handling?: number;
      unit?: string;
      type?: string;
    };
    estimated_delivery_limit?: {
      date?: string | null;
    };
    estimated_delivery_final?: {
      date?: string | null;
    };
    estimated_delivery_extended?: {
      date?: string | null;
    };
    shipping_method?: {
      id?: number;
      name?: string;
      type?: string;
      deliver_to?: string;
    };
  };
  dimensions?: {
    height?: number;
    width?: number;
    length?: number;
    weight?: number;
  };
  receiver_address?: {
    city?: { name?: string };
    state?: { name?: string };
    country?: { name?: string };
    address_line?: string;
    street_name?: string;
    street_number?: string;
    comment?: string;
    zip_code?: string;
  };
  status_history?: {
    date_shipped: string | null;
    date_delivered: string | null;
    date_handling: string | null;
    date_ready_to_ship: string | null;
  };
  substatus_history?: {
    date: string;
    substatus: string;
    status: string;
  }[];
  source?: {
    seller_id?: number | null;
    sender_id?: number | null;
  };
}

// --- FIN: VERSIÓN ACTUALIZADA Y DETALLADA ---

// --- Interfaces para Billing Info ---

/**
 * @interface MeliBillingInfo
 * @description Define la estructura del objeto de facturación que se espera de la API de MELI.
 */
export interface MeliBillingInfo {
  doc_type: string | null;
  doc_number: string | null;
  additional_info?: {
    type: string;
    value: string;
  }[];
}

/**
 * @interface MeliBillingInfoPayload
 * @description Define el payload completo de la respuesta del endpoint de billing_info.
 */
export interface MeliBillingInfoPayload {
  billing_info: MeliBillingInfo;
}

export interface MeliPackOrder {
  id: number;
  static_tags?: string[];
}

export interface MeliPackPayload {
  id: number;
  shipment?: {
    id: number;
  };
  orders: MeliPackOrder[];
  status?: string;
  status_detail?: string | null;
  family_pack_id?: number | null;
  trash_pack_id?: number | null;
  buyer?: {
    id: number;
  };
  date_created?: string;
  last_updated?: string;
}

export interface MeliOrderSearchResult {
  id: number;
  pack_id?: number | null;
  payments?: Array<{
    order_id?: number | null;
  }>;
}

export interface MeliOrderSearchPayload {
  query?: string;
  results: MeliOrderSearchResult[];
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
}

/**
 * @interface ProcessableState
 * @description Define la estructura de un estado de envío que puede iniciar
 *              el proceso de consolidación.
 */
export interface ProcessableState {
  status: string;
  substatus?: string; // La '?' lo hace opcional
}