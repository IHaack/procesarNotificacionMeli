import { Timestamp } from "firebase-admin/firestore";

/**
 * @constant EstatusProcesoInterno
 * @description Define un conjunto de constantes para representar los estados internos del proceso de un pedido dentro de la bodega.
 *              Utilizar este objeto en lugar de strings directos previene errores de tipeo y centraliza los estados permitidos.
 * @property {string} LISTO_PARA_PICKING - El pedido ha sido validado y está listo para que se recojan sus productos.
 * @property {string} LISTO_PARA_PACKING - Todos los productos del pedido han sido recogidos (picking) y está listo para ser empaquetado.
 * @property {string} DESPACHADO - El pedido ha sido empaquetado, etiquetado y entregado al transportista.
 * @property {string} REVISION_MANUAL - El pedido ha sido marcado para ser revisado manualmente debido a una posible inconsistencia o sospecha.
 */
export const EstatusProcesoInterno = {
  LISTO_PARA_PICKING: "LISTO_PARA_PICKING",
  LISTO_PARA_PACKING: "LISTO_PARA_PACKING",
  DESPACHADO: "DESPACHADO",
  REVISION_MANUAL: "REVISION_MANUAL",
} as const;

export type EstatusProcesoInternoType =
  typeof EstatusProcesoInterno[keyof typeof EstatusProcesoInterno];

/**
 * @interface DetallePedido
 * @description Define la estructura de un ítem individual dentro del desglose de un pedido.
 * @property {string} Cantidad - La cantidad del producto solicitado.
 * @property {string} CodigoProducto - El SKU o código único del producto.
 * @property {string} DescripcionProducto - La descripción del producto.
 * @property {number} Linea - El número de línea del ítem en el pedido.
 * @property {number} MontoImpuesto - El monto del impuesto aplicado a esta línea.
 * @property {number} MontoNeto - El monto neto de la línea (sin impuestos).
 * @property {number} MontoTotal - El monto total de la línea (neto + impuesto).
 * @property {number} ValorNetoUnitario - El valor neto de una sola unidad del producto.
 * @property {number} ValorTotalUnitario - El valor total de una sola unidad del producto (con impuestos).
 */
export interface DetallePedido {
  // Se mantiene Cantidad como string porque así es como lo entrega el sistema de origen (BSale).
  // La conversión a número se debe realizar durante la transformación de datos para evitar inconsistencias.
  Cantidad: string;
  CodigoProducto: string;
  DescripcionProducto: string;
  Linea: number;
  MontoImpuesto: number;
  MontoNeto: number;
  MontoTotal: number;
  ValorNetoUnitario: number;
  ValorTotalUnitario: number;
}

/**
 * @interface ProductoListadoOriginal
 * @description Define la estructura de un producto en el listado original del pedido.
 * @property {string} CantidadProducto - La cantidad del producto.
 * @property {string} DescripcionProducto - La descripción del producto, que a veces contiene el SKU.
 * @property {string} ImagenProducto - La URL de la imagen del producto.
 * @property {string} NombreProducto - El nombre del producto.
 * @property {string} SKUproducto - El SKU del producto.
 */
export interface ProductoListadoOriginal {
  CantidadProducto: string;
  DescripcionProducto: string;
  ImagenProducto: string;
  NombreProducto: string;
  SKUproducto: string;
}

/**
 * @interface ProductoListadoModificado
 * @description Define la estructura de un producto en los listados modificados o consolidados.
 * @property {string} CantidadProducto - La cantidad del producto.
 * @property {string} DescripcionProducto - La descripción del producto.
 * @property {string} ImagenProducto - La URL de la imagen del producto.
 * @property {string} NombreProducto - El nombre del producto.
 * @property {string} SKUproducto - El SKU del producto.
 */
export interface ProductoListadoModificado {
  CantidadProducto: string;
  DescripcionProducto: string;
  ImagenProducto: string;
  NombreProducto: string;
  SKUproducto: string;
}

