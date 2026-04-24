/**
 * @fileoverview Punto de entrada principal para la Cloud Function que procesa
 * notificaciones de MELI bajo una arquitectura de pipeline de 7 fases.
 */

// Firebase y Admin SDK
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { v4 as uuidv4 } from "uuid";

// --- Configuración, Servicios y Adaptadores ---
import {
  firestoreCollections,
  projectConfig,
  businessRules,
  securityConfig,
} from "./config/config";
import { MeliNotification } from "./interfaces/meli.interfaces";
import {
  fetchOrderDetails,
  fetchShipmentDetails,
  fetchBillingInfo,
  fetchPackDetails,
} from "./services/meli.services";
import {
  mapToDbOrder,
  mapToDbOrderItems,
  mapToDbShipment,
} from "./adapters/db.adapter";
import { adaptarPedidoMeli, consolidarProductos } from "./adapters/order.adapter";
import { cargarContextoDelPedido } from "./services/firestore.services";
import { fetchHorasDeCorte } from "./services/config.services";
import {
  PedidosBSDocument,
} from "./interfaces/pedidos.interfaces";
import { InconsistencyLog } from "./interfaces/db.interfaces";

import { determinarTipoML } from "./adapters/order.adapter";

// --- Servicio de correo ---
import { enviarNotificacionGenerica } from "./services/email.service";
import { emailUser, emailPassword } from "./services/email-config";

// Inicializamos Firebase Admin SDK
initializeApp();

const db = getFirestore();

// =================================================================
// ============== HANDLERS Y LÓGICA DE CONSOLIDACIÓN ===============
// =================================================================


/**
 * Fusiona un array de documentos de pedidos individuales en un solo documento consolidado.
 * Suma montos, cantidades y reenumera líneas, uniendo productos y detalles de todos los pedidos.
 * @param ordenes Array de documentos de pedidos individuales a consolidar.
 * @param traceId Identificador de trazabilidad para logging y seguimiento.
 * @returns El documento de pedido consolidado con todos los datos sumados y unificados.
 * @throws Error si el array de órdenes está vacío.
 */
function consolidarPedidos(
  ordenes: PedidosBSDocument[],
  traceId: string
): PedidosBSDocument {
  const logPrefix = `[Trace: ${traceId}] [consolidarPedidos]`;
  logger.info(`${logPrefix} Iniciando fusión de ${ordenes.length} documentos.`);

  if (ordenes.length === 0) {
    throw new Error(`${logPrefix} El array de órdenes para consolidar no puede estar vacío.`);
  }

  if (ordenes.length === 1) {
    logger.info(`${logPrefix} Solo hay 1 documento, no se requiere fusión.`);
    return ordenes[0];
  }

  const plantilla = ordenes[0];

  // Reenumeramos las líneas de los detalles para mantener la secuencia correcta en el pedido consolidado.
  const detallesPedido = ordenes
    .flatMap((o) => o.DetallesPedido)
    .map((detalle, index) => ({ ...detalle, Linea: index + 1 }));

  const listadoDeProductos = ordenes.flatMap((o) => o.ListadoDeProductos);
  const listadoDeProductosModificado = ordenes.flatMap((o) => o.ListadoDeProductosModificado);
  // Consolidar productos para evitar SKUs duplicados
  const listadoProductosConsolidadoRaw = ordenes.flatMap((o) => o.ListadoProductosConsolidado);
  const listadoProductosConsolidado = consolidarProductos(listadoProductosConsolidadoRaw, traceId);

  // Suma total de montos y cantidades para reflejar el pedido global.
  const totalMonto = ordenes.reduce((sum, o) => sum + o.TotalMonto, 0);
  const montoNeto = ordenes.reduce((sum, o) => sum + o.MontoNeto, 0);
  const montoImpuesto = ordenes.reduce((sum, o) => sum + o.MontoImpuesto, 0);
  const cantidadTotalProductos = listadoProductosConsolidado.reduce(
    (total: number, producto: { CantidadProducto: string }) => total + Number(producto.CantidadProducto), 0
  );

  // TODO: Validar que no haya duplicados en productos consolidados, podría optimizarse usando un Map por SKU.

  const pedidoFinal: PedidosBSDocument = {
    ...plantilla,
    TotalMonto: totalMonto,
    MontoNeto: montoNeto,
    MontoImpuesto: montoImpuesto,
    DetallesPedido: detallesPedido,
    ListadoDeProductos: listadoDeProductos,
    ListadoDeProductosModificado: listadoDeProductosModificado,
    ListadoProductosConsolidado: listadoProductosConsolidado,
    NumeroProductos: cantidadTotalProductos,
    NumeroProductosModificado: cantidadTotalProductos,
  };

  logger.info(`${logPrefix} Fusión completada.`);
  return pedidoFinal;
}

/**
 * Orquesta el proceso de consolidación para un envío específico.
 */
