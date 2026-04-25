# Plan de implementación: fallback `orders/search` cuando falta `external_reference`

## Objetivo

Cuando un `shipment` no traiga `external_reference` (pack_id), resolver `pack_id` y `order_id` usando:

`/orders/search?seller={SELLER_ID}&shipping.id={SHIPPING_ID}`

y continuar el flujo normal desde el paso de procesamiento de órdenes (paso 4 en adelante).

## Contexto actual

- `reviewQueue` está mapeado a la colección `enviosConInconsistencias`.
- Flujo principal:
  1. `processShipmentTopic` extrae `shipmentId`.
  2. `procesarShipmentCompleto` obtiene shipment, pack, orders, procesa orders.
  3. Si estado de shipment es procesable, ejecuta consolidación.
- Actualmente, el fallback cuando falta `external_reference` intenta `order_id` desde shipment.

## Cambio funcional requerido

1. Si `shipment.external_reference` existe:
   - Mantener comportamiento actual.
2. Si `shipment.external_reference` no existe:
   - Consultar `orders/search` por `seller + shipping.id`.
   - Extraer `order_id` desde `results[*].payments[*].order_id`.
   - Extraer `pack_id` desde `results[*].pack_id`.
   - Continuar el flujo normal usando esos datos.

## Diseño técnico propuesto

### 1) Servicios MELI

#### Tarea 1.1: crear servicio `searchOrdersByShipment`
- Ubicación: `src/services/meli.services.ts`
- Firma:
  - `searchOrdersByShipment(sellerId: number, shipmentId: number, traceId: string)`
- Endpoint:
  - `/orders/search?seller={sellerId}&shipping.id={shipmentId}`

#### Tarea 1.2: tipado de respuesta
- Interfaces agregadas/ajustadas:
  - `MeliOrderSearchPayload`
  - `MeliOrderSearchResult`
  - `MeliShipmentPayload.source`

### 2) Resolver pack + orders de forma unificada

#### Tarea 2.1: helper de resolución
- Ubicación: `src/index.ts`
- Función:
  - `resolvePackAndOrderIds(shipmentId, meliShipment, traceId)`

#### Tarea 2.2: lógica de resolución
- Camino A (`external_reference`):
  - usar `packId = external_reference`
  - obtener orders desde `fetchPackDetails(packId)`
- Camino B (`orders/search`):
  - consultar `searchOrdersByShipment`
  - `orderIds` desde `results[*].payments[*].order_id`
  - fallback a `results[*].id` si falta `payments.order_id`
  - deduplicar order IDs
  - validar consistencia de `pack_id` (solo uno)

#### Tarea 2.3: validaciones duras
- Si `results` viene vacío -> error controlado.
- Si no hay `orderIds` -> error controlado.
- Si hay más de un `pack_id` -> error controlado.

### 3) Ajustes en `procesarShipmentCompleto`

#### Tarea 3.1: reemplazar fallback actual
- Se elimina dependencia de `shipment.order_id` cuando falta `external_reference`.
- Se usa `resolvePackAndOrderIds(...)`.

#### Tarea 3.2: continuar desde paso 4
- Con `packId` y `orderIds` resueltos:
  - ejecutar `processIndividualOrder(...)` por cada order.
  - mantener actualización de shipment.
  - mantener evaluación de estado procesable.
  - mantener disparo de consolidación.

### 4) Escritura consistente en `enviosConInconsistencias`

#### Tarea 4.1: errores de resolución pack/orders
- Si falla la resolución en paso 2:
  - escribir en `reviewQueue` (`enviosConInconsistencias`) con:
    - `id`, `shipmentId`, `meli_pack_id=""`
    - `mensaje` descriptivo
    - `estado_de_carga="sin carga"`
    - `ordenesEsperadas=[]`, `ordenesEncontradas=[]`
    - `payload_meli_pack` del shipment
    - `ultimoError`, `ultimoIntento`

#### Tarea 4.2: contrato de estructura
- Mantener compatibilidad con estructura usada por negocio:
  - `consolidado_automaticamente`, `pedido_creado_en`, `trigger_desde`, `ultimoError`, etc.

### 5) Logging y observabilidad

- Loggear fuente de resolución:
  - `external_reference`
  - `orders/search`
- Loggear:
  - total de `results`
  - `pack_id` resuelto
  - `orderIds` finales deduplicados
  - motivo detallado en caso de fallback fallido

## Estado de avance

- [x] Agregado `searchOrdersByShipment` en servicios MELI.
- [x] Agregados tipos `MeliOrderSearch*` y metadata `source` en shipment.
- [x] Implementado helper `resolvePackAndOrderIds`.
- [x] Integrado `procesarShipmentCompleto` para continuar desde paso 4 usando `orderIds`.
- [x] Creado manejo de error a `enviosConInconsistencias` cuando falla la resolución.
- [ ] Ajustar paginación en `orders/search` (si `paging.total > limit`).
- [ ] Pruebas end-to-end de casos borde.

## Casos de prueba sugeridos

1. Shipment con `external_reference` (flujo actual intacto).
2. Shipment sin `external_reference` y `orders/search` con una orden.
3. Shipment sin `external_reference` y `orders/search` con múltiples órdenes.
4. `orders/search` sin resultados.
5. `orders/search` con múltiples `pack_id`.
6. `payments` sin `order_id` pero con `results.id`.

## Riesgos y mitigaciones

- Riesgo: `source.sender_id` ausente en payload de shipment.
  - Mitigación: fail controlado + registro en `enviosConInconsistencias`.
- Riesgo: respuestas parciales en `orders/search`.
  - Mitigación: dedupe + fallback a `results.id` + validaciones de consistencia.
- Riesgo: múltiples packs para mismo shipment.
  - Mitigación: no continuar y registrar inconsistencia.
