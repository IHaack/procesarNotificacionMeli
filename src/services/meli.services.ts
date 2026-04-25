/**
 * @fileoverview Servicio para interactuar con la API de Mercado Libre (MELI).
 */

import axios from "axios";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import { meliConfig, firestoreCollections } from "../config/config";
import {
  MeliOrderPayload,
  MeliShipmentPayload,
  MeliBillingInfoPayload,
  MeliPackPayload,
  MeliOrderSearchPayload,
} from "../interfaces/meli.interfaces";
import { OAuthResponseDocument } from "../interfaces/oauth.interfaces";

/**
 * Obtiene el token de acceso más reciente desde Firestore.
 * Es una función interna del servicio, reutilizable por otras funciones aquí.
 * @returns {Promise<string>} El access_token válido.
 */
export async function getValidAccessToken(): Promise<string> {
  // Obtenemos la instancia de DB aquí dentro para optimizar el inicio.
  const db = getFirestore();
  logger.info("[getValidAccessToken] Obteniendo Access Token de MELI desde Firestore.");

  const tokenDocRef = db
    .collection(firestoreCollections.oAuthResponses)
    .doc(meliConfig.oAuthDocId);

  const tokenDoc = await tokenDocRef.get();

  if (!tokenDoc.exists) {
    logger.error(
      `[getValidAccessToken] Documento de OAuth no encontrado con ID: ${meliConfig.oAuthDocId}`
    );
    throw new Error("Documento de credenciales de MELI no encontrado.");
  }

  const tokenData = tokenDoc.data() as OAuthResponseDocument;
  logger.info("[getValidAccessToken] Access Token obtenido correctamente desde Firestore.");
  return tokenData.access_token;
}


/**
 * Obtiene los detalles completos de un pedido de MELI dado el path del recurso.
 * Realiza una petición HTTP autenticada usando el access token actual.
 * @param resourceUrl Path del recurso del pedido (ejemplo: /orders/12345).
 * @param traceId Identificador de trazabilidad para logging y debugging.
 * @returns Los detalles completos del pedido como un objeto MeliOrderPayload.
 * @throws Error si la API de MELI no responde correctamente o el pedido no existe.
 */
export async function fetchOrderDetails(
  resourceUrl: string,
  traceId: string
): Promise<MeliOrderPayload> {
  const logPrefix = `[Trace: ${traceId}] [fetchOrderDetails]`;
  logger.info(`${logPrefix} Buscando detalles del pedido para el recurso: ${resourceUrl}`);

  const accessToken = await getValidAccessToken();
  const fullUrl = `${meliConfig.apiUrl}${resourceUrl}`;

  try {
    // Se realiza la petición HTTP autenticada para obtener los datos del pedido.
    const response = await axios.get<MeliOrderPayload>(fullUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    logger.info(
      `${logPrefix} Detalles del pedido para ${resourceUrl} obtenidos correctamente.`
    );
    return response.data;
  } catch (error: any) {
    // Extraer información del error para logging detallado
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = error.message;
    
    // Log estructurado con todos los detalles
    logger.error(
      `${logPrefix} Error al obtener detalles del pedido de MELI para ${resourceUrl}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: statusCode,
        data: errorData,
        message: errorMessage,
      }
    );
    
    // Construir mensaje de error descriptivo con información clave
    let mensajeDetallado = `${logPrefix} Fallo al contactar la API de MELI para el recurso ${resourceUrl}`;
    
    if (statusCode) {
      mensajeDetallado += ` - HTTP ${statusCode}`;
      
      // Agregar interpretación del código de estado
      if (statusCode === 404) {
        mensajeDetallado += ` (Orden no encontrada)`;
      } else if (statusCode === 401 || statusCode === 403) {
        mensajeDetallado += ` (Error de autenticación)`;
      } else if (statusCode === 429) {
        mensajeDetallado += ` (Rate limit excedido)`;
      } else if (statusCode >= 500) {
        mensajeDetallado += ` (Error del servidor de MELI)`;
      }
    }
    
    // Agregar mensaje de error de la API si existe
    if (errorData?.message) {
      mensajeDetallado += ` - ${errorData.message}`;
    } else if (errorData?.error) {
      mensajeDetallado += ` - ${errorData.error}`;
    }
    
    throw new Error(mensajeDetallado);
  }
}

/**
 * Obtiene los detalles de un envío específico desde la API de MELI.
 * @param {number} shipmentId - El ID del envío.
 * @returns {Promise<MeliShipmentPayload>} Los detalles del envío.
 */
export async function fetchShipmentDetails(
  shipmentId: number,
  traceId: string
): Promise<MeliShipmentPayload> {
  const logPrefix = `[Trace: ${traceId}] [fetchShipmentDetails]`;
  logger.info(`${logPrefix} Buscando detalles del envío para el ID: ${shipmentId}`);

  const accessToken = await getValidAccessToken();
  const fullUrl = `${meliConfig.apiUrl}/shipments/${shipmentId}`;

  try {
    const response = await axios.get<MeliShipmentPayload>(fullUrl, {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'x-format-new': 'true'
      },
    });
    logger.info(`${logPrefix} Detalles del envío ${shipmentId} obtenidos correctamente.`);
    return response.data;
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = error.message;
    
    logger.error(
      `${logPrefix} Error al obtener detalles del envío de MELI para ${shipmentId}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: statusCode,
        data: errorData,
        message: errorMessage,
      }
    );
    
    let mensajeDetallado = `${logPrefix} Fallo al contactar la API de MELI para el envío ${shipmentId}`;
    
    if (statusCode) {
      mensajeDetallado += ` - HTTP ${statusCode}`;
      
      if (statusCode === 404) {
        mensajeDetallado += ` (Envío no encontrado)`;
      } else if (statusCode === 401 || statusCode === 403) {
        mensajeDetallado += ` (Error de autenticación)`;
      } else if (statusCode === 429) {
        mensajeDetallado += ` (Rate limit excedido)`;
      } else if (statusCode >= 500) {
        mensajeDetallado += ` (Error del servidor de MELI)`;
      }
    }
    
    if (errorData?.message) {
      mensajeDetallado += ` - ${errorData.message}`;
    } else if (errorData?.error) {
      mensajeDetallado += ` - ${errorData.error}`;
    }
    
    throw new Error(mensajeDetallado);
  }
}


