/**
 * @fileoverview Servicio para obtener configuraciones de negocio desde Firestore.
 */

import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { DateTime } from "luxon";

/**
 * Define la estructura del objeto que contiene las horas de corte.
 */
export interface HorasDeCorte {
  horaCorteColecta: string; // Formato "HH:mm"
  horaCorteFWW: string; // Formato "HH:mm"
}


/**
 * Obtiene las horas de corte configuradas para los diferentes tipos de pedido desde Firestore.
 * Formatea las horas en el formato "HH:mm" y valida la existencia de los campos requeridos.
 * @param traceId Identificador único para trazabilidad en logs.
 * @returns Un objeto con las horas de corte formateadas para cada tipo de pedido.
 * @throws Error si no se encuentra el documento de configuración o faltan campos requeridos.
 */
export async function fetchHorasDeCorte(traceId: string): Promise<HorasDeCorte> {
  const logPrefix = `[Trace: ${traceId}] [fetchHorasDeCorte]`;
  logger.info(`${logPrefix} Obteniendo horas de corte desde Firestore.`);
  const db = getFirestore();

  try {
    const snapshot = await db.collection("configuraciones").limit(1).get();

    if (snapshot.empty) {
      throw new Error(`${logPrefix} No se encontró el documento de configuración de horas de corte.`);
    }

    const config = snapshot.docs[0].data();
    const zonaHoraria = "America/Santiago";

    // Validación estricta de los campos requeridos para evitar errores en el formato de horas.
    if (!config.horaDeCorteColecta || !config.horaDeCorteFlexWebWhatsapp) {
      throw new Error(`${logPrefix} El documento de configuración no contiene los campos de hora de corte requeridos.`);
    }

    // Se usa luxon para asegurar el formato y la zona horaria correcta en la conversión de fechas.
    const dtColecta = DateTime.fromJSDate(config.horaDeCorteColecta.toDate(), { zone: zonaHoraria });
    const dtFWW = DateTime.fromJSDate(config.horaDeCorteFlexWebWhatsapp.toDate(), { zone: zonaHoraria });

    const result = {
      horaCorteColecta: dtColecta.toFormat("HH:mm"),
      horaCorteFWW: dtFWW.toFormat("HH:mm"),
    };

    // TODO: Permitir configuración de zona horaria desde Firestore para mayor flexibilidad.

    return result;

  } catch (error) {
    // Si ocurre cualquier error, se loguea y se relanza para manejo superior.
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico al obtener horas de corte.`, {
      errorMessage: err.message,
      errorStack: err.stack,
    });
    throw err;
  }
}

// --- NUEVA FUNCIÓN AÑADIDA ---

/**
 * Verifica si la nueva función de procesamiento de pedidos está habilitada
 * según la configuración en Firestore.
 * @param traceId La huella única para la trazabilidad de los logs.
 * @returns {Promise<boolean>} True si está habilitada, false en caso contrario.
 */
export async function isNuevaFuncionHabilitada(traceId: string): Promise<boolean> {
  const logPrefix = `[Trace: ${traceId}] [isNuevaFuncionHabilitada]`;
  logger.info(`${logPrefix} Verificando feature flag 'nuevaFuncionPedidosHabilitada'.`);
  const db = getFirestore();

  try {
    const snapshot = await db.collection("configuraciones").limit(1).get();

    if (snapshot.empty) {
      logger.error(`${logPrefix} No se encontró el documento de configuración. La función se deshabilita por seguridad.`);
      return false;
    }

    const config = snapshot.docs[0].data();

    const isEnabled = config.nuevaFuncionPedidosHabilitada === true;
    logger.info(`${logPrefix} Feature flag evaluado. Habilitada: ${isEnabled}.`);
    return isEnabled;

  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico al verificar feature flag.`, {
      errorMessage: err.message,
      errorStack: err.stack,
    });
    // Por seguridad, si hay un error, se considera deshabilitada.
    return false;
  }
}