export async function procesarConsolidacionDeEnvio(shipmentId: string, traceId: string) {
  const logPrefix = `[Trace: ${traceId}] [procesarConsolidacionDeEnvio]`;
  logger.info(`${logPrefix} Iniciando para envío ${shipmentId}.`);

  const ordersSnapshot = await db
    .collection(firestoreCollections.orders)
    .where("meli_shipment_id", "==", shipmentId)
    .get();

  if (ordersSnapshot.empty) {
    logger.warn(`${logPrefix} ⚠️ No se encontraron órdenes para el envío ${shipmentId} en nuestra DB local.`);
    logger.info(`${logPrefix} Consultando MELI para obtener información del shipment y determinar orders esperadas...`);

    let meliPackId = "";
    let payloadMeliPack = "";
    let ordenesEsperadasDelPack: { id: string }[] = [];
    
    try {
      const shipmentDetails = await fetchShipmentDetails(Number(shipmentId), traceId);
      logger.info(`${logPrefix} ✅ Detalles del shipment obtenidos desde MELI.`);
      if (shipmentDetails) {
        // acceso defensivo por si la interfaz no define pack_id exactamente
        const possiblePack = (shipmentDetails as any).pack_id || (shipmentDetails as any).packId || (shipmentDetails as any).pack;
        
        if (possiblePack) {
          // Caso 1: Shipment con pack_id (múltiples orders)
          meliPackId = String(possiblePack);
          
          try {
            logger.info(`${logPrefix} Consultando pack ${meliPackId} en MELI para obtener orders esperadas...`);
            const packDetails = await fetchPackDetails(meliPackId, traceId);
            ordenesEsperadasDelPack = packDetails.orders.map((o) => ({ id: o.id.toString() }));
            logger.info(`${logPrefix} Pack ${meliPackId} contiene ${ordenesEsperadasDelPack.length} orders según MELI.`);
          } catch (packErr) {
            logger.warn(`${logPrefix} No se pudieron obtener detalles del pack: ${(packErr as Error).message}`);
            // Continuar con array vacío
          }
        } else {
          // Caso 2: Shipment sin pack_id (order individual)
          const orderId = (shipmentDetails as any).order_id;
          if (orderId) {
            logger.info(`${logPrefix} 📦 Shipment sin pack_id detectado. Es una order individual con order_id: ${orderId}`);
            logger.info(`${logPrefix} Se espera exactamente 1 order para este shipment.`);
            ordenesEsperadasDelPack = [{ id: String(orderId) }];
            // Usamos order_id como pack_id para consistencia
            meliPackId = String(orderId);
          } else {
            logger.warn(`${logPrefix} ⚠️ ADVERTENCIA: Shipment sin pack_id ni order_id. No se puede determinar orders esperadas.`);
            logger.warn(`${logPrefix} Payload del shipment: ${JSON.stringify(shipmentDetails, null, 2)}`);
          }
        }
        
        try {
          payloadMeliPack = JSON.stringify(shipmentDetails);
        } catch {
          payloadMeliPack = String(shipmentDetails);
        }
      }
    } catch (err) {
      const error = err as Error;
      logger.error(`${logPrefix} ❌ Error al obtener detalles del shipment desde MELI: ${error.message}`);
      logger.error(`${logPrefix} Stack: ${error.stack}`);
      // seguir con valores por defecto (strings vacíos)
    }

    // Log consolidado de lo que se registrará
    logger.info(`${logPrefix} 📝 Registrando en reviewQueue con estado 'sin carga':`, {
      shipmentId,
      meli_pack_id: meliPackId || '(vacío)',
      ordenesEsperadas: ordenesEsperadasDelPack.length,
      ids_esperados: ordenesEsperadasDelPack.map(o => o.id).join(', ') || '(ninguna)',
    });

    const errorDetails: InconsistencyLog = {
      id: shipmentId,
      shipmentId: shipmentId,
      meli_pack_id: meliPackId, // '' si no se obtuvo
      mensaje: "No se encontraron órdenes asociadas al envío en la DB local.",
      estado_de_carga: "sin carga", // normalizado
      ordenesEsperadas: ordenesEsperadasDelPack, // ✅ Ahora se llena consultando el pack de MELI
      ordenesEncontradas: [],
      payload_meli_pack: payloadMeliPack, // '' si no se obtuvo
      ultimoIntento: Timestamp.now(),
    };
    
    // Solo actualizar campos si el documento no existe, si existe solo hacer merge de campos específicos
    const existingDoc = await db.collection(firestoreCollections.reviewQueue).doc(shipmentId).get();
    if (existingDoc.exists) {
      // Documento existente: solo actualizar campos sin sobrescribir ultimoIntento del reprocesador
      await db.collection(firestoreCollections.reviewQueue).doc(shipmentId).update({
        meli_pack_id: meliPackId,
        mensaje: "No se encontraron órdenes asociadas al envío en la DB local.",
        estado_de_carga: "sin carga",
        ordenesEsperadas: ordenesEsperadasDelPack,
        ordenesEncontradas: [],
        payload_meli_pack: payloadMeliPack,
      });
    } else {
      // Documento nuevo: crear con todos los campos incluyendo ultimoIntento
      await db.collection(firestoreCollections.reviewQueue).doc(shipmentId).set(errorDetails, { merge: true });
    }

    return;
  }

  const ordenesEncontradas = ordersSnapshot.docs.map((doc) => doc.data());
  const packId = ordenesEncontradas[0].meli_pack_id;

  logger.info(`${logPrefix} ✅ Encontradas ${ordenesEncontradas.length} orden(es) en DB local para shipment ${shipmentId}`);
  logger.info(`${logPrefix} IDs de orders encontradas: ${ordenesEncontradas.map(o => o.id).join(', ')}`);

  if (packId) {
    logger.info(`${logPrefix} 🔍 Pack ID detectado: ${packId}. Verificando consistencia con MELI...`);

    const packDetails = await fetchPackDetails(packId, traceId);
    const ordenesEsperadasCount = packDetails.orders.length;
    const ordenesEncontradasCount = ordenesEncontradas.length;

    logger.info(`${logPrefix} 📊 Comparación: MELI indica ${ordenesEsperadasCount} orden(es), tenemos ${ordenesEncontradasCount} en DB local.`);

    if (ordenesEncontradasCount < ordenesEsperadasCount) {
      // --- INICIO: BLOQUE DE MANEJO DE INCONSISTENCIA (ACTUALIZADO) ---
      
      const idsEsperados = packDetails.orders.map(o => o.id.toString());
      const idsEncontrados = ordenesEncontradas.map(o => o.id.toString());
      const idsFaltantes = idsEsperados.filter(id => !idsEncontrados.includes(id));
      
      logger.warn(`${logPrefix} ⚠️ INCONSISTENCIA DETECTADA: Faltan ${ordenesEsperadasCount - ordenesEncontradasCount} orden(es)`);
      logger.warn(`${logPrefix} Orders esperadas según MELI: ${idsEsperados.join(', ')}`);
      logger.warn(`${logPrefix} Orders encontradas en DB local: ${idsEncontrados.join(', ')}`);
      logger.warn(`${logPrefix} Orders FALTANTES: ${idsFaltantes.join(', ')}`);

      const errorDetails: InconsistencyLog = {
        id: shipmentId,
        shipmentId: shipmentId,
        meli_pack_id: packId,
        mensaje: "El número de órdenes en la DB local no coincide con la API de MELI al momento de la consolidación.",
        estado_de_carga: "sin carga",
        ordenesEsperadas: packDetails.orders.map((o) => ({ id: o.id.toString() })),
        ordenesEncontradas: ordenesEncontradas.map((o) => ({ id: o.id.toString() })),
        payload_meli_pack: JSON.stringify(packDetails, null, 2),
        ultimoIntento: Timestamp.now(),
      };

      // 1. Escribir log estructurado para la alerta automática.
      logger.error("INCONSISTENCIA_DETECTADA", errorDetails);

      // 2. Crear documento en la cola de revisión con la nueva estructura.
      logger.info(`${logPrefix} 💾 Guardando inconsistencia en reviewQueue para reintento posterior...`);
      
      // Solo actualizar campos si el documento no existe, si existe solo hacer merge de campos específicos
      const existingPackDoc = await db.collection(firestoreCollections.reviewQueue).doc(shipmentId).get();
      if (existingPackDoc.exists) {
        // Documento existente: solo actualizar campos sin sobrescribir ultimoIntento del reprocesador
        await db.collection(firestoreCollections.reviewQueue).doc(shipmentId).update({
          meli_pack_id: packId,
          mensaje: "El número de órdenes en la DB local no coincide con la API de MELI al momento de la consolidación.",
          estado_de_carga: "sin carga",
          ordenesEsperadas: packDetails.orders.map((o) => ({ id: o.id.toString() })),
          ordenesEncontradas: ordenesEncontradas.map((o) => ({ id: o.id.toString() })),
          payload_meli_pack: JSON.stringify(packDetails, null, 2),
        });
      } else {
        // Documento nuevo: crear con todos los campos incluyendo ultimoIntento
        await db.collection(firestoreCollections.reviewQueue).doc(shipmentId).set(errorDetails, { merge: true });
      }
      
      logger.info(`${logPrefix} ✅ Documento guardado en reviewQueue. El sistema reintentará cuando lleguen las orders faltantes.`);

      // --- FIN: BLOQUE DE MANEJO DE INCONSISTENCIA (ACTUALIZADO) ---

      throw new Error(`${logPrefix} INCONSISTENCIA: Faltan ${idsFaltantes.length} orden(es). IDs faltantes: ${idsFaltantes.join(', ')}`);
    }
    
    logger.info(`${logPrefix} ✅ Verificación de consistencia exitosa. Todas las orders del pack están presentes.`);
  } else {
    logger.info(`${logPrefix} ℹ️ Order sin pack_id. Procesando como order individual.`);
  }

  const orderIds = ordenesEncontradas.map((orden) => orden.id);
  logger.info(`${logPrefix} 🚀 Iniciando consolidación para ${orderIds.length} orden(es): ${orderIds.join(', ')}`);

  const [horasDeCorte] = await Promise.all([fetchHorasDeCorte(traceId)]);
  logger.info(`${logPrefix} ⏰ Horas de corte obtenidas desde configuración.`);

  logger.info(`${logPrefix} 📋 Generando ${orderIds.length} documento(s) individual(es) en memoria...`);
  const promesasDePedidos = orderIds.map(async (orderId) => {
    logger.info(`${logPrefix} Procesando order ${orderId}...`);
    
    try {
      const meliOrder = await fetchOrderDetails(`/orders/${orderId}`, traceId);
      const siteId = meliOrder.context?.site || meliOrder.payments?.[0]?.site_id;
      const billingInfoId = meliOrder.buyer?.billing_info?.id;
      const [meliShipment, contexto] = await Promise.all([
        fetchShipmentDetails(Number(shipmentId), traceId),
        cargarContextoDelPedido(
          meliOrder.order_items.map((item) => item.item.seller_sku || item.item.id),
          traceId
        ),
      ]);
      let meliBillingInfo = null;
      try {
        const meliBillingInfoPayload = await fetchBillingInfo(siteId, billingInfoId, traceId);
        meliBillingInfo = meliBillingInfoPayload.billing_info;
      } catch (error) {
        logger.warn(`${logPrefix} No se pudo obtener billing info para order ${orderId}: ${(error as Error).message}`);
      }
      return adaptarPedidoMeli(meliOrder, meliShipment, meliBillingInfo, contexto, horasDeCorte, traceId);
    } catch (error) {
      const err = error as Error;
      const errorMsg = err.message;
      
      // Manejar errores 403/404 sin romper la consolidación completa
      if (errorMsg.includes('HTTP 403') || errorMsg.includes('HTTP 404')) {
        const errorType = errorMsg.includes('HTTP 403') ? 'permission_denied' : 'not_found';
        const errorCode = errorMsg.includes('HTTP 403') ? 403 : 404;
        const errorDescription = errorMsg.includes('HTTP 403') 
          ? 'Sin permisos de acceso a esta orden'
          : 'Orden no encontrada en MELI (inconsistencia de datos)';
        
        logger.warn(
          `${logPrefix} ⚠️ No se pudo obtener order ${orderId} desde MELI: ${errorDescription}`
        );
        logger.warn(`${logPrefix} Detalle: ${errorMsg}`);
        
        // Registrar en pedidosConError
        await db.collection(firestoreCollections.failedOrders).doc(orderId).set({
          resource: `/orders/${orderId}`,
          error_type: errorType,
          error_code: errorCode,
          error_message: errorDescription,
          meli_error_detail: errorMsg,
          timestamp: Timestamp.now(),
          trace_id: traceId,
          shipment_id: shipmentId,
          context: 'consolidation_flow',
        }, { merge: true });
        
        // Retornar null para filtrar después
        return null;
      }
      
      // Para otros errores, propagar
      throw error;
    }
  });

  const pedidosIndividualesConNulos = await Promise.all(promesasDePedidos);
  
  // Filtrar órdenes que fallaron con 403/404
  const pedidosIndividuales = pedidosIndividualesConNulos.filter(p => p !== null) as PedidosBSDocument[];
  
  if (pedidosIndividuales.length === 0) {
    logger.error(
      `${logPrefix} ❌ NINGUNA orden pudo ser procesada. Todas fallaron con errores 403/404.`
    );
    throw new Error(`${logPrefix} No hay órdenes válidas para consolidar en shipment ${shipmentId}`);
  }
  
  if (pedidosIndividuales.length < orderIds.length) {
    const ordenesExitosas = pedidosIndividuales.length;
    const ordenesFallidas = orderIds.length - ordenesExitosas;
    logger.warn(
      `${logPrefix} ⚠️ CONSOLIDACIÓN PARCIAL: ${ordenesExitosas} orden(es) procesada(s), ${ordenesFallidas} orden(es) fallida(s) (403/404)`
    );
  }
  
  logger.info(`${logPrefix} ✅ ${pedidosIndividuales.length} documento(s) individual(es) generado(s) correctamente.`);

  logger.info(`${logPrefix} 🔀 Consolidando ${pedidosIndividuales.length} pedido(s) en documento final...`);
  const pedidoFinalConsolidado = consolidarPedidos(pedidosIndividuales, traceId);

  // Filtrar campos antes de guardar en Firestore
  const camposAExcluir = [
    "ApellidoVendedor",
    "NombreVendedor",
    "EmailVendedor",
    "IDVendedor",
    "TotalMonto",
    "MontoNeto",
    "MontoImpuesto",
    "Moneda",
    "SimboloMoneda",
    "IDMoneda",
    "Pais",
    "Oficina",
    "DireccionOficina",
    "ListadoDeProductos",
    "ListadoDeProductosModificado",
    "estadoInterno"
  ];
  const pedidoFinalConsolidadoFiltrado = Object.fromEntries(
    Object.entries(pedidoFinalConsolidado).filter(([key]) => !camposAExcluir.includes(key))
  );

  const targetCollection = firestoreCollections.processedOrders;
  logger.info(`${logPrefix} 💾 Preparando para guardar documento final consolidado en colección: ${targetCollection}`);
  
  const docRef = db.collection(targetCollection).doc(shipmentId);
  const docSnapshot = await docRef.get();
  
  if (docSnapshot.exists) {
    logger.warn(`${logPrefix} ⚠️ El pedido ${shipmentId} ya existe en ${targetCollection}. No se sobrescribirá.`);
    return;
  }
  
  await docRef.set(pedidoFinalConsolidadoFiltrado);
  logger.info(`${logPrefix} ✅ 🎉 Consolidación completada exitosamente! Pedido ${shipmentId} guardado en ${targetCollection}.`);
  logger.info(`${logPrefix} 📊 Resumen: ${orderIds.length} order(s) consolidada(s) en 1 pedido final.`);
}

