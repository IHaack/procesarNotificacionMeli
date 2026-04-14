import { DocumentReference } from "firebase-admin/firestore";

/**
 * @fileoverview Define las interfaces para los datos maestros de productos
 * y packs que se leen desde nuestras colecciones internas en Firestore.
 */

/**
 * @interface ProductoMaestro
 * @description Define la estructura de un documento en la colección 'BaseDeDatosProductosBSale'.
 *              Representa un producto individual con sus propiedades básicas.
 * @property {string} SKU - El Stock Keeping Unit del producto, identificador único.
 * @property {string} NombreProducto - El nombre del producto.
 * @property {string} DescripcionProductos - Descripción detallada del producto.
 * @property {string} CodigoBarras - El código de barras del producto.
 * @property {number} State - El estado del producto (e.g., activo, inactivo).
 * @property {number} cantidadDeVariantesAsociadas - Número de variantes asociadas al producto.
 * @property {number} clasificacionDeProducto - ID de la clasificación del producto.
 * @property {boolean} es_pack - Campo clave para determinar si el producto debe ser desglosado.
 * @property {number} idTipoDeProducto - ID del tipo de producto.
 * @property {string} nombreClasificacionDeProducto - Nombre de la clasificación del producto.
 * @property {number} productID - ID del producto base, clave para la lógica "2X".
 * @property {number} variantID - ID de la variante del producto.
 * @property {DocumentReference} productIdReference - Referencia al documento del producto en Firestore.
 */
export interface ProductoMaestro {
  SKU: string;
  NombreProducto: string;
  DescripcionProductos: string;
  CodigoBarras: string;
  State: number;
  cantidadDeVariantesAsociadas: number;
  clasificacionDeProducto: number;
  es_pack: boolean;
  idTipoDeProducto: number;
  nombreClasificacionDeProducto: string;
  productID: number;
  variantID: number;
  productIdReference: DocumentReference;
}

/**
 * @interface ComponentePack
 * @description Define la estructura de un componente dentro de un pack.
 *              Representa un producto que forma parte de un paquete más grande.
 * @property {number} cantidadProductoEnPack - La cantidad de este producto dentro del pack.
 * @property {string} codigoDeBarrasVariante - El código de barras de la variante del producto.
 * @property {string} descripcionVariante - Descripción de la variante del producto.
 * @property {number} idVarianteProductoPack - ID de la variante del producto en el pack.
 * @property {string} nombreDeVariante - Nombre de la variante del producto.
 * @property {string} skuVariante - El SKU del producto componente, clave para el desglose.
 */
export interface ComponentePack {
  cantidadProductoEnPack: number;
  codigoDeBarrasVariante: string;
  descripcionVariante: string;
  idVarianteProductoPack: number;
  nombreDeVariante: string;
  skuVariante: string;
}

/**
 * @interface PackMaestro
 * @description Define la estructura de un documento en la colección 'BaseDeDatosPacksBSale'.
 *              Representa un pack o conjunto de productos.
 * @property {string} SKU - El Stock Keeping Unit del pack.
 * @property {string} Nombre - El nombre del pack.
 * @property {string} ImagenPack - URL de la imagen del pack.
 * @property {number} productId - ID del producto asociado al pack.
 * @property {number} variantId - ID de la variante asociada al pack.
 * @property {DocumentReference} productIdReference - Referencia al documento del producto en Firestore.
 * @property {ComponentePack[]} ListadoProductosPackDesglosado - La "receta" del pack, contiene la lista de los productos que lo componen.
 */
export interface PackMaestro {
  SKU: string;
  Nombre: string;
  ImagenPack: string;
  productId: number;
  variantId: number;
  productIdReference: DocumentReference;
  ListadoProductosPackDesglosado: ComponentePack[];
}

/**
 * @interface ContextoPedido
 * @description Define la estructura del objeto de contexto que pasaremos a través
 *              de nuestro pipeline de transformación. Contiene los datos ya cargados desde Firestore.
 * @property {Map<string, ProductoMaestro>} productosMap - Un mapa de productos donde la clave es el SKU del producto.
 * @property {Map<string, PackMaestro>} packsMap - Un mapa de packs donde la clave es el SKU del pack.
 * @property {Map<string, string>} imagenesMap - Mapa que contiene las URLs de las imágenes obtenidas desde la API de BSale.
 *                                               La clave es el SKU del producto y el valor es la URL de la imagen.
 */
export interface ContextoPedido {
  productosMap: Map<string, ProductoMaestro>;
  packsMap: Map<string, PackMaestro>;
  // TODO: Considerar la posibilidad de añadir más información al contexto,
  // como datos del cliente o del pedido, para evitar tener que pasar múltiples
  // parámetros a las funciones del pipeline.
  imagenesMap: Map<string, string>;
}