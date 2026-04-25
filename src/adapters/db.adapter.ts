/**
 * @fileoverview Adaptador para transformar los payloads de la API de MELI
 * a las interfaces de nuestra base de datos normalizada (Fuente de Verdad).
 */

import { Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  MeliOrderPayload,
  MeliBillingInfo,
  MeliBillingInfoPayload
} from "../interfaces/meli.interfaces";
import { Order, OrderItem, Shipment } from "../interfaces/db.interfaces";

/**
 * Extrae de forma segura los datos de facturación, ya sea que vengan anidados en "billing_info" (MeliBillingInfoPayload) o directos.
 * Ahora también extrae domicilio, comuna y región si están disponibles.
 */
export function extractBillingInfo(rawInfo: any): { 
  doc_type: string | null; 
  doc_number: string | null;
  city_name?: string | null;
  state_name?: string | null;
  street_name?: string | null;
  street_number?: string | null;
} | null {
  if (!rawInfo) return null;
  
  const info = rawInfo.billing_info ? rawInfo.billing_info : rawInfo;
  let docType = info.doc_type;
  let docNumber = info.doc_number;

  // Compatibilidad con formato alternativo:
  // billing_info.identification.{type,number}
  if ((!docType || !docNumber) && info.identification) {
    docType = docType || info.identification.type || null;
    docNumber = docNumber || info.identification.number || null;
  }

  let cityName = null;
  let stateName = null;
  let streetName = null;
  let streetNumber = null;

  // Buscar en additional_info como plan de contingencia y para sacar la dirección fiscal
  if (info.additional_info && Array.isArray(info.additional_info)) {
    const getValue = (type: string) => {
      const item = info.additional_info.find((i: any) => i.type === type);
      return item ? item.value : null;
    };

    if (!docType) docType = getValue('DOC_TYPE');
    if (!docNumber) docNumber = getValue('DOC_NUMBER');
    
    cityName = getValue('CITY_NAME');
    stateName = getValue('STATE_NAME') || getValue('STATE_CODE');
    streetName = getValue('STREET_NAME');
    streetNumber = getValue('STREET_NUMBER');
  }

  // Compatibilidad con formato alternativo:
  // billing_info.address.{city_name,state,street_name,street_number}
  if ((!cityName || !stateName || !streetName || !streetNumber) && info.address) {
    cityName = cityName || info.address.city_name || null;
    stateName = stateName || info.address.state?.name || info.address.state?.code || null;
    streetName = streetName || info.address.street_name || null;
    streetNumber = streetNumber || info.address.street_number || null;
  }

  if (!docType && !docNumber) return null;

  return {
    doc_type: docType || null,
    doc_number: docNumber || null,
    city_name: cityName,
    state_name: stateName,
    street_name: streetName,
    street_number: streetNumber
  };
}

/**
 * Mapea el payload de una orden de MELI a nuestra entidad `Order`.
 * @param meliOrder El payload de la orden obtenido de la API de MELI.
 * @param meliBillingInfo La información de facturación del comprador.
 * @param traceId La huella única para la trazabilidad de los logs.
 * @returns Un objeto `Order` listo para ser guardado en Firestore.
 */
export function mapToDbOrder(
  meliOrder: MeliOrderPayload,
  meliBillingInfo: MeliBillingInfoPayload | MeliBillingInfo | null | any,
  traceId: string
): Order {
  const logPrefix = `[Trace: ${traceId}] [mapToDbOrder]`;
  logger.info(`${logPrefix} Iniciando mapeo de Order ID: ${meliOrder.id}`);

  try {
    const primaryPayment = meliOrder.payments?.[0] || null;
    const cleanBillingInfo = extractBillingInfo(meliBillingInfo);

    const order: Order = {
      id: meliOrder.id,
      meli_pack_id: meliOrder.pack_id ? meliOrder.pack_id.toString() : null,
      meli_shipment_id: meliOrder.shipping?.id
        ? meliOrder.shipping.id.toString()
        : null,
      meli_seller_id: meliOrder.seller.id.toString(),
      status: meliOrder.status,
      tags: meliOrder.tags,
      buyer_info: {
        id: meliOrder.buyer.id,
        nickname: meliOrder.buyer.nickname,
        first_name: meliOrder.buyer.first_name,
        last_name: meliOrder.buyer.last_name,
        billing_info: cleanBillingInfo,
      },
      total_amount: meliOrder.total_amount,
      paid_amount: meliOrder.paid_amount,
      currency_id: meliOrder.currency_id,
      payment_info: primaryPayment
        ? {
          payment_id: primaryPayment.id,
          status: primaryPayment.status,
          status_detail: primaryPayment.status_detail,
          type: primaryPayment.payment_type,
          method: primaryPayment.payment_method_id,
          installments: primaryPayment.installments,
          marketplace_fee: primaryPayment.marketplace_fee,
          approved_at: Timestamp.fromDate(new Date(primaryPayment.date_approved)),
        }
        : null,
      meli_created_at: Timestamp.fromDate(new Date(meliOrder.date_created)),
      meli_closed_at: meliOrder.date_closed
        ? Timestamp.fromDate(new Date(meliOrder.date_closed))
        : null,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };

    logger.info(`${logPrefix} Mapeo de Order completado.`);
    return order;
  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico durante el mapeo de la orden.`, {
      errorMessage: err.message,
      errorStack: err.stack,
      meliOrderPayload: meliOrder,
    });
    throw err;
  }
}

/**
 * Mapea los ítems de una orden de MELI a nuestra entidad `OrderItem`.
 * @param meliOrder El payload de la orden obtenido de la API de MELI.
 * @param traceId La huella única para la trazabilidad de los logs.
 * @returns Un array de objetos `OrderItem` listos para ser guardados.
 */
export function mapToDbOrderItems(meliOrder: MeliOrderPayload, traceId: string): OrderItem[] {
  const logPrefix = `[Trace: ${traceId}] [mapToDbOrderItems]`;
  logger.info(`${logPrefix} Iniciando mapeo de ítems para Order ID: ${meliOrder.id}`);

  try {
    const items = meliOrder.order_items.map((item) => {
      const orderItem: OrderItem = {
        order_id: meliOrder.id,
        meli_item_id: item.item.id,
        seller_sku: item.item.seller_sku,
        title: item.item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        sale_fee: item.sale_fee,
      };
      return orderItem;
    });
    logger.info(`${logPrefix} Mapeo de ${items.length} ítems completado.`);
    return items;
  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico durante el mapeo de los ítems de la orden.`, {
      errorMessage: err.message,
      errorStack: err.stack,
      meliOrderPayload: meliOrder,
    });
    throw err;
  }
}

