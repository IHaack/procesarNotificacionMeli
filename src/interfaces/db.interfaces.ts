import { Timestamp } from "firebase-admin/firestore";

/**
 * @interface Order
 * @description Represents a single order record in the 'Orders' collection,
 *              mirroring the structure of an order from Mercado Libre.
 * @property {number} id - The unique identifier for the order from Mercado Libre.
 * @property {string | null} meli_pack_id - The ID of the shipping pack if the order is part of one.
 * @property {string | null} meli_shipment_id - The shipping ID associated with the order.
 * @property {string} meli_seller_id - The ID of the seller on Mercado Libre.
 * @property {string} status - The current status of the order (e.g., 'succeed', 'cancelled').
 * @property {string[]} tags - A list of tags associated with the order (e.g., 'paid', 'delivered').
 * @property {object} buyer_info - Contains information about the buyer.
 * @property {object | undefined} buyer_info.billing_info - Optional billing information for the buyer.
 * @property {number} total_amount - The total value of the order.
 * @property {number} paid_amount - The amount paid by the buyer.
 * @property {string} currency_id - The currency used for the transaction (e.g., 'CLP').
 * @property {object | null} payment_info - Details about the primary payment method used.
 * @property {Timestamp} meli_created_at - The timestamp when the order was created in Mercado Libre.
 * @property {Timestamp | null} meli_closed_at - The timestamp when the order was closed.
 * @property {Timestamp} created_at - The timestamp when the record was created in our database.
 * @property {Timestamp} updated_at - The timestamp of the last update to this record.
 */