// =================================================================
// ============== NUEVA FUNCIÓN AÑADIDA ============================
// =================================================================
/**
 * Construye el endpoint moderno de facturación para Mercado Libre.
 */
function buildBillingInfoUrl(siteId: string, billingInfoId: string): string {
  return `${meliConfig.apiUrl}/orders/billing-info/${siteId}/${billingInfoId}`;
}

function normalizeBillingInfoPayload(raw: any): MeliBillingInfoPayload {
  // Formato esperado actual
  if (raw?.billing_info) {
    return { billing_info: raw.billing_info };
  }

  // Formato observado en producción:
  // { buyer: { billing_info: { identification: { type, number }, address... } } }
  const buyerBillingInfo = raw?.buyer?.billing_info;
  if (buyerBillingInfo) {
    const identification = buyerBillingInfo.identification || {};
    const address = buyerBillingInfo.address || {};

    return {
      billing_info: {
        doc_type: identification.type || null,
        doc_number: identification.number || null,
        additional_info: [
          { type: "CITY_NAME", value: address.city_name || "" },
          { type: "STATE_NAME", value: address.state?.name || "" },
          { type: "STATE_CODE", value: address.state?.code || "" },
          { type: "STREET_NAME", value: address.street_name || "" },
          { type: "STREET_NUMBER", value: address.street_number || "" },
        ].filter((item) => item.value),
      },
    };
  }

  return { billing_info: { doc_type: null, doc_number: null } };
}

/**
 * Obtiene la información de facturación de una orden específica.
 */
export async function fetchBillingInfo(
  siteId: string | undefined,
  billingInfoId: string | undefined,
  traceId: string
): Promise<MeliBillingInfoPayload> {
  const logPrefix = `[Trace: ${traceId}] [fetchBillingInfo]`;

  if (!siteId || !billingInfoId) {
    logger.warn(
      `${logPrefix} No se encontró siteId o billingInfoId. Se devolverá billing_info vacío.`
    );
    return { billing_info: { doc_type: null, doc_number: null } };
  }

  const fullUrl = buildBillingInfoUrl(siteId, billingInfoId);
  logger.info(`${logPrefix} Buscando información de facturación para el recurso: ${fullUrl}`);

  const accessToken = await getValidAccessToken();

  try {
    const response = await axios.get<any>(fullUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    logger.info(`${logPrefix} Información de facturación obtenida correctamente para ${fullUrl}.`);
    return normalizeBillingInfoPayload(response.data);
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = error.message;
    
    logger.error(
      `${logPrefix} Error al obtener la info de facturación de MELI para ${fullUrl}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: statusCode,
        data: errorData,
        message: errorMessage,
      }
    );

    if (statusCode === 404) {
      logger.warn(
        `${logPrefix} La información de facturación no existe en MELI para ${siteId}/${billingInfoId}. Retornando datos vacíos.`
      );
      return { billing_info: { doc_type: null, doc_number: null } };
    }

    let mensajeDetallado = `${logPrefix} Fallo al contactar la API de MELI para la facturación de ${fullUrl}`;
    
    if (statusCode) {
      mensajeDetallado += ` - HTTP ${statusCode}`;
      
      if (statusCode === 401 || statusCode === 403) {
        mensajeDetallado += ` (Error de autenticación)`;
      } else if (statusCode === 429) {
        mensajeDetallado += ` (Rate limit excedido)`;
      } else if (statusCode >= 500) {
        mensajeDetallado += ` (Error del servidor de MELI)`;
      }
    }
    
    if (errorData?.message) {
      mensajeDetallado += ` - ${errorData.message}`;
    } else if (errorData?.error) {
      mensajeDetallado += ` - ${errorData.error}`;
    }
    
    throw new Error(mensajeDetallado);
  }
}

// =================================================================
// ============== NUEVA FUNCIÓN AÑADIDA ============================
// =================================================================
/**
 * Obtiene los detalles de un pack de MELI para saber qué órdenes lo componen.
 */
export async function fetchPackDetails(
  packId: string,
  traceId: string
): Promise<MeliPackPayload> {
  const logPrefix = `[Trace: ${traceId}] [fetchPackDetails]`;
  logger.info(`${logPrefix} Buscando detalles del pack ID: ${packId}`);

  const accessToken = await getValidAccessToken();
  const fullUrl = `${meliConfig.apiUrl}/packs/${packId}`;

  try {
    const response = await axios.get<MeliPackPayload>(fullUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    logger.info(`${logPrefix} Detalles del pack ${packId} obtenidos correctamente.`);
    return response.data;
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = error.message;
    
    logger.error(
      `${logPrefix} Error al obtener detalles del pack de MELI para ${packId}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: statusCode,
        data: errorData,
        message: errorMessage,
      }
    );
    
    let mensajeDetallado = `${logPrefix} Fallo al contactar la API de MELI para el pack ${packId}`;
    
    if (statusCode) {
      mensajeDetallado += ` - HTTP ${statusCode}`;
      
      if (statusCode === 404) {
        mensajeDetallado += ` (Pack no encontrado)`;
      } else if (statusCode === 401 || statusCode === 403) {
        mensajeDetallado += ` (Error de autenticación)`;
      } else if (statusCode === 429) {
        mensajeDetallado += ` (Rate limit excedido)`;
      } else if (statusCode >= 500) {
        mensajeDetallado += ` (Error del servidor de MELI)`;
      }
    }
    
    if (errorData?.message) {
      mensajeDetallado += ` - ${errorData.message}`;
    } else if (errorData?.error) {
      mensajeDetallado += ` - ${errorData.error}`;
    }
    
    throw new Error(mensajeDetallado);
  }
}