/**
 * @interface PedidosBSDocument
 * @description Define la estructura completa y final de un documento de pedido tal como se almacena en la colección 'PedidosBS'.
 *              Esta interfaz consolida toda la información del pedido, incluyendo detalles del cliente, productos, montos y estados internos del proceso.
 * @property {string} ApellidoCliente - Apellido del cliente.
 * @property {string} ApellidoVendedor - Apellido del vendedor.
 * @property {string} ClienteNombreCompleto - Nombre completo del cliente.
 * @property {string} CodigoCliente - RUT o identificador del cliente.
 * @property {string} CodigoSeguimiento - Código de seguimiento del envío.
 * @property {string} Comuna - Comuna del domicilio del cliente.
 * @property {DetallePedido[]} DetallesPedido - Array con el desglose de los productos del pedido.
 * @property {string} DireccionOficina - Dirección de la oficina (si aplica).
 * @property {string} Domicilio - Dirección de despacho del cliente.
 * @property {string} EmailVendedor - Email del vendedor.
 * @property {string} EmisionDate - Fecha de emisión del documento (timestamp de Unix como string).
 * @property {number} EstadoPedido - Estado numérico del pedido según el sistema de origen.
 * @property {Timestamp} FechaCargado - Fecha en que el pedido fue cargado en nuestro sistema.
 * @property {Timestamp} FechaGeneradoListado - Fecha en que se generó el listado de picking.
 * @property {Timestamp} FechaOriginalPedido - Fecha original en que se realizó el pedido.
 * @property {Timestamp} FechaParaConsulta - Fecha utilizada para facilitar las consultas.
 * @property {string} GenerationDate - Fecha de generación (timestamp de Unix como string).
 * @property {number} IDMoneda - ID numérico de la moneda.
 * @property {number} IDVendedor - ID numérico del vendedor.
 * @property {string} IDdocument - ID único del documento.
 * @property {ProductoListadoOriginal[]} ListadoDeProductos - Listado original de productos del pedido.
 * @property {ProductoListadoModificado[]} ListadoDeProductosModificado - Listado de productos tras aplicar modificaciones.
 * @property {ProductoListadoModificado[]} ListadoProductosConsolidado - Listado final y consolidado de productos para el picking.
 * @property {string} Moneda - Nombre de la moneda (ej. "CLP").
 * @property {number} MontoImpuesto - Monto total de impuestos del pedido.
 * @property {number} MontoNeto - Monto neto total del pedido.
 * @property {string} NombreCliente - Nombre del cliente.
 * @property {string} NombreVendedor - Nombre del vendedor.
 * @property {number} NumeroDocumento - Número del documento (ej. número de boleta o factura).
 * @property {number} NumeroProductos - Cantidad total de productos en el listado original.
 * @property {number} NumeroProductosModificado - Cantidad total de productos en el listado modificado.
 * @property {string} Oficina - Nombre de la oficina o sucursal.
 * @property {string} Pais - País del domicilio.
 * @property {boolean} PedidoAutorizado - Flag que indica si el pedido está autorizado.
 * @property {boolean} PedidoEnProceso - Flag que indica si el pedido está en proceso.
 * @property {boolean} PedidoFinalizado - Flag que indica si el pedido ha sido finalizado.
 * @property {boolean} PedidoMarcado - Flag para marcado general.
 * @property {boolean} PedidoTomado - Flag que indica si el pedido fue tomado por un operario.
 * @property {string} Region - Región del domicilio.
 * @property {string} SimboloMoneda - Símbolo de la moneda (ej. "$").
 * @property {string} TipoDePedido - Descripción del tipo de pedido.
 *
 * @property {number} TipoDePedidoID - ID numérico del tipo de pedido.
 * @property {number} TotalMonto - Monto total del pedido.
 * @property {string} URLPdf - URL para descargar el PDF del documento.
 * @property {string} URLPublicView - URL para la vista pública del pedido.
 * @property {string} estatus_pago - Estado del pago (ej. "pagado").
 * @property {EstatusProcesoInternoType} estadoInterno - El estado actual del pedido dentro del flujo de la bodega.
 * @property {string} cod_ZPL - El código ZPL para la impresión de la etiqueta de envío.
 * @property {boolean} etiquetaImpresa - Flag que indica si la etiqueta de envío ya ha sido impresa.
 */
export interface PedidosBSDocument {
  ApellidoCliente: string;
  ClienteNombreCompleto: string;
  CodigoCliente: string;
  CodigoSeguimiento: string;
  Comuna: string;
  DetallesPedido: DetallePedido[];
  Domicilio: string;
  ApellidoVendedor: string;
  DireccionOficina: string;
  EmailVendedor: string;
  EmisionDate: string;
  EstadoPedido: number;
  FechaCargado: Timestamp;
  FechaGeneradoListado: Timestamp;
  FechaOriginalPedido: Timestamp;
  FechaParaConsulta: Timestamp;
  GenerationDate: string;
  IDMoneda: number;
  IDVendedor: number;
  IDdocument: string;
  ListadoDeProductos: ProductoListadoOriginal[];
  ListadoDeProductosModificado: ProductoListadoModificado[];
  ListadoProductosConsolidado: ProductoListadoModificado[];
  Moneda: string;
  MontoImpuesto: number;
  MontoNeto: number;
  NombreCliente: string;
  NombreVendedor: string;
  NumeroDocumento: number;
  NumeroProductos: number;
  NumeroProductosModificado: number;
  Oficina: string;
  Pais: string;
  PedidoAutorizado: boolean;
  PedidoEnProceso: boolean;
  PedidoFinalizado: boolean;
  PedidoMarcado: boolean;
  PedidoTomado: boolean;
  Region: string;
  SimboloMoneda: string;
  TipoDePedido: string;
  TipoDePedidoID: number;
  TotalMonto: number;
  URLPdf: string;
  URLPublicView: string;
  estatus_pago: string;
  estadoInterno: EstatusProcesoInternoType;
  cod_ZPL: string;
  etiquetaImpresa: boolean;
}