/**
 * @fileoverview Adaptador para transformar un pedido de la API de MELI
 * al formato final de PedidosBSDocument, aplicando toda la lógica de negocio.
 */

import { Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { DateTime } from "luxon";
import { businessRules } from "../config/config";
import {
  MeliOrderPayload,
  MeliShipmentPayload,
  MeliBillingInfo,
} from "../interfaces/meli.interfaces";
import {
  PedidosBSDocument,
  DetallePedido,
  ProductoListadoModificado,
  EstatusProcesoInterno,
} from "../interfaces/pedidos.interfaces";
import { ContextoPedido } from "../interfaces/bsale.interfaces";
import { HorasDeCorte } from "../services/config.services";

/**
 * Interfaz interna para manejar los productos durante el pipeline de transformación.
 */
interface ProductoProcesado {
  SKUproducto: string;
  CantidadProducto: string;
  NombreProducto: string;
  DescripcionProducto: string;
  ImagenProducto: string;
}

// =================================================================
// ============== HELPERS Y TRANSFORMADORES DE LÓGICA ==============
// =================================================================

/**
 * Formatea un string de RUT/RUN chileno (ej. "123456789") al formato
 * estándar con guion (ej. "12345678-9").
 * @param rut El string del RUT sin formato.
 * @returns El RUT formateado.
 */
function formatarRutChileno(rut: string): string {
  if (typeof rut !== "string" || rut.length < 2) {
    return rut;
  }
  const cuerpo = rut.slice(0, -1);
  const digitoVerificador = rut.slice(-1);
  return `${cuerpo}-${digitoVerificador}`;
}

/**
 * Calcula la fecha de carga final de un pedido basándose en la hora de corte
 * y las reglas de negocio para cada día de la semana.
 * @param fechaPedidoOriginal La fecha en que se realizó el pedido.
 * @param tipoPedido El tipo de logística del pedido (Colecta, Flex, etc.).
 * @param horasDeCorte Un objeto con las horas de corte configuradas.
 * @returns Un objeto Date de JS para la fecha de carga calculada.
 */
function calcularFechaCargado(
  fechaPedidoOriginal: Date,
  tipoPedido: string,
  horasDeCorte: HorasDeCorte
): Date {
  const zonaHoraria = "America/Santiago";
  let horaDeCorteStr: string;

  const tipo = tipoPedido.toLowerCase();

  // Asigna la hora de corte correspondiente
  if (["flex", "whatsapp", "pedido web"].includes(tipo)) {
    horaDeCorteStr = horasDeCorte.horaCorteFWW;
  } else if (tipo === "colecta") {
    horaDeCorteStr = horasDeCorte.horaCorteColecta;
  } else {
    return fechaPedidoOriginal; // Si el tipo no es válido, no se aplica lógica
  }

  const [hora, minuto] = horaDeCorteStr.split(":").map(Number);

  const fechaPedido = DateTime.fromJSDate(fechaPedidoOriginal, {
    zone: zonaHoraria,
  });
  const fechaCorte = fechaPedido.set({
    hour: hora,
    minute: minuto,
    second: 0,
    millisecond: 0,
  });

  let fechaFinal = fechaPedido;

  // Se aplica la lógica específica para cada día de la semana
  switch (fechaPedido.weekday) {
    case 1: // Lunes
    case 2: // Martes
    case 3: // Miércoles
    case 4: // Jueves
      if (fechaPedido > fechaCorte) {
        fechaFinal = fechaPedido.plus({ days: 1 });
      }
      break;
    case 5: // Viernes
      if (fechaPedido > fechaCorte) {
        fechaFinal = fechaPedido.plus({ days: 3 });
      }
      break;
    case 6: // Sábado
      fechaFinal = fechaPedido.plus({ days: 2 });
      break;
    case 7: // Domingo
      fechaFinal = fechaPedido.plus({ days: 1 });
      break;
  }

  return fechaFinal.startOf("day").toJSDate();
}

/**
 * Desglosa un producto si es un pack válido.
 */
function transformadorPack(
  producto: ProductoProcesado,
  contexto: ContextoPedido,
  traceId: string
): ProductoProcesado[] {
  const logPrefix = `[Trace: ${traceId}] [transformadorPack]`;
  const productoMaestro = contexto.productosMap.get(producto.SKUproducto);

  const esUnPackValido =
    productoMaestro?.es_pack === true &&
    productoMaestro?.clasificacionDeProducto === 3;
  const esUnaCaja = producto.SKUproducto.toUpperCase().includes("CAJA");

  if (esUnPackValido && !esUnaCaja) {
    const packMaestro = contexto.packsMap.get(producto.SKUproducto);
    if (packMaestro?.ListadoProductosPackDesglosado) {
      logger.info(`${logPrefix} Desglosando pack: ${producto.SKUproducto}`);
      return packMaestro.ListadoProductosPackDesglosado.map((componente) => ({
        SKUproducto: componente.skuVariante,
        CantidadProducto: (
          componente.cantidadProductoEnPack * Number(producto.CantidadProducto)
        ).toString(),
        NombreProducto: componente.nombreDeVariante,
        DescripcionProducto: componente.descripcionVariante,
        ImagenProducto: "",
      }));
    }
  }
  return [producto];
}

/**
 * Transforma un producto "2X" en dos unidades del producto base.
 */
function transformador2X(
  producto: ProductoProcesado,
  contexto: ContextoPedido,
  traceId: string
): ProductoProcesado[] {
  const logPrefix = `[Trace: ${traceId}] [transformador2X]`;
  const productoMaestro = contexto.productosMap.get(producto.SKUproducto);
  if (productoMaestro?.DescripcionProductos?.toUpperCase().includes("2 X")) {
    const regExp = /2\s*X\s*(.*)/i;
    const match = regExp.exec(productoMaestro.DescripcionProductos);
    const descBase = match?.[1]?.trim();

    if (descBase) {
      for (const p of contexto.productosMap.values()) {
        if (
          p.productID === productoMaestro.productID &&
          p.DescripcionProductos.trim().toUpperCase() === descBase.toUpperCase()
        ) {
          logger.info(
            `${logPrefix} Transformando producto 2X: ${producto.SKUproducto} a ${p.SKU}`
          );
          return [
            {
              ...producto,
              SKUproducto: p.SKU,
              CantidadProducto: (
                Number(producto.CantidadProducto) * 2
              ).toString(),
            },
          ];
        }
      }
    }
  }
  return [producto];
}

/**
 * Enriquece la lista de productos con datos finales (nombre, descripción, imagen)
 * desde el contexto previamente cargado.
 */
function inyectarDatosFinales(
  productos: ProductoProcesado[],
  contexto: ContextoPedido,
  traceId: string
): ProductoProcesado[] {
  const logPrefix = `[Trace: ${traceId}] [inyectarDatosFinales]`;
  logger.info(`${logPrefix} Iniciando enriquecimiento de ${productos.length} productos.`);
  const { productosMap, imagenesMap } = contexto;

  return productos.map((p) => {
    const productoData = productosMap.get(p.SKUproducto);
    const imagenUrl = imagenesMap.get(p.SKUproducto);

    if (!productoData) {
      return {
        ...p,
        DescripcionProducto: "SKU no encontrado en Base de Datos",
        ImagenProducto: businessRules.URL_IMAGEN_DEFAULT,
      };
    }

    return {
      ...p,
      NombreProducto: productoData.NombreProducto || p.NombreProducto,
      DescripcionProducto:
        productoData.DescripcionProductos || p.DescripcionProducto,
      ImagenProducto: imagenUrl || businessRules.URL_IMAGEN_DEFAULT,
    };
  });
}

/**
 * Agrupa una lista de productos por SKU, sumando sus cantidades.
 */
export function consolidarProductos(
  productos: ProductoProcesado[],
  traceId: string
): ProductoListadoModificado[] {
  const logPrefix = `[Trace: ${traceId}] [consolidarProductos]`;
  logger.info(`${logPrefix} Consolidando lista de ${productos.length} productos...`);
  const productosConsolidados = new Map<string, ProductoProcesado>();
  productos.forEach((p) => {
    if (productosConsolidados.has(p.SKUproducto)) {
      const existente = productosConsolidados.get(p.SKUproducto)!;
      // Sumar cantidades y mantener los datos del primero
      existente.CantidadProducto = (
        Number(existente.CantidadProducto) + Number(p.CantidadProducto)
      ).toString();
    } else {
      // Solo el primer producto por SKU se guarda, los demás suman cantidad
      productosConsolidados.set(p.SKUproducto, { ...p });
    }
  });
  // Si hay diferencias en nombre, imagen o descripción, se toma la del primero
  const resultado = Array.from(productosConsolidados.values());
  logger.info(`${logPrefix} Consolidación finalizada. Resultado: ${resultado.length} líneas de producto.`);
  return resultado;
}

/**
 * Traduce el tipo de logística de MELI a un tipo de pedido de negocio.
 */
export function determinarTipoML(logisticType?: string): string {
  switch (logisticType) {
    case "cross_docking":
      return "Colecta";
    case "self_service":
      return "Flex";
    case "fulfillment":
      return "Full";
    default:
      return "Cualquiera";
  }
}

// =================================================================
// ============ FUNCIÓN ADAPTADORA PRINCIPAL Y EXPORTADA ===========
// =================================================================

/**
 * Orquesta la transformación completa de un pedido de MELI al formato final de PedidosBSDocument.
 */
export function adaptarPedidoMeli(
  meliOrder: MeliOrderPayload,
  meliShipment: MeliShipmentPayload,
  meliBillingInfo: MeliBillingInfo | null,
  contexto: ContextoPedido,
  horasDeCorte: HorasDeCorte,
  traceId: string
): PedidosBSDocument {
  const logPrefix = `[Trace: ${traceId}] [adaptarPedidoMeli]`;
  logger.info(`${logPrefix} Iniciando adaptación para el pedido de MELI ID: ${meliOrder.id}`);

  try {
    let codigoClienteFinal: string;
    if (meliBillingInfo && meliBillingInfo.doc_number && meliBillingInfo.doc_number !== "No posee rut") {
      codigoClienteFinal = formatarRutChileno(meliBillingInfo.doc_number);
      logger.info(`${logPrefix} CodigoCliente determinado: RUT ${codigoClienteFinal}`);
    } else {
      codigoClienteFinal = meliOrder.buyer.id.toString();
      logger.info(`${logPrefix} CodigoCliente determinado: Fallback a MELI buyer ID ${codigoClienteFinal}`);
    }

    const itemsFiltrados = meliOrder.order_items.filter((item) => {
      const descripcionUpper = item.item.title.toUpperCase().trim();
      return !businessRules.EXCLUDED_DESCRIPTIONS.includes(descripcionUpper);
    });

    const listadoInicial: ProductoProcesado[] = itemsFiltrados.map((item) => ({
      SKUproducto: item.item.seller_sku || item.item.id,
      CantidadProducto: item.quantity.toString(),
      NombreProducto: item.item.title,
      DescripcionProducto: "",
      ImagenProducto: "",
    }));
    logger.info(`${logPrefix} Lista inicial creada con ${listadoInicial.length} ítems. Iniciando transformaciones...`);

    const listadoTransformado = listadoInicial
      .flatMap((p) => transformadorPack(p, contexto, traceId))
      .flatMap((p) => transformador2X(p, contexto, traceId));
    logger.info(`${logPrefix} Transformaciones (packs/2X) completadas.`);

    const listadoEnriquecido = inyectarDatosFinales(listadoTransformado, contexto, traceId);
    const listadoConsolidado = consolidarProductos(listadoEnriquecido, traceId);

    const detallesPedido: DetallePedido[] = meliOrder.order_items.map(
      (item, index) => {
        const montoTotal = item.unit_price * item.quantity;
        const montoNeto = montoTotal / (1 + businessRules.taxRateIVA);
        const montoImpuesto = montoTotal - montoNeto;
        const sku = item.item.seller_sku;
        const productoMaestro = sku ? contexto.productosMap.get(sku) : undefined;
        const descripcionFinal = productoMaestro?.DescripcionProductos || item.item.title;
        return {
          Linea: index + 1,
          Cantidad: item.quantity.toString(),
          CodigoProducto: item.item.seller_sku || item.item.id,
          DescripcionProducto: descripcionFinal,
          ValorNetoUnitario: Math.round(montoNeto / item.quantity),
          ValorTotalUnitario: item.unit_price,
          MontoNeto: Math.round(montoNeto),
          MontoImpuesto: Math.round(montoImpuesto),
          MontoTotal: montoTotal,
        };
      }
    );

    const cantidadTotalProductos = listadoConsolidado.reduce(
      (total, producto) => total + Number(producto.CantidadProducto),
      0
    );

    const tipoDePedido = determinarTipoML(meliShipment.logistic?.type);
    const fechaPedidoOriginalJS = new Date(meliOrder.date_closed);
    const fechaCargadoCalculadaJS = calcularFechaCargado(
      fechaPedidoOriginalJS,
      tipoDePedido,
      horasDeCorte
    );

    const fechaCargadoTS = Timestamp.fromDate(fechaCargadoCalculadaJS);
    const fechaOriginalPedidoTS = Timestamp.fromDate(fechaPedidoOriginalJS);

    const adaptedOrder: PedidosBSDocument = {
      ApellidoCliente: meliOrder.buyer.last_name || "",
      NombreCliente: meliOrder.buyer.first_name || "",
      ClienteNombreCompleto: `${meliOrder.buyer.first_name} ${meliOrder.buyer.last_name}`.trim(),
      CodigoCliente: codigoClienteFinal,
      IDdocument: (meliOrder.pack_id || meliOrder.id).toString(),
      NumeroDocumento: meliOrder.pack_id || meliOrder.id,
      CodigoSeguimiento: meliOrder.shipping?.id?.toString() || "",
      URLPdf: "",
      URLPublicView: "",
      TipoDePedido: tipoDePedido,
      TipoDePedidoID: 37,
      ApellidoVendedor: "Mercadolibre",
      NombreVendedor: "Ventas",
      EmailVendedor: "ventas@andinagrains.cl",
      IDVendedor: 6,
      TotalMonto: meliOrder.total_amount,
      MontoNeto: detallesPedido.reduce((sum, item) => sum + item.MontoNeto, 0) || 0,
      MontoImpuesto: detallesPedido.reduce((sum, item) => sum + item.MontoImpuesto, 0) || 0,
      Moneda: meliOrder.currency_id === "CLP" ? "Peso Chileno" : meliOrder.currency_id,
      SimboloMoneda: "$",
      IDMoneda: 1,
      FechaCargado: fechaCargadoTS,
      FechaGeneradoListado: fechaCargadoTS,
      FechaParaConsulta: fechaCargadoTS,
      FechaOriginalPedido: fechaOriginalPedidoTS,
      EmisionDate: String(Math.floor(fechaOriginalPedidoTS.toMillis() / 1000)),
      GenerationDate: String(Math.floor(fechaOriginalPedidoTS.toMillis() / 1000)),
      Comuna: meliShipment.receiver_address?.city?.name || "No especificada",
      Region: meliShipment.receiver_address?.state?.name || "No especificada",
      Pais: meliShipment.receiver_address?.country?.name || "Chile",
      Domicilio: meliShipment.receiver_address?.address_line || "No especificada",
      Oficina: "Casa Matriz",
      DireccionOficina: "Casa Matriz",
      estatus_pago: meliOrder.status === "paid" ? "success" : meliOrder.status,
      EstadoPedido: 0,
      PedidoAutorizado: false,
      PedidoEnProceso: false,
      PedidoFinalizado: false,
      PedidoMarcado: false,
      PedidoTomado: false,
      DetallesPedido: detallesPedido,
      ListadoDeProductos: listadoInicial.map((p) => ({ ...p, ImagenProducto: p.ImagenProducto || businessRules.URL_IMAGEN_DEFAULT })),
      ListadoDeProductosModificado: listadoEnriquecido,
      ListadoProductosConsolidado: listadoConsolidado,
      NumeroProductos: cantidadTotalProductos,
      NumeroProductosModificado: cantidadTotalProductos,
      estadoInterno: EstatusProcesoInterno.LISTO_PARA_PICKING,
      cod_ZPL: "",
      etiquetaImpresa: false,
    };

    logger.info(`${logPrefix} Adaptación para el pedido ${meliOrder.id} completada.`);
    return adaptedOrder;

  } catch (error) {
    const err = error as Error;
    logger.error(`${logPrefix} Fallo crítico durante la adaptación del pedido ${meliOrder.id}.`, {
      errorMessage: err.message,
      errorStack: err.stack,
      meliOrderPayload: meliOrder,
    });
    throw err;
  }
}