/**
 * Busca órdenes asociadas a un shipment para un seller dado.
 * Se usa como fallback cuando el shipment no trae external_reference.
 */
export async function searchOrdersByShipment(
  sellerId: number,
  shipmentId: number,
  traceId: string
): Promise<MeliOrderSearchPayload> {
  const logPrefix = `[Trace: ${traceId}] [searchOrdersByShipment]`;
  logger.info(
    `${logPrefix} Buscando orders para seller=${sellerId}, shipment=${shipmentId}.`
  );

  const accessToken = await getValidAccessToken();
  const fullUrl = `${meliConfig.apiUrl}/orders/search?seller=${sellerId}&shipping.id=${shipmentId}`;

  try {
    const response = await axios.get<MeliOrderSearchPayload>(fullUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    logger.info(
      `${logPrefix} Orders search obtenido correctamente. Results: ${response.data.results?.length || 0}`
    );
    return response.data;
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = error.message;

    logger.error(
      `${logPrefix} Error al buscar orders por shipment.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: statusCode,
        data: errorData,
        message: errorMessage,
      }
    );

    let mensajeDetallado = `${logPrefix} Fallo al consultar orders/search para seller=${sellerId}, shipment=${shipmentId}`;
    if (statusCode) {
      mensajeDetallado += ` - HTTP ${statusCode}`;
    }
    if (errorData?.message) {
      mensajeDetallado += ` - ${errorData.message}`;
    } else if (errorData?.error) {
      mensajeDetallado += ` - ${errorData.error}`;
    }

    throw new Error(mensajeDetallado);
  }
}

/**
 * Obtiene el user_id (seller) asociado al access token actual.
 * Útil cuando el shipment no trae source.sender_id/source.seller_id.
 */
export async function fetchAuthenticatedUserId(traceId: string): Promise<number> {
  const logPrefix = `[Trace: ${traceId}] [fetchAuthenticatedUserId]`;
  logger.info(`${logPrefix} Consultando /users/me para resolver seller_id.`);

  const accessToken = await getValidAccessToken();
  const fullUrl = `${meliConfig.apiUrl}/users/me`;

  try {
    const response = await axios.get<{ id: number }>(fullUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userId = response.data?.id;
    if (!userId) {
      throw new Error(`${logPrefix} /users/me no devolvió id de usuario.`);
    }

    logger.info(`${logPrefix} seller_id resuelto desde token: ${userId}`);
    return userId;
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = error.message;

    logger.error(`${logPrefix} Error consultando /users/me.`, {
      traceId: traceId,
      url: fullUrl,
      status: statusCode,
      data: errorData,
      message: errorMessage,
    });

    let mensajeDetallado = `${logPrefix} Fallo al obtener seller_id desde /users/me`;
    if (statusCode) {
      mensajeDetallado += ` - HTTP ${statusCode}`;
    }
    if (errorData?.message) {
      mensajeDetallado += ` - ${errorData.message}`;
    } else if (errorData?.error) {
      mensajeDetallado += ` - ${errorData.error}`;
    }

    throw new Error(mensajeDetallado);
  }
}