/**
 * Procesa una orden individual obteniendo sus datos de MELI y guardándolos en la DB normalizada.
 * Esta función es reutilizable tanto desde el trigger de shipments como desde el trigger de orders.
 * 
 * @param orderId - ID de la orden a procesar
 * @param shipmentId - ID del shipment asociado a la orden
 * @param packId - ID del pack (opcional, puede venir de la order o del shipment)
 * @param traceId - ID de trazabilidad para logging
 */
async function processIndividualOrder(
  orderId: number,
  shipmentId: number,
  packId: string | null,
  traceId: string
): Promise<void> {
  const logPrefix = `[Trace: ${traceId}] [processIndividualOrder]`;
  const resource = `/orders/${orderId}`;
  
  logger.info(`${logPrefix} Procesando orden individual: ${orderId}`);

  // Obtener detalles de la orden
  let meliOrder;
  try {
    meliOrder = await fetchOrderDetails(resource, traceId);
  } catch (error) {
    const err = error as Error;
    const errorMsg = err.message;
    
    // Detectar si es un error 403 (sin permisos)
    if (errorMsg.includes('HTTP 403')) {
      logger.warn(`${logPrefix} ⚠️ ERROR DE PERMISOS: Orden ${orderId} no pertenece a la cuenta o sin acceso.`);
      await db.collection(firestoreCollections.failedOrders).doc(orderId.toString()).set({
        resource: resource,
        error_type: 'permission_denied',
        error_code: 403,
        error_message: 'La orden no pertenece a la cuenta vinculada o no hay permisos de acceso',
        meli_error_detail: errorMsg,
        timestamp: Timestamp.now(),
        trace_id: traceId,
        shipment_id: shipmentId,
        pack_id: packId,
      }, { merge: true });
      return;
    }
    
    // Detectar si es un error 404 (orden no encontrada)
    if (errorMsg.includes('HTTP 404')) {
      logger.warn(`${logPrefix} ⚠️ ORDEN NO ENCONTRADA: Orden ${orderId} no existe en MELI.`);
      await db.collection(firestoreCollections.failedOrders).doc(orderId.toString()).set({
        resource: resource,
        error_type: 'not_found',
        error_code: 404,
        error_message: 'La orden no existe en MercadoLibre (cancelada, eliminada o datos inconsistentes)',
        meli_error_detail: errorMsg,
        timestamp: Timestamp.now(),
        trace_id: traceId,
        shipment_id: shipmentId,
        pack_id: packId,
      }, { merge: true });
      return;
    }
    
    // Para otros errores (500, timeout, etc.), propagar el error
    throw error;
  }
  
  logger.info(`${logPrefix} ✅ Orden obtenida. ID: ${meliOrder.id}, Status: ${meliOrder.status}`);

  // Validar estado de la orden
  if (meliOrder.status !== 'paid') {
    logger.warn(`${logPrefix} La orden no está pagada (status: ${meliOrder.status}). Saltando.`);
    return;
  }

  // Obtener billing info
  const siteId = meliOrder.context?.site || meliOrder.payments?.[0]?.site_id;
  const billingInfoId = meliOrder.buyer?.billing_info?.id;
  
  logger.info(`${logPrefix} 📡 Obteniendo billing info (opcional)...`);
  let meliBillingInfo = null;
  try {
    const meliBillingInfoPayload = await fetchBillingInfo(siteId, billingInfoId, traceId);
    meliBillingInfo = meliBillingInfoPayload.billing_info;
    logger.info(`${logPrefix} ✅ Billing info obtenida.`);
  } catch (error) {
    logger.warn(`${logPrefix} ⚠️ No se pudo obtener billing info: ${(error as Error).message}`);
  }

  // Obtener shipment details
  logger.info(`${logPrefix} 📡 Obteniendo shipment ${shipmentId}...`);
  const meliShipment = await fetchShipmentDetails(shipmentId, traceId);
  logger.info(`${logPrefix} ✅ Shipment obtenido. Logistic Type: ${meliShipment.logistic_type}`);
  
  // Validar tipo logístico
  const tipoDePedido = determinarTipoML(meliShipment.logistic_type);
  if (!businessRules.ALLOWED_LOGISTIC_TYPES.includes(tipoDePedido)) {
    logger.info(
      `${logPrefix} Orden omitida. Tipo logístico '${meliShipment.logistic_type}' (${tipoDePedido}) no permitido.`
    );
    return;
  }

  // Mapear datos a entidades de DB
  logger.info(`${logPrefix} 🔄 Mapeando datos a entidades de DB...`);
  const dbOrder = mapToDbOrder(meliOrder, meliBillingInfo, traceId);
  const dbOrderItems = mapToDbOrderItems(meliOrder, traceId);
  const dbShipment = mapToDbShipment(meliShipment, meliOrder.id, packId, traceId);
  
  logger.info(`${logPrefix} ✅ Datos mapeados: 1 order, ${dbOrderItems.length} items, 1 shipment`);

  // Guardar en DB con transacción
  logger.info(`${logPrefix} 💾 Guardando en DB normalizada...`);
  try {
    await db.runTransaction(async (transaction) => {
      const orderRef = db.collection(firestoreCollections.orders).doc(dbOrder.id.toString());
      const shipmentRef = db.collection(firestoreCollections.shipments).doc(dbShipment.id.toString());
      
      transaction.set(orderRef, dbOrder);
      transaction.set(shipmentRef, dbShipment);
      
      dbOrderItems.forEach((item) => {
        const itemRef = db.collection(firestoreCollections.orderItems).doc();
        transaction.set(itemRef, item);
      });
    });
    logger.info(`${logPrefix} ✅ Orden ${orderId} guardada exitosamente en DB.`);
  } catch (transactionError) {
    const txErr = transactionError as Error;
    logger.error(`${logPrefix} ❌ ERROR EN TRANSACCIÓN: ${txErr.message}`);
    throw txErr;
  }
}

