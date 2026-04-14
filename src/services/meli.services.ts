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
    // Si la API responde con error, se loguea el detalle para facilitar el debugging.
    logger.error(
      `${logPrefix} Error al obtener detalles del pedido de MELI para ${resourceUrl}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      }
    );
    // TODO: Mejorar el manejo de errores para distinguir entre errores de red, autenticación y datos no encontrados.
    throw new Error(
      `${logPrefix} Fallo al contactar la API de MELI para el recurso ${resourceUrl}.`
    );
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
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    logger.info(`${logPrefix} Detalles del envío ${shipmentId} obtenidos correctamente.`);
    return response.data;
  } catch (error: any) {
    logger.error(
      `${logPrefix} Error al obtener detalles del envío de MELI para ${shipmentId}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      }
    );
    throw new Error(
      `${logPrefix} Fallo al contactar la API de MELI para el envío ${shipmentId}.`
    );
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
    const response = await axios.get<MeliBillingInfoPayload>(fullUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    logger.info(`${logPrefix} Información de facturación obtenida correctamente para ${fullUrl}.`);
    return response.data;
  } catch (error: any) {
    logger.error(
      `${logPrefix} Error al obtener la info de facturación de MELI para ${fullUrl}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      }
    );

    if (error.response?.status === 404) {
      logger.warn(
        `${logPrefix} La información de facturación no existe en MELI para ${siteId}/${billingInfoId}. Retornando datos vacíos.`
      );
      return { billing_info: { doc_type: null, doc_number: null } };
    }

    throw new Error(
      `${logPrefix} Fallo al contactar la API de MELI para la facturación de ${fullUrl}.`
    );
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
    logger.error(
      `${logPrefix} Error al obtener detalles del pack de MELI para ${packId}.`,
      {
        traceId: traceId,
        url: fullUrl,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      }
    );
    throw new Error(
      `${logPrefix} Fallo al contactar la API de MELI para el pack ${packId}.`
    );
  }
}