/**
 * Mapea el payload de un envío de MELI a nuestra entidad `Shipment`.
 * @param meliShipment El payload del envío obtenido de la API de MELI (cualquier formato).
 * @param orderId El ID de la orden a la que pertenece este envío.
 * @param packId El Pack ID (si existe) de la orden.
 * @param traceId La huella única para la trazabilidad de los logs.
 * @returns Un objeto `Shipment` listo para ser guardado en Firestore.
 */
export function mapToDbShipment(
  meliShipment: any, // Cambiamos a 'any' temporalmente para aceptar la nueva estructura dinámica
  orderId: number,
  packId: string | null,
  traceId: string
): Shipment {
  const logPrefix = `[Trace: ${traceId}] [mapToDbShipment]`;
  logger.info(`${logPrefix} Iniciando mapeo de Shipment ID: ${meliShipment.id}`);

  try {
    // Compatibilidad Inteligente: Busca el formato nuevo (destination) o hace fallback al antiguo (receiver_address)
    const addressSource = meliShipment.destination?.shipping_address || meliShipment.receiver_address;
    const receiverName = meliShipment.destination?.receiver_name || "";

    const shipment: Shipment = {
      id: meliShipment.id,
      order_id: orderId,
      meli_pack_id: packId ?? "",
      status: meliShipment.status,
      substatus: meliShipment.substatus || null,
      logistic_type: meliShipment.logistic?.type || "N/A",
      tracking_number: meliShipment.tracking_number || null,
      tracking_method: meliShipment.tracking_method || null,
      shipping_cost: meliShipment.lead_time?.cost || 0,
      
      receiver_address: addressSource
        ? {
          address_line: addressSource.address_line || "N/A",
          street_name: addressSource.street_name || "N/A",
          street_number: addressSource.street_number || "N/A",
          comment: addressSource.comment || "",
          receiver_name: receiverName,
          city: { id: addressSource.city?.id || null, name: addressSource.city?.name || "N/A" },
          state: { id: addressSource.state?.id || null, name: addressSource.state?.name || "N/A" },
          country: { id: addressSource.country?.id || null, name: addressSource.country?.name || "N/A" },
          latitude: addressSource.latitude || 0,
          longitude: addressSource.longitude || 0,
        }
        : null,

      substatus_history: meliShipment.substatus_history
        ? meliShipment.substatus_history.map((entry: any) => ({
          date: Timestamp.fromDate(new Date(entry.date)),
          status: entry.status,
          substatus: entry.substatus,
        }))
        : null,
      date_handling: meliShipment.status_history?.date_handling
        ? Timestamp.fromDate(new Date(meliShipment.status_history.date_handling))
        : null,
      date_ready_to_ship: meliShipment.status_history?.date_ready_to_ship
        ? Timestamp.fromDate(new Date(meliShipment.status_history.date_ready_to_ship))
        : null,
      date_shipped: meliShipment.status_history?.date_shipped
        ? Timestamp.fromDate(new Date(meliShipment.status_history.date_shipped))
        : null,
      date_delivered: meliShipment.status_history?.date_delivered
        ? Timestamp.fromDate(new Date(meliShipment.status_history.date_delivered))
        : null,
      meli_created_at: meliShipment.date_created 
        ? Timestamp.fromDate(new Date(meliShipment.date_created))
        : Timestamp.now(),
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    logger.info(`${logPrefix} Mapeo de Shipment completado.`);
    return shipment;
  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico durante el mapeo del envío.`, {
      errorMessage: err.message,
      errorStack: err.stack,
      meliShipmentPayload: meliShipment,
    });
    throw err;
  }
}