/**
 * DESACTIVADA TEMPORALMENTE - Esta función ya no se usa en el flujo actual.
 * Ahora las órdenes se procesan directamente desde processShipmentTopic() consultando el pack.
 * Se mantiene el código para referencia o reactivación futura.
 * 
 * Procesa un evento del tópico 'orders_v2' para guardar los datos en la DB normalizada.
 */
// @ts-ignore - Función desactivada temporalmente pero mantenida para referencia
async function processOrderTopic(notification: MeliNotification, traceId: string): Promise<void> {
  const { resource } = notification;
  const logPrefix = `[Trace: ${traceId}] [processOrderTopic]`;
  logger.info(`${logPrefix} Iniciado para recurso: ${resource}`);

  logger.info(`${logPrefix} FASE 3 (Calculate): Obteniendo datos de MELI...`);
  logger.info(`${logPrefix} 📡 PASO 1: Obteniendo detalles de la orden...`);
  
  // Manejo especial para errores recuperables (403, 404)
  let meliOrder;
  try {
    meliOrder = await fetchOrderDetails(resource, traceId);
  } catch (error) {
    const err = error as Error;
    const errorMsg = err.message;
    const orderId = resource.split('/').pop() || 'unknown';
    
    // Detectar si es un error 403 (sin permisos)
    if (errorMsg.includes('HTTP 403')) {
      logger.warn(
        `${logPrefix} ⚠️ ERROR DE PERMISOS: Esta orden no pertenece a la cuenta actual o no hay acceso.`
      );
      logger.warn(`${logPrefix} Detalle: ${errorMsg}`);
      
      await db.collection(firestoreCollections.failedOrders).doc(orderId).set({
        resource: resource,
        error_type: 'permission_denied',
        error_code: 403,
        error_message: 'La orden no pertenece a la cuenta vinculada o no hay permisos de acceso',
        meli_error_detail: errorMsg,
        timestamp: Timestamp.now(),
        trace_id: traceId,
        topic: notification.topic,
      }, { merge: true });
      
      logger.info(`${logPrefix} Orden registrada en pedidosConError. Marcando notificación como procesada.`);
      return;
    }
    
    // Detectar si es un error 404 (orden no encontrada)
    if (errorMsg.includes('HTTP 404')) {
      logger.warn(
        `${logPrefix} ⚠️ ORDEN NO ENCONTRADA: La orden no existe en MELI (posiblemente cancelada o eliminada).`
      );
      logger.warn(`${logPrefix} Detalle: ${errorMsg}`);
      
      await db.collection(firestoreCollections.failedOrders).doc(orderId).set({
        resource: resource,
        error_type: 'not_found',
        error_code: 404,
        error_message: 'La orden no existe en MercadoLibre (cancelada, eliminada o datos inconsistentes)',
        meli_error_detail: errorMsg,
        timestamp: Timestamp.now(),
        trace_id: traceId,
        topic: notification.topic,
      }, { merge: true });
      
      logger.info(`${logPrefix} Orden registrada en pedidosConError. Marcando notificación como procesada.`);
      return;
    }
    
    // Para otros errores (500, timeout, etc.), propagar el error para retry
    throw error;
  }
  
  logger.info(`${logPrefix} ✅ Orden obtenida. ID: ${meliOrder.id}, Status: ${meliOrder.status}`);

  if (meliOrder.status !== 'paid') {
    logger.warn(`${logPrefix} La orden no está pagada (status: ${meliOrder.status}). Finalizando.`);
    return;
  }
  if (!meliOrder.shipping?.id) throw new Error(`${logPrefix} La orden no tiene ID de envío.`);

  const siteId = meliOrder.context?.site || meliOrder.payments?.[0]?.site_id;
  const billingInfoId = meliOrder.buyer?.billing_info?.id;
  logger.info(`${logPrefix} 📡 PASO 2: Obteniendo shipment. Shipment ID: ${meliOrder.shipping.id}`);

  const meliShipment = await fetchShipmentDetails(meliOrder.shipping.id, traceId);
  logger.info(`${logPrefix} ✅ Shipment obtenido. Logistic Type: ${meliShipment.logistic_type}`);
  
  logger.info(`${logPrefix} 📡 PASO 3: Obteniendo billing info (opcional)...`);
  let meliBillingInfo = null;
  try {
    const meliBillingInfoPayload = await fetchBillingInfo(siteId, billingInfoId, traceId);
    meliBillingInfo = meliBillingInfoPayload.billing_info;
    logger.info(`${logPrefix} ✅ Billing info obtenida.`);
  } catch (error) {
    logger.warn(`${logPrefix} ⚠️ No se pudo obtener billing info para order ${meliOrder.id}: ${(error as Error).message}`);
  }

  // ==================================================================
  // ===================== INICIO DEL FILTRO CORREGIDO =================
  // ==================================================================

  // El filtro se aplica aquí, usando la información del 'meliShipment' ya obtenido.
  const tipoDePedido = determinarTipoML(meliShipment.logistic_type);

  // El filtro ahora usa el valor traducido ("Flex", "Colecta").
  if (!businessRules.ALLOWED_LOGISTIC_TYPES.includes(tipoDePedido)) {
    logger.info(
      `${logPrefix} Orden omitida. El tipo logístico '${meliShipment.logistic_type}' (traducido como '${tipoDePedido}') no está en la lista de permitidos.`
    );
    return; // Detiene el procesamiento para esta orden.
  }

  // ==================================================================
  // ====================== FIN DEL FILTRO CORREGIDO ==================
  // ==================================================================

  logger.info(`${logPrefix} FASE 3 (Calculate): Datos de MELI obtenidos.`);

  logger.info(`${logPrefix} 🔄 PASO 4: Mapeando datos a entidades de DB...`);
  logger.info(`${logPrefix} 🔄 PASO 4a: Mapeando Order...`);
  const dbOrder = mapToDbOrder(meliOrder, meliBillingInfo, traceId);
  logger.info(`${logPrefix} ✅ Order mapeada. ID: ${dbOrder.id}`);
  
  logger.info(`${logPrefix} 🔄 PASO 4b: Mapeando OrderItems...`);
  const dbOrderItems = mapToDbOrderItems(meliOrder, traceId);
  logger.info(`${logPrefix} ✅ OrderItems mapeados. Cantidad: ${dbOrderItems.length}`);
  
  logger.info(`${logPrefix} 🔄 PASO 4c: Mapeando Shipment...`);
  const dbShipment = mapToDbShipment(meliShipment, meliOrder.id, meliOrder.pack_id ? meliOrder.pack_id.toString() : null, traceId);
  logger.info(`${logPrefix} ✅ Shipment mapeado. ID: ${dbShipment.id}`);

  logger.info(`${logPrefix} FASE 4 (Execute): Iniciando transacción para guardar en DB normalizada.`);
  logger.info(`${logPrefix} 💾 PASO 5: Preparando transacción...`);
  logger.info(`${logPrefix} 💾 Colecciones destino: Orders=${firestoreCollections.orders}, Shipments=${firestoreCollections.shipments}, OrderItems=${firestoreCollections.orderItems}`);
  
  try {
    await db.runTransaction(async (transaction) => {
      logger.info(`${logPrefix} 💾 Transacción iniciada. Guardando Order ID: ${dbOrder.id}`);
      const orderRef = db.collection(firestoreCollections.orders).doc(dbOrder.id.toString());
      const shipmentRef = db.collection(firestoreCollections.shipments).doc(dbShipment.id.toString());
      transaction.set(orderRef, dbOrder);
      logger.info(`${logPrefix} 💾 Order agregada a transacción`);
      
      transaction.set(shipmentRef, dbShipment);
      logger.info(`${logPrefix} 💾 Shipment agregado a transacción`);
      
      dbOrderItems.forEach((item, index) => {
        const itemRef = db.collection(firestoreCollections.orderItems).doc();
        transaction.set(itemRef, item);
        logger.info(`${logPrefix} 💾 OrderItem ${index + 1}/${dbOrderItems.length} agregado a transacción`);
      });
      logger.info(`${logPrefix} 💾 Todos los documentos agregados. Confirmando transacción...`);
    });
    logger.info(`${logPrefix} ✅ FASE 4 (Execute): Transacción completada exitosamente!`);
    logger.info(`${logPrefix} ✅ Guardados: 1 orden, ${dbOrderItems.length} ítems, 1 envío.`);
  } catch (transactionError) {
    const txErr = transactionError as Error;
    logger.error(`${logPrefix} ❌ ERROR EN TRANSACCIÓN DE FIRESTORE ❌`);
    logger.error(`${logPrefix} Mensaje: ${txErr.message}`);
    logger.error(`${logPrefix} Stack: ${txErr.stack}`);
    logger.error(`${logPrefix} Datos que se intentaron guardar:`, {
      orderKeys: Object.keys(dbOrder),
      shipmentKeys: Object.keys(dbShipment),
      orderItemsCount: dbOrderItems.length,
    });
    throw txErr;
  }

  // =================================================================
  // TAREA 2: Trigger Automático de Reintento
  // =================================================================
  logger.info(`${logPrefix} Verificando si hay shipments esperando esta orden...`);
  
  const shipmentId = dbShipment.id.toString();
  const reviewQueueRef = db.collection(firestoreCollections.reviewQueue).doc(shipmentId);
  const reviewQueueDoc = await reviewQueueRef.get();

  if (reviewQueueDoc.exists) {
    const data = reviewQueueDoc.data() as InconsistencyLog;
    
    if (data.estado_de_carga === "sin carga") {
      logger.info(`${logPrefix} ✅ Shipment ${shipmentId} estaba esperando esta orden. Disparando consolidación automática.`);
      
      try {
        // Generar un sub-trace para este reintento automático
        const autoRetryTraceId = `${traceId}-auto-retry`;
        await procesarConsolidacionDeEnvio(shipmentId, autoRetryTraceId);
        
        // Verificar si se creó el pedido
        const pedidoDoc = await db.collection(firestoreCollections.processedOrders).doc(shipmentId).get();
        
        if (pedidoDoc.exists) {
          logger.info(`${logPrefix} ✅ Consolidación automática exitosa. Pedido creado en ${firestoreCollections.processedOrders}.`);
          await reviewQueueRef.update({
            estado_de_carga: "cargado",
            ultimoIntento: Timestamp.now(),
            pedido_creado_en: firestoreCollections.processedOrders,
            consolidado_automaticamente: true,
            trigger_desde: "processOrderTopic"
          });
        } else {
          logger.warn(`${logPrefix} ⚠️ Consolidación automática no creó pedido. Manteniendo en cola.`);
        }
      } catch (error) {
        const err = error as Error;
        logger.error(`${logPrefix} ❌ Error en consolidación automática: ${err.message}`);
        await reviewQueueRef.update({
          ultimoError: err.message,
          ultimoIntento: Timestamp.now()
        });
      }
    } else {
      logger.info(`${logPrefix} Shipment ${shipmentId} existe en cola pero ya está marcado como '${data.estado_de_carga}'. No se reintentar.`);
    }
  } else {
    logger.info(`${logPrefix} No hay shipment ${shipmentId} esperando en la cola de revisión.`);
  }
  // =================================================================
}

