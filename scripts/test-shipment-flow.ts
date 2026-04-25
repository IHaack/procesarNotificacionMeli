/**
 * @fileoverview Script de prueba para ejecutar el flujo completo de procesamiento de un shipment
 * 
 * Este script permite debuggear el procesamiento de un shipment específico
 * mostrando todas las respuestas de MELI y los pasos del proceso.
 * 
 * Uso:
 *   npx ts-node scripts/test-shipment-flow.ts
 */

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import * as path from "path";
import * as fs from "fs";

// Inicializar Firebase Admin:
// 1) Usa serviceAccount.json si existe en la raíz del proyecto.
// 2) Si no existe, usa Application Default Credentials (ADC).
const serviceAccountPath = path.join(__dirname, "..", "serviceAccount.json");
if (fs.existsSync(serviceAccountPath)) {
  initializeApp({
    credential: cert(serviceAccountPath),
  });
} else {
  initializeApp({
    credential: applicationDefault(),
  });
}

// Importar funciones necesarias del servicio MELI
import { 
  fetchShipmentDetails, 
  fetchPackDetails,
  fetchOrderDetails,
  searchOrdersByShipment,
  fetchAuthenticatedUserId,
  fetchBillingInfo
} from "../src/services/meli.services";
import {
  mapToDbOrder,
  mapToDbOrderItems,
  mapToDbShipment,
} from "../src/adapters/db.adapter";

// ====================================================================
// CONFIGURACIÓN
// ====================================================================
const SHIPMENT_ID_TO_TEST = "46927342474"; // Cambiar según necesidad
const TRACE_ID = `TEST-${Date.now()}`;
// Opcional: forzar seller si el shipment no trae source.sender_id/source.seller_id
const SELLER_ID_OVERRIDE: number | null = null;
// Si es true, imprime el documento completo mapeado; si es false, imprime preview.
const SHOW_FULL_MAPPED_DOCUMENTS = false;

// ====================================================================
// FUNCIONES AUXILIARES
// ====================================================================

