/* eslint-disable max-len */
/**
 * @fileoverview Servicio para interactuar con las colecciones internas de Firestore
 * y orquestar la carga de datos de servicios externos como el de BSale.
 */

import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { firestoreCollections } from "../config/config";
import {
  ProductoMaestro,
  PackMaestro,
  ContextoPedido,
} from "../interfaces/bsale.interfaces";
import { fetchImagesForProducts } from "./bsale.services";

/**
 * Función auxiliar para realizar consultas 'in' en lotes de 30 y evitar los límites de Firestore.
 */
async function queryInBatches(
  collection: string,
  field: string,
  values: (string | number)[],
  logPrefix: string // <-- Se añade el prefijo para trazabilidad
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (!values || values.length === 0) {
    return [];
  }
  const db = getFirestore();
  const uniqueValues = [...new Set(values)];
  const promises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

  for (let i = 0; i < uniqueValues.length; i += 30) {
    const batchValues = uniqueValues.slice(i, i + 30);
    logger.info(`${logPrefix} [queryInBatches] Consultando lote en '${collection}' por '${field}' con ${batchValues.length} valores.`);
    promises.push(
      db.collection(collection).where(field, "in", batchValues).get()
    );
  }

  const snapshots = await Promise.all(promises);
  return snapshots.flatMap((snapshot) => snapshot.docs);
}


/**
 * Carga los datos maestros de productos y packs desde Firestore y los enriquece con imágenes externas.
 * Descubre componentes y variantes adicionales, y retorna un contexto completo para el pedido.
 * @param skus Array de SKUs presentes en el pedido, usados para buscar productos y packs.
 * @param traceId Identificador único para trazabilidad en logs.
 * @returns Un objeto ContextoPedido con mapas de productos, packs e imágenes enriquecidas.
 * @throws Error si ocurre un fallo crítico durante la carga o consulta de datos.
 */
export async function cargarContextoDelPedido(
  skus: string[],
  traceId: string
): Promise<ContextoPedido> {
  const logPrefix = `[Trace: ${traceId}] [cargarContextoDelPedido]`;
  if (!skus || skus.length === 0) {
    logger.warn(`${logPrefix} No se proporcionaron SKUs. Retornando contexto vacío.`);
    return {
      productosMap: new Map(),
      packsMap: new Map(),
      imagenesMap: new Map(),
    };
  }

  try {
    logger.info(`${logPrefix} Cargando contexto para ${skus.length} SKUs iniciales.`);

    const [productosDocs, packsDocs] = await Promise.all([
      queryInBatches(firestoreCollections.products, "SKU", skus, logPrefix),
      queryInBatches(firestoreCollections.packs, "SKU", skus, logPrefix),
    ]);

    const productosMap = new Map<string, ProductoMaestro>(
      productosDocs.map((doc) => [doc.data().SKU, doc.data() as ProductoMaestro])
    );
    const packsMap = new Map<string, PackMaestro>(
      packsDocs.map((doc) => [doc.data().SKU, doc.data() as PackMaestro])
    );

    // Descubrimiento de SKUs de componentes de packs y variantes 2X que no están en el mapa inicial.
    const skusNivel2 = new Set<string>();
    packsMap.forEach((packData) => {
      packData.ListadoProductosPackDesglosado?.forEach((componente) => {
        // Se agregan solo los SKUs que no están en el mapa de productos para evitar duplicados.
        if (componente.skuVariante && !productosMap.has(componente.skuVariante)) {
          skusNivel2.add(componente.skuVariante);
        }
      });
    });

    // Identificación de productos "2X" para cargar variantes adicionales.
    const productIDs2X = new Set<number>();
    productosMap.forEach((producto) => {
      if (producto.DescripcionProductos?.toUpperCase().includes("2 X")) {
        productIDs2X.add(producto.productID);
      }
    });

    // TODO: Unificar la lógica de descubrimiento de SKUs y productIDs para mayor claridad y mantenibilidad.

    if (productIDs2X.size > 0 || skusNivel2.size > 0) {
      const promisesCargaAdicional = [];
      if (productIDs2X.size > 0) {
        promisesCargaAdicional.push(
          queryInBatches(firestoreCollections.products, "productID", [...productIDs2X], logPrefix)
        );
      }
      if (skusNivel2.size > 0) {
        promisesCargaAdicional.push(
          queryInBatches(firestoreCollections.products, "SKU", [...skusNivel2], logPrefix)
        );
      }
      const resultadosAdicionales = await Promise.all(promisesCargaAdicional);
      resultadosAdicionales.flat().forEach((doc) => {
        const producto = doc.data() as ProductoMaestro;
        // Se evita sobrescribir productos ya existentes en el mapa inicial.
        if (!productosMap.has(producto.SKU)) {
          productosMap.set(producto.SKU, producto);
        }
      });
    }

    // Enriquecimiento con imágenes externas usando los productID únicos.
    const productIDsUnicos = [...new Set([...productosMap.values()].map((p) => p.productID).filter(Boolean))];

    // Se asocian las imágenes obtenidas por productID al SKU correspondiente en el mapa de productos.
    const imagenesPorIdMap = await fetchImagesForProducts(productIDsUnicos, traceId);
    const imagenesMap = new Map<string, string>();
    productosMap.forEach((producto, sku) => {
      const imageUrl = imagenesPorIdMap.get(producto.productID);
      if (imageUrl) {
        imagenesMap.set(sku, imageUrl);
      }
    });

    return { productosMap, packsMap, imagenesMap };

  } catch (error) {
    // TODO: Implementar un sistema de alertas para errores críticos en la carga de contexto.
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico durante la carga del contexto del pedido.`, {
      errorMessage: err.message,
      errorStack: err.stack,
      skus: skus,
    });
    throw err;
  }
}