/**
 * Procesa un evento del tópico 'shipments' para:
 * 1. Obtener el pack_id desde el shipment (campo external_reference)
 * 2. Obtener todas las órdenes del pack desde la API de MELI
 * 3. Procesar cada orden individualmente
 * 4. Actualizar estado del shipment
 * 5. Disparar consolidación si el estado es procesable
 */
async function processShipmentTopic(notification: MeliNotification, traceId: string): Promise<void> {
  const { resource } = notification;
  const logPrefix = `[Trace: ${traceId}] [processShipmentTopic]`;
  const shipmentId = resource.split("/").pop();
  if (!shipmentId) throw new Error(`${logPrefix} No se pudo extraer el ID del envío.`);

  logger.info(`${logPrefix} 🚀 Iniciado para shipment: ${shipmentId}`);

  // ====================================================================
  // PASO 1: Obtener detalles del shipment
  // ====================================================================
  logger.info(`${logPrefix} 📡 PASO 1: Obteniendo detalles del shipment desde MELI...`);
  const meliShipment = await fetchShipmentDetails(Number(shipmentId), traceId);
  logger.info(`${logPrefix} ✅ Shipment obtenido. Status: ${meliShipment.status}, Logistic Type: ${meliShipment.logistic_type}`);

  // Validar tipo logístico
  const tipoDePedido = determinarTipoML(meliShipment.logistic_type);
  if (!businessRules.ALLOWED_LOGISTIC_TYPES.includes(tipoDePedido)) {
    logger.info(
      `${logPrefix} ⏭️ Shipment omitido. Tipo logístico '${meliShipment.logistic_type}' (${tipoDePedido}) no permitido.`
    );
    return;
  }

  // ====================================================================
  // PASO 2: Extraer pack_id desde external_reference
  // ====================================================================
  const packId = meliShipment.external_reference;
  
  if (!packId) {
    logger.warn(`${logPrefix} ⚠️ El shipment NO tiene external_reference (pack_id). No se puede procesar.`);
    logger.warn(`${logPrefix} Payload del shipment: ${JSON.stringify(meliShipment, null, 2)}`);
    return;
  }

  logger.info(`${logPrefix} ✅ Pack ID obtenido desde external_reference: ${packId}`);

  // ====================================================================
  // PASO 3: Obtener órdenes del pack desde la API de MELI
  // ====================================================================
  logger.info(`${logPrefix} 📡 PASO 2: Consultando pack ${packId} para obtener órdenes...`);
  let packDetails;
  try {
    packDetails = await fetchPackDetails(packId, traceId);
    logger.info(`${logPrefix} ✅ Pack obtenido. Contiene ${packDetails.orders.length} orden(es).`);
  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} ❌ Error al obtener detalles del pack: ${err.message}`);
    throw error;
  }

  // ====================================================================
  // PASO 4: Procesar cada orden del pack
  // ====================================================================
  logger.info(`${logPrefix} 🔄 PASO 3: Procesando ${packDetails.orders.length} órdenes del pack...`);
  
  const orderProcessingResults: { orderId: number; success: boolean; error?: string }[] = [];
  
  for (const order of packDetails.orders) {
    const orderId = order.id;
    logger.info(`${logPrefix} 📦 Procesando orden ${orderId}...`);
    
    try {
      await processIndividualOrder(orderId, Number(shipmentId), packId, traceId);
      orderProcessingResults.push({ orderId, success: true });
      logger.info(`${logPrefix} ✅ Orden ${orderId} procesada exitosamente.`);
    } catch (error) {
      const err = error as Error;
      logger.error(`${logPrefix} ❌ Error procesando orden ${orderId}: ${err.message}`);
      orderProcessingResults.push({ orderId, success: false, error: err.message });
      // Continuamos con las demás órdenes en lugar de fallar todo el proceso
    }
  }

  // Resumen de procesamiento
  const successCount = orderProcessingResults.filter(r => r.success).length;
  const failedCount = orderProcessingResults.filter(r => !r.success).length;
  
  logger.info(`${logPrefix} 📊 Resumen de procesamiento de órdenes:`);
  logger.info(`${logPrefix}    ✅ Exitosas: ${successCount}/${packDetails.orders.length}`);
  logger.info(`${logPrefix}    ❌ Fallidas: ${failedCount}/${packDetails.orders.length}`);
  
  if (failedCount > 0) {
    const failedOrders = orderProcessingResults.filter(r => !r.success);
    logger.warn(`${logPrefix} ⚠️ Órdenes fallidas: ${failedOrders.map(r => `${r.orderId} (${r.error})`).join(', ')}`);
  }

  // ====================================================================
  // PASO 5: Actualizar estado del shipment en DB
  // ====================================================================
  logger.info(`${logPrefix} 💾 PASO 4: Actualizando estado del shipment en DB...`);
  const shipmentRef = db.collection(firestoreCollections.shipments).doc(shipmentId);
  await shipmentRef.set({
    status: meliShipment.status,
    substatus: meliShipment.substatus || null,
    updated_at: Timestamp.now(),
  }, { merge: true });
  logger.info(`${logPrefix} ✅ Estado del shipment actualizado.`);

  // ====================================================================
  // PASO 6: Verificar si el estado es procesable para consolidación
  // ====================================================================
  logger.info(`${logPrefix} 🔍 PASO 5: Verificando si el estado es procesable...`);
  
  const esEstadoValido = businessRules.MELI_SHIPMENT_PROCESSABLE_STATES.some(
    (validState) => {
      const statusMatch = meliShipment.status === validState.status;
      const substatusMatch = !validState.substatus || meliShipment.substatus === validState.substatus;
      return statusMatch && substatusMatch;
    }
  );

  if (esEstadoValido) {
    logger.info(`${logPrefix} ✅ Estado válido (${meliShipment.status}). Disparando consolidación...`);
    
    // Solo disparar consolidación si al menos una orden se procesó exitosamente
    if (successCount > 0) {
      try {
        await procesarConsolidacionDeEnvio(shipmentId, traceId);
        logger.info(`${logPrefix} 🎉 Consolidación completada exitosamente!`);
      } catch (error) {
        const err = error as Error;
        logger.error(`${logPrefix} ❌ Error en consolidación: ${err.message}`);
        throw error;
      }
    } else {
      logger.warn(`${logPrefix} ⚠️ No se disparó consolidación porque ninguna orden se procesó exitosamente.`);
    }
  } else {
    logger.info(`${logPrefix} ℹ️ Estado (${meliShipment.status}) no requiere consolidación. Proceso finalizado.`);
  }
}

// =================================================================
// =================== FUNCIÓN PRINCIPAL (ORQUESTADOR) ==================
// =================================================================
export const procesarNotificacionMeli = onDocumentCreated(
  {
    document: `${firestoreCollections.meliNotifications}/{notificationId}`,
    region: projectConfig.region,
    timeoutSeconds: 300,
  },
  async (event) => {
    const notificationId = event.params.notificationId;
    const logPrefix = `[Trace: ${notificationId}] [Orquestador]`;

    const snapshot = event.data;
    if (!snapshot) {
      logger.warn(`${logPrefix} Evento sin datos (snapshot nulo). Abortando.`);
      return;
    }

    logger.info(`${logPrefix} Iniciando procesamiento para recurso: ${snapshot.data().resource}`);

    const docRef = snapshot.ref;
    const notification = snapshot.data() as any;

    logger.info(`${logPrefix} FASE 1 (Validate): Verificando payload...`);
    if (!notification.resource || !notification.topic) {
      logger.error(`${logPrefix} Notificación inválida, faltan 'resource' o 'topic'.`, { notification });
      await docRef.update({ status: "invalid_payload" });
      return;
    }
    logger.info(`${logPrefix} FASE 1 (Validate): Payload validado.`);

    logger.info(`${logPrefix} FASE 2 (Confirm & Prepare): Verificando idempotencia...`);
    if (notification.status === "processed" || notification.status === "processing") {
      logger.info(`${logPrefix} Notificación ya procesada o en proceso (status: ${notification.status}). Saltando.`);
      return;
    }
    logger.info(`${logPrefix} FASE 2 (Confirm & Prepare): Notificación nueva. Marcando como 'processing'.`);

    await docRef.update({ status: "processing", processing_started_at: Timestamp.now() });

    try {
      logger.info(`${logPrefix} Delegando al handler para el tópico: ${notification.topic}`);
      switch (notification.topic) {
        // DESACTIVADO TEMPORALMENTE: Ahora procesamos las órdenes desde el trigger de shipments
        // consultando el pack_id y obteniendo todas las órdenes asociadas de forma proactiva.
        // case "orders_v2":
        // case "orders":
        //   await processOrderTopic(notification, notificationId);
        //   break;
        case "shipments":
          await processShipmentTopic(notification, notificationId);
          break;
        default:
          logger.warn(`${logPrefix} Tópico no reconocido: '${notification.topic}'.`);
      }
      logger.info(`${logPrefix} FASE 5 (Save & Persist): Handler completado. Marcando como 'processed'.`);
      await docRef.update({ status: "processed", processing_finished_at: Timestamp.now() });
    } catch (error) {
      const err = error as Error;
      // LOG MEJORADO: Mensaje de error visible en el log principal
      logger.error(`${logPrefix} ❌ ERROR FATAL EN EL PIPELINE ❌`);
      logger.error(`${logPrefix} Mensaje: ${err.message}`);
      logger.error(`${logPrefix} Stack: ${err.stack}`);
      logger.error(`${logPrefix} Payload de notificación:`, notification);
      
      // También log estructurado para análisis
      logger.error(`${logPrefix} Error fatal en el pipeline.`, {
        errorMessage: err.message,
        errorStack: err.stack,
        notificationPayload: notification,
      });
      await docRef.update({ status: "error", error_message: err.message });
      throw error;
    }
  }
);

/**
 * Función HTTP activada por Cloud Scheduler para reprocesar envíos inconsistentes.
 */
export const reprocesarEnviosInconsistentes = functions.https.onRequest(async (req, res) => {
  const traceId = uuidv4();
  const logPrefix = `[Trace: ${traceId}] [Reprocesamiento]`;

  logger.info(`${logPrefix} Iniciando barrido de envíos inconsistentes.`);

  if (req.headers.authorization !== `Bearer ${securityConfig.schedulerSecret}`) {
    logger.error(`${logPrefix} Error de autorización. Secreto inválido o ausente.`);
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    // --- 1. BÚSQUEDA MODIFICADA ---
    // Ahora busca documentos que no tengan el estado "cargado".
    // Esto incluye los que están vacíos, nulos, o con "sin carga".
    const snapshot = await db
      .collection(firestoreCollections.reviewQueue)
      .where("estado_de_carga", "!=", "cargado")
      .get();

    if (snapshot.empty) {
      logger.info(`${logPrefix} No se encontraron envíos pendientes para reprocesar. Finalizando.`);
      res.status(200).send("No hay envíos pendientes para reprocesar.");
      return;
    }

    logger.info(`${logPrefix} Se encontraron ${snapshot.size} envíos pendientes para reprocesar.`);
    const reprocesamientoPromises = [];

    for (const doc of snapshot.docs) {
      const shipmentId = doc.id;
      const subTraceId = uuidv4();

      const promise = (async () => {
        try {
          logger.info(`${logPrefix} Intentando reprocesar Shipment ID: ${shipmentId}`);

          await procesarConsolidacionDeEnvio(shipmentId, subTraceId);

          // --- VERIFICACIÓN CRÍTICA: ¿Se creó el pedido en PedidosBS? ---
          const pedidoDoc = await db
            .collection(firestoreCollections.processedOrders)
            .doc(shipmentId)
            .get();

          if (pedidoDoc.exists) {
            // ✅ ÉXITO REAL: El pedido se consolidó y guardó correctamente
            logger.info(
              `${logPrefix} ✅ Reprocesamiento de ${shipmentId} EXITOSO. Pedido creado en ${firestoreCollections.processedOrders}.`
            );
            await doc.ref.update({
              estado_de_carga: "cargado",
              ultimoIntento: Timestamp.now(),
              pedido_creado_en: firestoreCollections.processedOrders,
            });
            return { shipmentId, status: "success" };
          } else {
            // ⚠️ NO SE CONSOLIDÓ: No hay pedido final (probablemente faltan órdenes)
            logger.warn(
              `${logPrefix} ⚠️ Reprocesamiento de ${shipmentId} no creó pedido en ${firestoreCollections.processedOrders}. Posiblemente faltan órdenes en la DB.`
            );
            await doc.ref.update({
              estado_de_carga: "sin carga", // Mantener como pendiente para futuros reintentos
              ultimoIntento: Timestamp.now(),
              ultimoError: "No se pudo consolidar: Hay órdenes disponibles en la DB local",
            });
            return {
              shipmentId,
              status: "pending",
              error: "No hay órdenes para consolidar",
            };
          }
        } catch (error) {
          const err = error as Error;
          logger.error(`${logPrefix} Falló el reprocesamiento para ${shipmentId}.`, {
            error: err.message,
          });

          // --- 3. LÓGICA DE FALLO MODIFICADA ---
          // Ahora actualiza el estado para reflejar el fallo.
          await doc.ref.update({
            estado_de_carga: "reintento_fallido",
            ultimoIntento: Timestamp.now(),
            ultimoError: err.message,
          });
          return { shipmentId, status: "failed", error: err.message };
        }
      })();
      reprocesamientoPromises.push(promise);
    }

    const results = await Promise.all(reprocesamientoPromises);
    logger.info(`${logPrefix} Barrido finalizado.`, { results });
    res.status(200).send({ message: "Barrido finalizado.", results });

  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} Error crítico en la función de Reprocesamiento.`, { error: err.message });
    res.status(500).send("Error interno del servidor.");
  }
});