export interface Order {
  id: number;
  meli_pack_id: string | null;
  meli_shipment_id: string | null;
  meli_seller_id: string;
  status: string;
  tags: string[];
  buyer_info: {
    id: number;
    nickname: string;
    first_name: string;
    last_name: string;
    // Billing information is optional because it's not always provided
    // by the API, especially for certain types of buyers or transactions.
    billing_info?: {
      doc_type: string | null;
      doc_number: string | null;
    };
  };
  total_amount: number;
  paid_amount: number;
  currency_id: string;
  payment_info: {
    payment_id: number;
    status: string;
    status_detail: string;
    type: string;
    method: string;
    installments: number;
    marketplace_fee: number;
    approved_at: Timestamp;
  } | null;
  meli_created_at: Timestamp;
  meli_closed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * @interface OrderItem
 * @description Represents a single item within an order in the 'OrderItems' collection.
 * @property {number} order_id - Foreign key linking to the Order's `id`.
 * @property {string} meli_item_id - The unique identifier for the item in Mercado Libre.
 * @property {string | null} seller_sku - The seller's custom SKU for the item.
 * @property {string} title - The title or name of the item.
 * @property {number} quantity - The number of units of this item in the order.
 * @property {number} unit_price - The price of a single unit of the item.
 * @property {number} sale_fee - The sales fee charged by Mercado Libre for this item.
 */
export interface OrderItem {
  order_id: number;
  meli_item_id: string;
  seller_sku: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  sale_fee: number;
}

/**
 * @interface SubstatusHistoryEntry
 * @description Defines the structure for a single entry in the shipment's sub-status history,
 *              allowing for a detailed audit trail of its state changes.
 * @property {Timestamp} date - The date and time when the status change occurred.
 * @property {string} status - The main status at that point in time.
 * @property {string} substatus - The specific sub-status at that point in time.
 */
export interface SubstatusHistoryEntry {
  date: Timestamp;
  status: string;
  substatus: string;
}

/**
 * @interface Shipment
 * @description Represents a shipment record in the 'Shipments' collection.
 * @property {number} id - The unique identifier for the shipment from Mercado Libre.
 * @property {number} order_id - Foreign key linking to the Order's `id`.
 * @property {string | null} meli_pack_id - The ID of the shipping pack if applicable.
 * @property {string} status - The primary status of the shipment (e.g., 'ready_to_ship').
 * @property {string | null} substatus - A more detailed status of the shipment.
 * @property {SubstatusHistoryEntry[] | null} substatus_history - An array tracking the history of status changes.
 * @property {string} logistic_type - The type of logistics used (e.g., 'Flex', 'Colecta').
 * @property {string | null} tracking_number - The tracking number for the shipment.
 * @property {string | null} tracking_method - The method or company used for tracking.
 * @property {number} shipping_cost - The cost of the shipment.
 * @property {object | null} receiver_address - The address details of the recipient.
 * @property {Timestamp | null} date_handling - Date the shipment entered handling.
 * @property {Timestamp | null} date_ready_to_ship - Date the shipment was marked as ready to ship.
 * @property {Timestamp | null} date_shipped - Date the shipment was actually dispatched.
 * @property {Timestamp | null} date_delivered - Date the shipment was delivered.
 * @property {Timestamp} meli_created_at - The timestamp when the shipment was created in Mercado Libre.
 * @property {Timestamp} created_at - The timestamp when the record was created in our database.
 * @property {Timestamp} updated_at - The timestamp of the last update to this record.
 */
export interface Shipment {
  id: number;
  order_id: number;
  meli_pack_id: string;
  status: string;
  substatus: string | null;
  substatus_history: SubstatusHistoryEntry[] | null;
  logistic_type: string;
  tracking_number: string | null;
  tracking_method: string | null;
  shipping_cost: number;
  // TODO: Refactor `receiver_address` into its own reusable `Address` interface.
  // This would improve modularity and allow it to be used in other contexts,
  // such as for the buyer's or seller's address information.
  receiver_address: {
    address_line: string;
    street_name: string;
    street_number: string;
    comment: string;
    receiver_name: string;
    city: { id: string | null; name: string };
    state: { id: string | null; name: string };
    country: { id: string | null; name: string };
    latitude: number;
    longitude: number;
  } | null;
  date_handling: Timestamp | null;
  date_ready_to_ship: Timestamp | null;
  date_shipped: Timestamp | null;
  date_delivered: Timestamp | null;
  meli_created_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * @interface InconsistencyLog
 * @description Represents a log entry for an inconsistency found when processing a shipment pack,
 *              stored in the 'enviosConInconsistencias' collection.
 * @property {string} id - The unique identifier for this log entry.
 * @property {string} shipmentId - The ID of the shipment where the inconsistency was detected.
 * @property {string} meli_pack_id - The pack ID associated with the inconsistency.
 * @property {string} mensaje - A human-readable message describing the inconsistency.
 * @property {"sin carga" | "cargado" | "reintento_fallido"} estado_de_carga - The processing state of this log.
 * @property {object[]} ordenesEsperadas - A list of order IDs that were expected in the pack.
 * @property {object[]} ordenesEncontradas - A list of order IDs that were actually found in the pack.
 * @property {string} payload_meli_pack - The raw JSON payload from the MELI pack API for debugging.
 * @property {Timestamp} ultimoIntento - The timestamp of the last attempt to process this log.
 * @property {string | undefined} ultimoError - An optional error message from the last failed reprocessing attempt.
 */
export interface InconsistencyLog {
  id: string;
  shipmentId: string;
  meli_pack_id: string;
  mensaje: string;
  // This state machine tracks the lifecycle of an inconsistency log.
  // 'sin carga' is the initial state.
  // 'cargado' means it has been successfully processed.
  // 'reintento_fallido' indicates that a manual or automated retry has failed.
  estado_de_carga: "sin carga" | "cargado" | "reintento_fallido";
  ordenesEsperadas: { id: string }[];
  ordenesEncontradas: { id: string }[];
  payload_meli_pack: string;
  ultimoIntento: Timestamp;
  ultimoError?: string;
  // New field (TAREA 1): tracks where the final consolidated order was created
  pedido_creado_en?: string;
  // New fields (TAREA 2): tracks automatic consolidation triggers
  consolidado_automaticamente?: boolean;
  trigger_desde?: string;
}