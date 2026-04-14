/**
 * @fileoverview Servicio para interactuar con la API externa de BSale,
 * específicamente para la obtención de imágenes de productos.
 */

import axios from "axios";
import * as logger from "firebase-functions/logger";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { projectConfig, bsaleConfig, businessRules } from "../config/config";

const secretManagerClient = new SecretManagerServiceClient();

/**
 * Obtiene el token de acceso de la API de BSale desde Secret Manager.
 * Es una función interna de este servicio y no se exporta.
 * @param traceId La huella única para la trazabilidad de los logs.
 * @returns {Promise<string>} El token de acceso.
 */
async function getBsaleApiToken(traceId: string): Promise<string> {
  const logPrefix = `[Trace: ${traceId}] [getBsaleApiToken]`;
  // Construye la ruta completa al secreto usando nuestra configuración central.
  const name = `projects/${projectConfig.projectId}/secrets/${bsaleConfig.secretId}/versions/latest`;
  logger.info(`${logPrefix} Accediendo a secreto de BSale en Secret Manager.`);

  try {
    const [version] = await secretManagerClient.accessSecretVersion({ name });
    const token = version.payload?.data ? Buffer.from(version.payload.data).toString("utf8") : undefined;

    if (!token) {
      throw new Error("El secreto obtenido de Secret Manager está vacío.");
    }
    logger.info(`${logPrefix} Token de BSale obtenido correctamente.`);
    return token;
  } catch (error) {
    logger.error(`${logPrefix} Error crítico al acceder al secreto de Bsale:`, {
      errorMessage: (error as Error).message,
      errorStack: (error as Error).stack,
    });
    throw new Error(`${logPrefix} No se pudo obtener el token de acceso de Bsale.`);
  }
}

/**
 * Busca la imagen de un producto específico en los diferentes mercados de BSale.
 * Es una función interna de este servicio y no se exporta.
 * @param productId El ID del producto en BSale.
 * @param accessToken El token de acceso a la API de BSale.
 * @param traceId La huella única para la trazabilidad de los logs.
 * @returns {Promise<string>} La URL de la imagen o la URL por defecto.
 */
async function fetchImageForProductId(
  productId: number,
  accessToken: string,
  traceId: string
): Promise<string> {
  const logPrefix = `[Trace: ${traceId}] [fetchImageForProductId][ID: ${productId}]`;
  // Si no hay ID, retornamos la URL por defecto inmediatamente.
  if (!productId) {
    logger.warn(`${logPrefix} Se recibió un ID de producto nulo o inválido. Usando URL por defecto.`);
    return businessRules.URL_IMAGEN_DEFAULT;
  }

  // Iteramos sobre los IDs de mercado definidos en la configuración.
  for (const mercadoId of businessRules.BSALE_MERCADOS_IMAGENES) {
    try {
      const url = `${bsaleConfig.apiUrl}/markets/${mercadoId}/products/market_info.json?productId=${productId}`;
      const response = await axios.get(url, {
        headers: { access_token: accessToken },
      });
      const imageUrl = response.data?.data?.[0]?.urlImg;

      // Si encontramos una URL válida y no es la de por defecto, la retornamos.
      if (imageUrl && imageUrl !== businessRules.URL_IMAGEN_DEFAULT) {
        logger.info(`${logPrefix} Imagen encontrada en mercado ${mercadoId}.`);
        return imageUrl;
      }
    } catch (error) {
      // Si una consulta falla (ej. el producto no está en ese mercado),
      // lo registramos como una advertencia y continuamos con el siguiente.
      logger.warn(
        `${logPrefix} Fallo al consultar mercado ${mercadoId}. El producto podría no estar en este mercado.`
      );
    }
  }

  // Si no se encontró ninguna imagen en ningún mercado, retornamos la de por defecto.
  logger.info(`${logPrefix} No se encontró imagen en ningún mercado, usando URL por defecto.`);
  return businessRules.URL_IMAGEN_DEFAULT;
}


/**
 * Orquesta la obtención de imágenes para una lista de IDs de producto desde la API de BSale.
 * Realiza las búsquedas en paralelo y retorna un mapa de productID a URL de imagen.
 * @param productIDs Array de IDs de producto únicos para los cuales se buscan imágenes.
 * @param traceId Identificador único para trazabilidad en logs y debugging.
 * @returns Un Map donde la clave es el productID y el valor es la URL de la imagen obtenida.
 * @throws Nunca lanza error, pero retorna un mapa vacío si ocurre un fallo crítico en la consulta.
 */
export async function fetchImagesForProducts(
  productIDs: number[],
  traceId: string
): Promise<Map<number, string>> {
  const logPrefix = `[Trace: ${traceId}] [fetchImagesForProducts]`;
  if (productIDs.length === 0) {
    return new Map();
  }

  try {
    const accessToken = await getBsaleApiToken(traceId);

    // Se lanzan todas las búsquedas de imágenes en paralelo para mejorar la eficiencia y reducir el tiempo de espera.
    const imagePromises = productIDs.map((id) =>
      fetchImageForProductId(id, accessToken, traceId)
    );

    const imageUrls = await Promise.all(imagePromises);

    // Se construye el mapa de productID a URL de imagen, manteniendo el orden de los IDs.
    const imagenesMap = new Map<number, string>();
    productIDs.forEach((id, index) => {
      imagenesMap.set(id, imageUrls[index]);
    });

    // TODO: Implementar caché local para evitar llamadas repetidas a la API de BSale en pedidos similares.

    return imagenesMap;

  } catch (error) {
    // Si ocurre un error crítico, se loguea y se retorna un mapa vacío para no interrumpir el flujo principal.
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico durante la orquestación de búsqueda de imágenes.`, {
      errorMessage: err.message,
      errorStack: err.stack,
      productIDs: productIDs,
    });
    return new Map();
  }
}