// =================================================================
// ============ NOTIFICACIÓN POR EMAIL DE INCONSISTENCIAS ==========
// =================================================================

/**
 * Cloud Function que se activa cuando se crea o actualiza un documento en enviosConInconsistencias (reviewQueue).
 * 
 * **PROPÓSITO:**
 * - Notificar por email cuando se detecta una inconsistencia (documento nuevo)
 * - Notificar cuando se hace un reintento de carga (documento actualizado)
 * 
 * **CASOS DE USO:**
 * 1. **Documento nuevo (created):** Primera detección de inconsistencia
 *    - Se envía email con detalles de orders faltantes
 *    - Útil para alertar al equipo inmediatamente
 * 
 * 2. **Documento actualizado (updated):** Reintento de consolidación
 *    - Se envía email solo si cambió el estado (para evitar spam)
 *    - Útil para seguimiento de intentos de resolución
 * 
 * **FAIL-SAFE:**
 * - Si el envío de email falla, solo se loguea el error
 * - No afecta el flujo principal de procesamiento
 */
export const notificarInconsistenciaPorEmail = onDocumentWritten(
  {
    document: `${firestoreCollections.reviewQueue}/{shipmentId}`,
    region: projectConfig.region,
    secrets: [emailUser, emailPassword],
  },
  async (event) => {
    const logPrefix = "[notificarInconsistenciaPorEmail]";
    const shipmentId = event.params.shipmentId;

    try {
      // Obtener datos del documento (before y after)
      const beforeData = event.data?.before?.data() as InconsistencyLog | undefined;
      const afterData = event.data?.after?.data() as InconsistencyLog | undefined;

      // Si no hay documento después, significa que fue eliminado (no notificar)
      if (!afterData) {
        logger.info(`${logPrefix} Documento eliminado, no se notifica.`, { shipmentId });
        return;
      }

      // Determinar si es creación o actualización
      const isCreation = !beforeData;
      const isUpdate = !!beforeData;

      // ==================================================================
      // CASO 1: DOCUMENTO NUEVO (Primera detección de inconsistencia)
      // ==================================================================
      if (isCreation) {
        logger.info(`${logPrefix} 🆕 Nueva inconsistencia detectada, enviando notificación...`, {
          shipmentId,
          estado: afterData.estado_de_carga,
        });

        // Construir detalles ordenados del documento para incluir en el correo
        const docDetails: Array<{ label: string; value: string }> = [];
        // Ordenar las llaves para consistencia visual
        const orderedKeys = Object.keys(afterData).sort();
        for (const key of orderedKeys) {
          try {
            const raw = (afterData as any)[key];
            let value = '';
            if (raw === undefined || raw === null) {
              value = '';
            } else if (Array.isArray(raw)) {
              // Si es array de objetos con id, unir ids
              if (raw.length > 0 && typeof raw[0] === 'object') {
                value = raw.map((r: any) => (r.id ? r.id : JSON.stringify(r))).join(', ');
              } else {
                value = raw.join(', ');
              }
            } else if (raw instanceof Object && !(raw instanceof Date)) {
              value = JSON.stringify(raw, null, 2);
            } else if (raw && raw.toDate && typeof raw.toDate === 'function') {
              // Firestore Timestamp
              value = raw.toDate().toISOString();
            } else {
              value = String(raw);
            }

            docDetails.push({ label: key, value });
          } catch (err) {
            docDetails.push({ label: key, value: 'ERROR: no se pudo serializar' });
          }
        }

        // Enviar notificación con información detallada al equipo indicado
        enviarNotificacionGenerica(
          {
            title: `Nueva inconsistencia - Shipment ${shipmentId}`,
            message: afterData.mensaje || 'Se detectó una inconsistencia. A continuación se detallan los campos del documento en reviewQueue.',
            type: 'alert',
            details: docDetails,
          },
          [
            'pablo.guerrero@asurity.cl',
            'ivanahaack33@gmail.com',
          ],
          'normal'
        ).catch((error) => {
          logger.error(`${logPrefix} ❌ Error al enviar email de inconsistencia (detailed)`, {
            shipmentId,
            error: error.message,
          });
        });

        logger.info(`${logPrefix} ✅ Notificación de nueva inconsistencia procesada (detailed)`, { shipmentId });
        return;
      }

      // ==================================================================
      // CASO 2: DOCUMENTO ACTUALIZADO (Reintento de consolidación)
      // ==================================================================
      if (isUpdate) {
        // Verificar si cambió el estado de carga (evitar spam si solo cambió timestamp)
        const estadoAnterior = beforeData.estado_de_carga;
        const estadoActual = afterData.estado_de_carga;
        const cambioEstado = estadoAnterior !== estadoActual;

        if (!cambioEstado) {
          logger.info(`${logPrefix} Sin cambio de estado, no se notifica.`, {
            shipmentId,
            estado: estadoActual,
          });
          return;
        }

        logger.info(`${logPrefix} 🔄 Cambio de estado detectado, enviando notificación...`, {
          shipmentId,
          estadoAnterior,
          estadoActual,
        });

        // Determinar resultado y razón breve
        let resultadoTexto = 'Resultado del intento: Desconocido';
        let razon = '';
        if (estadoActual === 'cargado') {
          resultadoTexto = '✅ Éxito: Pedido consolidado y cargado en destino.';
        } else if (estadoActual === 'reintento_fallido') {
          resultadoTexto = '❌ Falló el reintento de carga.';
          razon = afterData.ultimoError || afterData.mensaje || 'Error desconocido';
        } else if (estadoActual === 'sin carga') {
          resultadoTexto = '⚠️ Reintento no resolvió la inconsistencia (sigue sin carga).';
          // Si faltan órdenes, informar brevemente
          const ordenesEsperadas = afterData.ordenesEsperadas || [];
          const ordenesEncontradas = afterData.ordenesEncontradas || [];
          if (ordenesEsperadas.length > ordenesEncontradas.length) {
            razon = `Faltan órdenes: ${ordenesEsperadas.length - ordenesEncontradas.length}`;
          } else {
            razon = afterData.mensaje || '';
          }
        } else {
          razon = afterData.mensaje || '';
        }

        const detalles: Array<{ label: string; value: string }> = [
          { label: 'Shipment ID', value: shipmentId },
          { label: 'Estado anterior', value: String(estadoAnterior) },
          { label: 'Estado actual', value: String(estadoActual) },
          { label: 'Resultado', value: resultadoTexto },
        ];
        if (razon) detalles.push({ label: 'Razón / Detalle', value: String(razon) });

        // Enviar notificación concisa al equipo
        enviarNotificacionGenerica(
          {
            title: `Intento de carga - Shipment ${shipmentId}`,
            message: resultadoTexto,
            type: estadoActual === 'cargado' ? 'success' : estadoActual === 'reintento_fallido' ? 'error' : 'alert',
            details: detalles,
          },
          [
            'pablo.guerrero@asurity.cl',
            'ivanahaack33@gmail.com',
          ],
          estadoActual === 'cargado' ? 'normal' : 'high'
        ).catch((error) => {
          logger.error(`${logPrefix} ❌ Error al enviar email de intento de carga`, {
            shipmentId,
            error: error.message,
          });
        });

        logger.info(`${logPrefix} ✅ Notificación de actualización procesada`, {
          shipmentId,
          estadoAnterior,
          estadoActual,
        });
        return;
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`${logPrefix} ❌ Error en notificación de inconsistencia`, {
        shipmentId,
        error: err.message,
        stack: err.stack,
      });
      // No lanzar error - fail-safe, no debe romper el flujo
    }
  }
);

