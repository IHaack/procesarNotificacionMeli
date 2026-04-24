/**
 * @fileoverview Script de prueba para ejecutar el flujo completo de procesamiento de un shipment
 * 
 * Este script permite debuggear el procesamiento de un shipment específico
 * mostrando todas las respuestas de MELI y los pasos del proceso.
 * 
 * Uso:
 *   npx ts-node scripts/test-shipment-flow.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import * as path from "path";

// Inicializar Firebase Admin con las credenciales del service account
const serviceAccountPath = path.join(__dirname, "..", "serviceAccount.json");
initializeApp({
  credential: cert(serviceAccountPath)
});

// Importar funciones necesarias del servicio MELI
import { 
  fetchShipmentDetails, 
  fetchPackDetails,
  fetchOrderDetails
} from "../src/services/meli.services";

// ====================================================================
// CONFIGURACIÓN
// ====================================================================
const SHIPMENT_ID_TO_TEST = "46918383909"; // Cambiar según necesidad
const TRACE_ID = `TEST-${Date.now()}`;

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
    // PASO 2: Extraer pack_id o order_id
    // ====================================================================
    separator("PASO 2: Extraer Pack ID o Order ID");
    
    let packId = shipment.external_reference;
    let isIndividualOrder = false;
    
    if (!packId) {
      const orderId = (shipment as any).order_id;
      
      if (orderId) {
        log("⚠️", `Shipment SIN external_reference detectado`);
        log("📝", `Encontrado order_id: ${orderId}`);
        log("🤔", `Este parece ser una orden individual, NO un pack`);
        packId = String(orderId);
        isIndividualOrder = true;
      } else {
        log("❌", "ERROR: No se encontró ni external_reference ni order_id");
        throw new Error("Shipment sin identificador válido");
      }
    } else {
      log("✅", `Pack ID encontrado: ${packId}`);
      isIndividualOrder = false;
    }

    // ====================================================================
    // PASO 3: Intentar obtener detalles del pack
    // ====================================================================
    separator("PASO 3: Consultar Pack en MELI");
    
    log("📡", `Consultando pack/order ID: ${packId}`);
    log("🔍", `¿Es orden individual?: ${isIndividualOrder ? 'SÍ' : 'NO'}`);
    
    if (isIndividualOrder) {
      log("⚠️", "ADVERTENCIA: Intentando consultar endpoint de packs con un order_id");
      log("💡", "Esto probablemente resultará en error HTTP 400");
    }

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

      // ====================================================================
      // PASO 4: Procesar cada orden del pack
      // ====================================================================
      separator(`PASO 4: Procesando ${packDetails.orders?.length || 0} órdenes del pack`);
      
      if (packDetails.orders && packDetails.orders.length > 0) {
        for (const order of packDetails.orders) {
          log("📦", `Procesando orden ID: ${order.id}`);
          
          try {
            const orderDetails = await fetchOrderDetails(`/orders/${order.id}`, TRACE_ID);
            
            log("✅", `Orden ${order.id} obtenida exitosamente`);
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
            
          } catch (error: any) {
            log("❌", `Error procesando orden ${order.id}: ${error.message}`);
            if (error.response?.status === 403 || error.response?.status === 404) {
              log("ℹ️", "Este error es esperado para órdenes canceladas/eliminadas");
            }
          }
        }
      }
      
    } catch (error: any) {
      log("❌", "ERROR al obtener detalles del pack");
      log("📋", "Detalles del error:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      
      if (error.response?.status === 400) {
        separator("🔍 ANÁLISIS DEL ERROR 400");
        log("💡", "Este error significa que estás consultando el endpoint de packs con un order_id");
        log("📝", "Mensaje de MELI:", error.response?.data);
        
        if (isIndividualOrder) {
          log("✅", "CONFIRMADO: Este es una orden individual que pertenece a un pack");
          log("🔧", "SOLUCIÓN: Debes consultar el pack real, no la orden individual");
          
          // Intentar obtener detalles de la orden individual para ver a qué pack pertenece
          separator("PASO ALTERNATIVO: Consultar la orden individual directamente");
          
          try {
            const orderDetails = await fetchOrderDetails(`/orders/${packId}`, TRACE_ID);
            log("✅", "Orden individual obtenida exitosamente");
            log("📦", "Detalles de la orden:", {
              id: orderDetails.id,
              status: orderDetails.status,
              status_detail: orderDetails.status_detail,
              pack_id: orderDetails.pack_id,
              total_amount: orderDetails.total_amount,
              paid_amount: orderDetails.paid_amount,
              fulfilled: orderDetails.fulfilled,
            });
            
            if (orderDetails.pack_id) {
              log("🎯", `Esta orden pertenece al pack: ${orderDetails.pack_id}`);
              log("💡", `Deberías usar el pack_id ${orderDetails.pack_id} en lugar de order_id ${packId}`);
            }
            
          } catch (orderError: any) {
            log("❌", `Error al consultar orden individual: ${orderError.message}`);
          }
        }
      }
      
      throw error;
    }

    // ====================================================================
    // RESUMEN
    // ====================================================================
    separator("✅ PRUEBA COMPLETADA EXITOSAMENTE");
    log("📊", "Resumen:");
    console.log(`  - Shipment ID: ${SHIPMENT_ID_TO_TEST}`);
    console.log(`  - Pack/Order ID: ${packId}`);
    console.log(`  - Es orden individual: ${isIndividualOrder ? 'SÍ' : 'NO'}`);
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