function log(emoji: string, message: string, data?: any) {
  console.log(`\n${emoji} ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function separator(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`  ${title}`);
  console.log("=".repeat(80));
}

function previewDocument(label: string, doc: Record<string, unknown>) {
  if (SHOW_FULL_MAPPED_DOCUMENTS) {
    log("🧾", `${label} (completo):`, doc);
    return;
  }

  const preview = Object.fromEntries(Object.entries(doc).slice(0, 16));
  log("🧾", `${label} (preview):`, preview);
}

// ====================================================================
// FLUJO PRINCIPAL
// ====================================================================

async function testShipmentFlow() {
  try {
    separator(`INICIANDO PRUEBA DE SHIPMENT: ${SHIPMENT_ID_TO_TEST}`);
    
    // ====================================================================
    // PASO 1: Obtener detalles del shipment
    // ====================================================================
    separator("PASO 1: Obtener detalles del shipment desde MELI");
    
    log("📡", `Consultando shipment ID: ${SHIPMENT_ID_TO_TEST}`);
    const shipment = await fetchShipmentDetails(Number(SHIPMENT_ID_TO_TEST), TRACE_ID);
    
    log("✅", "Shipment obtenido exitosamente");
    log("📦", "Datos del shipment:", {
      id: shipment.id,
      status: shipment.status,
      substatus: shipment.substatus,
      logistic_type: shipment.logistic?.type,
      external_reference: shipment.external_reference,
      tracking_number: shipment.tracking_number,
      tracking_method: shipment.tracking_method,
    });

    // ====================================================================
    // PASO 2: Resolver Pack ID y Orders (external_reference o orders/search)
    // ====================================================================
    separator("PASO 2: Resolver Pack ID y Orders");
    
    let packId: string | null = shipment.external_reference ? String(shipment.external_reference) : null;
    let orderIds: number[] = [];
    let resolutionSource: "external_reference" | "orders_search" = "external_reference";

    if (packId) {
      log("✅", `Pack ID encontrado desde external_reference: ${packId}`);
      const packDetails = await fetchPackDetails(packId, TRACE_ID);
      orderIds = (packDetails.orders || []).map((order) => order.id);
      log("📦", `Órdenes resueltas desde pack: ${orderIds.join(", ")}`);
    } else {
      resolutionSource = "orders_search";
      const sellerId =
        (shipment as any)?.source?.sender_id ||
        (shipment as any)?.source?.seller_id ||
        SELLER_ID_OVERRIDE ||
        await fetchAuthenticatedUserId(TRACE_ID);

      if (!sellerId) {
        throw new Error(
          "Shipment sin external_reference y sin seller_id/source.sender_id. Define SELLER_ID_OVERRIDE."
        );
      }

      log("⚠️", "Shipment sin external_reference detectado");
      log("📡", `Consultando orders/search con seller=${sellerId} y shipping.id=${SHIPMENT_ID_TO_TEST}`);
      const searchPayload = await searchOrdersByShipment(Number(sellerId), Number(SHIPMENT_ID_TO_TEST), TRACE_ID);

      const results = searchPayload.results || [];
      if (results.length === 0) {
        throw new Error("orders/search no devolvió resultados para este shipment");
      }

      const distinctPackIds = Array.from(
        new Set(
          results
            .map((result) => result.pack_id)
            .filter((value): value is number => typeof value === "number")
        )
      );

      if (distinctPackIds.length > 1) {
        throw new Error(
          `orders/search devolvió múltiples pack_id: ${distinctPackIds.join(", ")}`
        );
      }

      const orderIdsFromPayments = results.flatMap((result) =>
        (result.payments || [])
          .map((payment) => payment.order_id)
          .filter((orderId): orderId is number => typeof orderId === "number")
      );
      const orderIdsFromResults = results
        .map((result) => result.id)
        .filter((id): id is number => typeof id === "number");

      orderIds = Array.from(
        new Set(orderIdsFromPayments.length > 0 ? orderIdsFromPayments : orderIdsFromResults)
      );
      if (orderIds.length === 0) {
        throw new Error("No fue posible resolver order_ids desde orders/search");
      }

      packId = distinctPackIds.length === 1 ? String(distinctPackIds[0]) : null;

      log("✅", "Fallback orders/search resuelto");
      log("📦", "Datos resueltos:", {
        pack_id: packId || "(no aplica, orden individual)",
        orders_count: orderIds.length,
        order_ids: orderIds,
      });
    }

    // ====================================================================
    // PASO 3: Consultar Pack en MELI (si aplica)
    // ====================================================================
    if (packId) {
      separator("PASO 3: Consultar Pack en MELI");
      log("📡", `Consultando pack ID: ${packId}`);

      try {
        const packDetails = await fetchPackDetails(packId, TRACE_ID);
      
        log("✅", "Pack obtenido exitosamente");
        log("📦", "Detalles del pack:", {
          id: packDetails.id,
          status: packDetails.status,
          status_detail: packDetails.status_detail,
          orders_count: packDetails.orders?.length || 0,
          shipment_id: packDetails.shipment?.id,
          orders: packDetails.orders?.map(o => ({
            id: o.id,
            static_tags: o.static_tags,
          })),
        });

        const orderIdsFromPack = (packDetails.orders || []).map((order) => order.id);
        if (orderIdsFromPack.length > 0) {
          orderIds = orderIdsFromPack;
        }
      } catch (error: any) {
        log("⚠️", "No se pudo consultar detalle del pack. Se continuará con las órdenes ya resueltas.");
        log("📋", "Detalles del error:", {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
      }
    } else {
      separator("PASO 3: Consultar Pack en MELI");
      log("ℹ️", "No aplica para este shipment: orders/search no devolvió pack_id (orden individual).");
    }

    // ====================================================================
    // PASO 4: Procesar órdenes resueltas
    // ====================================================================
    separator(`PASO 4: Procesando ${orderIds.length} órdenes resueltas`);
    let totalOrderItemsForShipment = 0;
    
    if (orderIds.length > 0) {
      for (const orderId of orderIds) {
        log("📦", `Procesando orden ID: ${orderId}`);
        
        try {
          const orderDetails = await fetchOrderDetails(`/orders/${orderId}`, TRACE_ID);
          
          log("✅", `Orden ${orderId} obtenida exitosamente`);
          log("📋", "Detalles de la orden:", {
            status_detail: orderDetails.status_detail,
            pack_id: orderDetails.pack_id,
            total_amount: orderDetails.total_amount,
            paid_amount: orderDetails.paid_amount,
            buyer_id: orderDetails.buyer?.id,
            buyer_nickname: orderDetails.buyer?.nickname,
            items_count: orderDetails.order_items?.length || 0,
            payments_count: orderDetails.payments?.length || 0,
          });

          // ====================================================================
          // PASO 5: Simular mapeo a colecciones normalizadas (sin escritura)
          // ====================================================================
          const siteId = orderDetails.context?.site || orderDetails.payments?.[0]?.site_id;
          const billingInfoId = orderDetails.buyer?.billing_info?.id;
          log("🔎", "Contexto billing para order:", {
            order_id: orderId,
            site_id: siteId || null,
            billing_info_id: billingInfoId || null,
            buyer_billing_info_in_order: orderDetails.buyer?.billing_info || null,
          });

          let meliBillingInfo: any = null;
          try {
            const billingPayload = await fetchBillingInfo(siteId, billingInfoId, TRACE_ID);
            log("🧾", "Respuesta fetchBillingInfo (raw):", billingPayload);
            meliBillingInfo = billingPayload.billing_info;
          } catch (billingError: any) {
            log("⚠️", `No se pudo obtener billing info para order ${orderId}: ${billingError.message}`);
          }

          const dbOrder = mapToDbOrder(orderDetails, meliBillingInfo, TRACE_ID);
          const dbOrderItems = mapToDbOrderItems(orderDetails, TRACE_ID);
          const dbShipment = mapToDbShipment(shipment, orderDetails.id, packId, TRACE_ID);
          totalOrderItemsForShipment += dbOrderItems.length;

          separator(`PASO 5: Preview mapeo DB para order ${orderId}`);
          previewDocument("Orders", dbOrder as unknown as Record<string, unknown>);
          log("🧾", "Orders.buyer_info.billing_info:", dbOrder.buyer_info?.billing_info || null);
          previewDocument("Shipments", dbShipment as unknown as Record<string, unknown>);
          log("🧾", "OrderItems (resumen):", {
            count: dbOrderItems.length,
            items: dbOrderItems.map((item) => ({
              order_id: item.order_id,
              meli_item_id: item.meli_item_id,
              seller_sku: item.seller_sku,
              title: item.title,
              quantity: item.quantity,
              unit_price: item.unit_price,
              sale_fee: item.sale_fee,
            })),
          });
          
        } catch (error: any) {
          log("❌", `Error procesando orden ${orderId}: ${error.message}`);
          if (error.response?.status === 403 || error.response?.status === 404) {
            log("ℹ️", "Este error es esperado para órdenes canceladas/eliminadas");
          }
        }
      }
    }

    separator("PASO 6: Resumen de items del shipment");
    log("📦", "Conteo total de OrderItems mapeados para este shipment:", {
      shipment_id: SHIPMENT_ID_TO_TEST,
      order_count: orderIds.length,
      total_order_items_mapped: totalOrderItemsForShipment,
      nota: "Se genera 1 documento en OrderItems por item de cada orden, no por shipment consolidado.",
    });

    // ====================================================================
    // RESUMEN
    // ====================================================================
    separator("✅ PRUEBA COMPLETADA EXITOSAMENTE");
    log("📊", "Resumen:");
    console.log(`  - Shipment ID: ${SHIPMENT_ID_TO_TEST}`);
    console.log(`  - Pack ID: ${packId || "(no aplica)"}`);
    console.log(`  - Fuente de resolución: ${resolutionSource}`);
    console.log(`  - Orders resueltas: ${orderIds.length}`);
    console.log(`  - Estado del shipment: ${shipment.status}`);
    console.log(`  - Tipo logístico: ${shipment.logistic?.type}`);
    
  } catch (error: any) {
    separator("❌ ERROR EN LA PRUEBA");
    console.error("Error completo:", error.message);
    if (error.response) {
      console.error("Respuesta HTTP:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
    }
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

// ====================================================================
// EJECUTAR
// ====================================================================

testShipmentFlow()
  .then(() => {
    console.log("\n✅ Script finalizado exitosamente\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script finalizado con errores\n");
    console.error(error);
    process.exit(1);
  });