// =================================================================
// ============ SIMULACIÓN DE WEBHOOKS PARA INCONSISTENCIAS ========
// =================================================================

/**
 * Función auxiliar para crear un delay (espera) de forma asíncrona.
 * Útil para evitar sobrecargar el sistema al inyectar webhooks masivamente.
 * 
 * @param ms - Tiempo de espera en milisegundos
 * @returns Promise que se resuelve después del tiempo especificado
 */
function esperarMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifica si ya existe un webhook para una orden específica.
 * 
 * @param orderId - ID de la orden a verificar
 * @param traceId - ID de trazabilidad para logging
 * @returns true si el webhook ya existe, false si no existe
 */
async function verificarWebhookExistente(
  orderId: string,
  traceId: string
): Promise<boolean> {
  const logPrefix = `[Trace: ${traceId}] [verificarWebhookExistente]`;
  const resource = `/orders/${orderId}`;
  
  try {
    const snapshot = await db
      .collection(firestoreCollections.meliNotifications)
      .where("resource", "==", resource)
      .limit(1)
      .get();
    
    const existe = !snapshot.empty;
    
    if (existe) {
      logger.info(`${logPrefix} Webhook ya existe para order ${orderId}. Saltando.`);
    }
    
    return existe;
  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} Error al verificar webhook existente para order ${orderId}`, {
      error: err.message,
    });
    // En caso de error, asumir que no existe para continuar
    return false;
  }
}

/**
 * Crea un documento de webhook simulado en la colección webhookRecibidosMercadoLibre.
 * El documento se crea SIN el campo 'status' para que el trigger procesarNotificacionMeli
 * lo detecte y procese como una notificación nueva.
 * 
 * @param orderId - ID de la orden para la cual crear el webhook
 * @param traceId - ID de trazabilidad para logging
 * @returns Promise que se resuelve cuando se crea el documento
 */
async function crearWebhookSimulado(
  orderId: string,
  traceId: string
): Promise<void> {
  const logPrefix = `[Trace: ${traceId}] [crearWebhookSimulado]`;
  const resource = `/orders/${orderId}`;
  const webhookId = uuidv4();
  
  const webhookData = {
    application_id: 2221674115246629,
    attempts: 1,
    fechaHoraRecepcionEnFuncion: Timestamp.now(),
    idWML: webhookId,
    received: Timestamp.now(),
    sent: Timestamp.now(),
    resource: resource,
    topic: "orders_v2",
    user_id: 454112654,
    // IMPORTANTE: NO incluir campo 'status' para que el trigger lo procese
  };
  
  try {
    await db
      .collection(firestoreCollections.meliNotifications)
      .doc(webhookId)
      .set(webhookData);
    
    logger.info(`${logPrefix} ✅ Webhook simulado creado para order ${orderId}`, {
      webhookId,
      resource,
    });
  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} ❌ Error al crear webhook simulado para order ${orderId}`, {
      error: err.message,
      stack: err.stack,
    });
    throw error;
  }
}

/**
 * Cloud Function HTTP que simula la inyección de webhooks para órdenes pendientes.
 * 
 * **PROPÓSITO:**
 * Lee órdenes esperadas desde enviosConInconsistencias (estado "sin carga") y crea
 * webhooks simulados para disparar el procesamiento normal del pipeline.
 * 
 * **FLUJO:**
 * 1. Busca documentos en enviosConInconsistencias con estado_de_carga = "sin carga"
 * 2. Extrae ordenesEsperadas de cada documento
 * 3. Para cada order ID:
 *    a. Verifica si ya existe webhook en webhookRecibidosMercadoLibre
 *    b. Si NO existe, crea documento de webhook simulado
 *    c. Espera 500ms antes de procesar la siguiente
 * 
 * **SEGURIDAD:**
 * Requiere Bearer token en header Authorization (schedulerSecret)
 * 
 * **USO:**
 * curl --location 'https://[URL]/simularWebhooksParaInconsistencias' \
 *   --header 'Authorization: Bearer [SECRET]'
 */
export const simularWebhooksParaInconsistencias = functions.https.onRequest(async (req, res) => {
  const traceId = uuidv4();
  const logPrefix = `[Trace: ${traceId}] [SimularWebhooks]`;

  logger.info(`${logPrefix} ========================================`);
  logger.info(`${logPrefix} INICIO: Simulación de webhooks para órdenes pendientes`);
  logger.info(`${logPrefix} ========================================`);

  // =================================================================
  // FASE 1: VALIDACIÓN DE SEGURIDAD
  // =================================================================
  if (req.headers.authorization !== `Bearer ${securityConfig.schedulerSecret}`) {
    logger.error(`${logPrefix} ❌ Error de autorización. Secreto inválido o ausente.`);
    res.status(401).send("Unauthorized");
    return;
  }
  
  logger.info(`${logPrefix} ✅ FASE 1: Autenticación exitosa`);

  try {
    // =================================================================
    // FASE 2: BÚSQUEDA DE DOCUMENTOS PENDIENTES
    // =================================================================
    logger.info(`${logPrefix} FASE 2: Buscando documentos con estado "sin carga"...`);
    
    const snapshot = await db
      .collection(firestoreCollections.reviewQueue)
      .where("estado_de_carga", "==", "sin carga")
      .get();

    if (snapshot.empty) {
      logger.info(`${logPrefix} No se encontraron documentos pendientes. Finalizando.`);
      res.status(200).send("OK: No hay órdenes pendientes para procesar.");
      return;
    }

    logger.info(`${logPrefix} ✅ Encontrados ${snapshot.size} documento(s) con estado "sin carga"`);

    // =================================================================
    // FASE 3: EXTRACCIÓN DE ÓRDENES ESPERADAS
    // =================================================================
    logger.info(`${logPrefix} FASE 3: Extrayendo órdenes esperadas de cada documento...`);
    
    const todasLasOrdenes: string[] = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data() as InconsistencyLog;
      const ordenesEsperadas = data.ordenesEsperadas || [];
      
      for (const orden of ordenesEsperadas) {
        if (orden.id) {
          todasLasOrdenes.push(orden.id);
        }
      }
      
      logger.info(`${logPrefix} Documento ${doc.id}: ${ordenesEsperadas.length} orden(es) esperada(s)`);
    }
    
    const ordenesUnicas = [...new Set(todasLasOrdenes)]; // Eliminar duplicados
    logger.info(`${logPrefix} ✅ Total de órdenes únicas a procesar: ${ordenesUnicas.length}`);

    if (ordenesUnicas.length === 0) {
      logger.info(`${logPrefix} No hay órdenes para procesar. Finalizando.`);
      res.status(200).send("OK: No hay órdenes válidas para procesar.");
      return;
    }

    // =================================================================
    // FASE 4: PROCESAMIENTO DE WEBHOOKS
    // =================================================================
    logger.info(`${logPrefix} FASE 4: Iniciando procesamiento de webhooks...`);
    
    let webhooksCreados = 0;
    let webhooksExistentes = 0;
    let errores = 0;

    for (let i = 0; i < ordenesUnicas.length; i++) {
      const orderId = ordenesUnicas[i];
      const progreso = `[${i + 1}/${ordenesUnicas.length}]`;
      
      logger.info(`${logPrefix} ${progreso} Procesando order ${orderId}...`);
      
      try {
        // Verificar si ya existe el webhook
        const existe = await verificarWebhookExistente(orderId, traceId);
        
        if (existe) {
          webhooksExistentes++;
          logger.info(`${logPrefix} ${progreso} ⏭️ Order ${orderId}: Webhook ya existe`);
        } else {
          // Crear webhook simulado
          await crearWebhookSimulado(orderId, traceId);
          webhooksCreados++;
          logger.info(`${logPrefix} ${progreso} ✅ Order ${orderId}: Webhook creado`);
        }
        
        // Esperar 500ms antes de procesar el siguiente (solo si no es el último)
        if (i < ordenesUnicas.length - 1) {
          await esperarMs(500);
        }
        
      } catch (error) {
        errores++;
        const err = error as Error;
        logger.error(`${logPrefix} ${progreso} ❌ Error procesando order ${orderId}`, {
          error: err.message,
        });
        // Continuar con la siguiente orden
      }
    }

    // =================================================================
    // FASE 5: RESUMEN Y FINALIZACIÓN
    // =================================================================
    logger.info(`${logPrefix} ========================================`);
    logger.info(`${logPrefix} RESUMEN DE EJECUCIÓN`);
    logger.info(`${logPrefix} ========================================`);
    logger.info(`${logPrefix} Webhooks creados: ${webhooksCreados}`);
    logger.info(`${logPrefix} Webhooks existentes (saltados): ${webhooksExistentes}`);
    logger.info(`${logPrefix} Errores: ${errores}`);
    logger.info(`${logPrefix} Total procesado: ${ordenesUnicas.length}`);
    logger.info(`${logPrefix} ========================================`);

    res.status(200).send("OK");

  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} ❌ Error crítico en simulación de webhooks`, {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).send("Error interno del servidor.");
  }
});