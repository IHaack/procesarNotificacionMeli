# 🔴 DIAGNÓSTICO CRÍTICO - Análisis de Impacto de Cambios

**Fecha:** 24 de abril de 2026
**Rama:** `feature/meli-pack-id-improvements`
**Commit:** `c584997`

---

## 📋 RESUMEN EJECUTIVO

### ⚠️ NIVEL DE RIESGO: **ALTO**

**Se han identificado 3 problemas críticos que DEBEN resolverse antes del deploy:**

1. ❌ **BUG CRÍTICO** en `procesarConsolidacionDeEnvio()` - No encuentra el pack_id correctamente
2. ⚠️ **RIESGO DE INCONSISTENCIA** - Posible race condition en consolidación
3. ⚠️ **FUNCIONALIDAD DEGRADADA** - Reprocesador puede fallar en algunos casos

---

## 🔍 ANÁLISIS DETALLADO

### 1. ❌ BUG CRÍTICO: `procesarConsolidacionDeEnvio()` busca `pack_id` en el lugar incorrecto

**Ubicación:** `src/index.ts` línea ~146

**Código actual:**
```typescript
const possiblePack = (shipmentDetails as any).pack_id || 
                     (shipmentDetails as any).packId || 
                     (shipmentDetails as any).pack;
```

**Problema:**
- Según la nueva arquitectura, el `pack_id` ahora está en `shipmentDetails.external_reference`
- La búsqueda actual NO encontrará el pack_id
- Esto causará que las inconsistencias se registren SIN el pack_id, haciendo imposible su resolución

**Impacto:**
- ✅ **NO afecta** el flujo normal (processShipmentTopic ya tiene el pack_id)
- ❌ **SÍ afecta** el reprocesador cuando intenta registrar inconsistencias
- ❌ **SÍ afecta** casos edge donde `procesarConsolidacionDeEnvio()` se llama directamente

**Solución requerida:**
```typescript
const possiblePack = shipmentDetails.external_reference || 
                     (shipmentDetails as any).pack_id || 
                     (shipmentDetails as any).packId;
```

---

### 2. ⚠️ RIESGO DE INCONSISTENCIA: Posible race condition

**Escenario:**
Si un shipment llega con estado `ready_to_ship` desde el principio:

**Flujo actual:**
```
processShipmentTopic()
  → Obtiene pack_id
  → Procesa orden 1 (async)
  → Procesa orden 2 (async)
  → Procesa orden 3 (async)
  → Actualiza shipment
  → Estado es ready_to_ship ✓
  → Llama a procesarConsolidacionDeEnvio()
    → Busca órdenes en DB...
```

**Pregunta crítica:** ¿Las transacciones de guardar órdenes han completado?

**Análisis del código:**
```typescript
for (const order of packDetails.orders) {
  // Este loop es SECUENCIAL (no paralelo)
  await processIndividualOrder(...);  // ← AWAIT aquí garantiza secuencialidad
}
```

✅ **ANÁLISIS:** El loop es secuencial, cada orden se procesa y guarda ANTES de procesar la siguiente.
✅ **CONCLUSIÓN:** NO hay race condition porque se usa `await` en el loop.

**Sin embargo...**

⚠️ **RIESGO RESIDUAL:** Si una orden falla a medio procesar, podría quedar inconsistencia.

**Código actual:**
```typescript
} catch (error) {
  // Se registra el error pero se continúa con las demás órdenes
  orderProcessingResults.push({ orderId, success: false, error: err.message });
}

// Más adelante...
if (successCount > 0) {
  await procesarConsolidacionDeEnvio(shipmentId, traceId);
}
```

⚠️ **PROBLEMA:** Si 2 de 3 órdenes se procesaron exitosamente, se dispara la consolidación.
- `procesarConsolidacionDeEnvio()` verifica consistencia comparando con MELI
- Detectará que falta 1 orden
- Registrará en `reviewQueue` con `estado_de_carga: "sin carga"`
- ✅ **ESTO ES CORRECTO** - El reprocesador lo manejará

**Conclusión:** ✅ El flujo es resiliente, pero genera más registros en reviewQueue

---

### 3. ⚠️ FUNCIONALIDAD DEGRADADA: Reprocesador en escenarios edge

**Función afectada:** `reprocesarEnviosInconsistentes()`

**Flujo del reprocesador:**
```typescript
const snapshot = await db
  .collection(firestoreCollections.reviewQueue)
  .where("estado_de_carga", "!=", "cargado")
  .get();

for (const doc of snapshot.docs) {
  await procesarConsolidacionDeEnvio(shipmentId, subTraceId);
  // Verifica si se creó el pedido final...
}
```

**Escenario problemático:**
1. Reprocesador encuentra un shipment en `reviewQueue`
2. Llama a `procesarConsolidacionDeEnvio(shipmentId, ...)`
3. `procesarConsolidacionDeEnvio()` busca órdenes con `meli_shipment_id == shipmentId`
4. **¿Las órdenes tienen el `meli_shipment_id` correcto?**

**Verificación en `processIndividualOrder()`:**
```typescript
const dbOrder = mapToDbOrder(meliOrder, meliBillingInfo, traceId);
```

**Verificación en `mapToDbOrder()`:**
```typescript
meli_shipment_id: meliOrder.shipping?.id
  ? meliOrder.shipping.id.toString()
  : null,
```

✅ **CONFIRMADO:** Las órdenes SÍ tienen `meli_shipment_id` correcto del payload de MELI.

**Pero...**

❌ **PROBLEMA:** Si `procesarConsolidacionDeEnvio()` NO encuentra órdenes:
- Intenta obtener pack_id del shipment
- **USA EL CÓDIGO BUGUEADO** (busca pack_id en lugar de external_reference)
- No encontrará el pack_id
- Registrará inconsistencia SIN pack_id
- El reprocesador no podrá resolver la inconsistencia nunca

---

## 📊 MATRIZ DE IMPACTO POR FUNCIÓN

| Función Cloud | ¿Se afecta? | Nivel | Descripción |
|--------------|-------------|-------|-------------|
| `procesarNotificacionMeli` (trigger orders_v2) | ✅ No | - | Desactivado intencionalmente |
| `procesarNotificacionMeli` (trigger shipments) | ⚠️ Sí | Medio | Funciona pero puede crear más registros en reviewQueue |
| `processShipmentTopic()` | ⚠️ Sí | Medio | Procesa órdenes correctamente pero consolidación puede fallar parcialmente |
| `procesarConsolidacionDeEnvio()` | ❌ Sí | **CRÍTICO** | BUG al buscar pack_id - debe corregirse |
| `reprocesarEnviosInconsistentes()` | ❌ Sí | **CRÍTICO** | Fallará en casos donde no hay órdenes y no puede obtener pack_id |
| `processIndividualOrder()` | ✅ No | - | Nueva función, funciona correctamente |

---

## 🔧 COLECCIONES DE FIRESTORE - ANÁLISIS DE CAMBIOS

### Colecciones que SE AFECTAN:

| Colección | Cambio | Impacto |
|-----------|--------|---------|
| `Orders` | ✅ Se escribe igual que antes | Sin cambio |
| `OrderItems` | ✅ Se escribe igual que antes | Sin cambio |
| `Shipments` | ✅ Se escribe igual que antes | Sin cambio |
| `enviosConInconsistencias` (reviewQueue) | ⚠️ **CAMBIO** | Puede tener pack_id vacío por el bug |
| `PedidosBS` (processedOrders) | ✅ Se escribe igual que antes | Sin cambio |
| `webhookRecibidosMercadoLibre` | ✅ Sin cambios | Las notificaciones de orders_v2 se marcan como procesadas pero no hacen nada |

### Estructura de datos en `reviewQueue`:

**ANTES del cambio:**
```json
{
  "meli_pack_id": "2000008666874177",  // ← Obtenido de shipment.pack_id
  "estado_de_carga": "sin carga",
  "ordenesEsperadas": [...],
  "ordenesEncontradas": [...]
}
```

**DESPUÉS del cambio (CON EL BUG):**
```json
{
  "meli_pack_id": "",  // ← VACÍO porque busca en pack_id en lugar de external_reference
  "estado_de_carga": "sin carga",
  "ordenesEsperadas": [],  // ← VACÍO porque no puede consultar el pack
  "ordenesEncontradas": [...]
}
```

❌ **ESTO ES CRÍTICO** - Sin pack_id, el reprocesador no puede resolver inconsistencias.

---

## 🎯 ESCENARIOS DE USO Y SU COMPORTAMIENTO

### Escenario 1: Shipment nuevo con 3 órdenes, estado `ready_to_ship`

**Flujo:**
1. ✅ Webhook shipment → `processShipmentTopic()`
2. ✅ Obtiene `external_reference` (pack_id: `2000008666874177`)
3. ✅ Consulta pack → obtiene 3 order IDs
4. ✅ Procesa orden 1 → guarda en Orders/OrderItems/Shipments
5. ✅ Procesa orden 2 → guarda en Orders/OrderItems/Shipments
6. ✅ Procesa orden 3 → guarda en Orders/OrderItems/Shipments
7. ✅ Estado es `ready_to_ship` → llama a `procesarConsolidacionDeEnvio()`
8. ✅ Encuentra 3 órdenes en DB con `meli_shipment_id == shipmentId`
9. ✅ Consulta pack para verificar consistencia → 3 esperadas, 3 encontradas ✓
10. ✅ Consolida → guarda en `PedidosBS`

**Resultado:** ✅ **ÉXITO TOTAL**

---

### Escenario 2: Shipment nuevo, 1 orden falla al procesarse

**Flujo:**
1. ✅ Webhook shipment → `processShipmentTopic()`
2. ✅ Obtiene pack_id, consulta pack → 3 órdenes
3. ✅ Procesa orden 1 → ✅ Éxito
4. ❌ Procesa orden 2 → ❌ Error 403 (sin permisos)
5. ✅ Procesa orden 3 → ✅ Éxito
6. ⚠️ Resumen: 2/3 exitosas, 1/3 fallida
7. ✅ Estado es `ready_to_ship` → llama a `procesarConsolidacionDeEnvio()`
8. ⚠️ Encuentra 2 órdenes en DB (falta 1)
9. ✅ Consulta pack → 3 esperadas, 2 encontradas → **INCONSISTENCIA**
10. ⚠️ Registra en `reviewQueue` con `estado_de_carga: "sin carga"`
11. ⏸️ NO consolida (falta orden)

**Resultado:** ⚠️ **PARCIAL** - Queda en reviewQueue para reprocesamiento

---

### Escenario 3: Reprocesador intenta consolidar un shipment

**Flujo:**
1. ✅ Scheduler activa `reprocesarEnviosInconsistentes()`
2. ✅ Encuentra shipment en `reviewQueue` con `estado_de_carga != "cargado"`
3. ✅ Llama a `procesarConsolidacionDeEnvio(shipmentId)`
4. **BIFURCACIÓN:**

   **Caso A: Órdenes YA están en DB**
   - ✅ Encuentra órdenes con `meli_shipment_id`
   - ✅ Verifica consistencia con pack
   - ✅ Consolida → guarda en `PedidosBS`
   - ✅ Marca como `estado_de_carga: "cargado"`
   
   **Caso B: Órdenes NO están en DB**
   - ⚠️ No encuentra órdenes
   - ❌ Intenta obtener pack_id del shipment
   - ❌ **USA CÓDIGO BUGUEADO** → busca `pack_id` en lugar de `external_reference`
   - ❌ No encuentra pack_id → queda vacío
   - ❌ No puede consultar pack → no sabe qué órdenes esperar
   - ❌ Registra inconsistencia SIN información útil
   - ❌ El reprocesador no puede resolver esto nunca

**Resultado Caso A:** ✅ **ÉXITO**
**Resultado Caso B:** ❌ **FALLA PERMANENTE**

---

## 🚨 PROBLEMAS CRÍTICOS IDENTIFICADOS

### Problema #1: Bug en búsqueda de pack_id

**Severidad:** 🔴 **CRÍTICA**

**Ubicación:** `src/index.ts` línea ~146

**Código problemático:**
```typescript
const possiblePack = (shipmentDetails as any).pack_id || 
                     (shipmentDetails as any).packId || 
                     (shipmentDetails as any).pack;
```

**Debe ser:**
```typescript
const possiblePack = shipmentDetails.external_reference || 
                     (shipmentDetails as any).pack_id || 
                     (shipmentDetails as any).packId;
```

**Razón:** Según la nueva arquitectura y la interfaz `MeliShipmentPayload`, el pack_id está en `external_reference`.

---

### Problema #2: Lógica incompleta en `processShipmentTopic()`

**Severidad:** ⚠️ **MEDIA**

**Ubicación:** `src/index.ts` línea ~834

**Problema:**
Si el shipment NO tiene `external_reference`, el flujo se detiene:
```typescript
if (!packId) {
  logger.warn(`${logPrefix} El shipment NO tiene external_reference...`);
  return;  // ← Se detiene aquí, no procesa nada
}
```

**Pregunta:** ¿Qué pasa con órdenes individuales que no tienen pack?

**Análisis:**
- En MELI, órdenes individuales pueden tener su propio shipment
- El shipment puede NO tener `external_reference` (no es parte de un pack)
- **El código actual las ignora completamente**

**¿Es esto correcto?**
- Depende del negocio
- Si solo se procesan packs → ✅ Correcto
- Si se deben procesar órdenes individuales → ❌ Incorrecto

**Recomendación:** Aclarar con el negocio si se deben procesar shipments sin pack.

---

### Problema #3: Notificaciones de orders_v2 no se procesan

**Severidad:** ℹ️ **INFORMATIVO**

**Impacto:**
- Las notificaciones de `orders_v2` se marcan como "processed"
- Pero no se ejecuta ninguna lógica
- Esto está bien SOLO si confiamos 100% en que el shipment siempre llegará

**Riesgo:**
- Si por alguna razón el webhook de shipment falla o no llega
- La orden nunca se procesará
- No hay fallback

**Recomendación:** Considerar mantener un trigger de fallback o monitoreo.

---

## ✅ SOLUCIONES REQUERIDAS

### Solución #1: Corregir búsqueda de pack_id (CRÍTICO)

**Archivo:** `src/index.ts`
**Línea:** ~146

**Cambio:**
```typescript
// ANTES
const possiblePack = (shipmentDetails as any).pack_id || 
                     (shipmentDetails as any).packId || 
                     (shipmentDetails as any).pack;

// DESPUÉS
const possiblePack = shipmentDetails.external_reference || 
                     (shipmentDetails as any).pack_id || 
                     (shipmentDetails as any).packId;
```

**Justificación:** Alinear con la nueva arquitectura donde pack_id está en `external_reference`.

---

### Solución #2: Manejar shipments sin pack (RECOMENDADO)

**Archivo:** `src/index.ts`
**Función:** `processShipmentTopic()`

**Opción A: Si NO se deben procesar (solo packs):**
```typescript
if (!packId) {
  logger.info(`${logPrefix} Shipment sin pack_id. Solo procesamos packs. Finalizando.`);
  return;
}
```

**Opción B: Si SÍ se deben procesar (órdenes individuales):**
```typescript
if (!packId) {
  logger.warn(`${logPrefix} Shipment sin pack_id. Buscando order_id individual...`);
  const orderId = (meliShipment as any).order_id;
  
  if (orderId) {
    // Procesar como orden individual
    await processIndividualOrder(orderId, Number(shipmentId), null, traceId);
    // Continuar con consolidación...
  } else {
    logger.error(`${logPrefix} Shipment sin pack_id ni order_id. No se puede procesar.`);
    return;
  }
}
```

---

### Solución #3: Agregar monitoreo de notificaciones ignoradas (OPCIONAL)

**Crear nueva colección:**
```typescript
firestoreCollections: {
  // ... existentes
  ignoredNotifications: "notificacionesIgnoradas"  // Nueva
}
```

**En el orquestador:**
```typescript
case "orders_v2":
case "orders":
  // Registrar que se ignoró esta notificación
  await db.collection(firestoreCollections.ignoredNotifications).add({
    notification_id: notificationId,
    resource: notification.resource,
    topic: notification.topic,
    reason: "Desactivado - se procesa desde shipments",
    timestamp: Timestamp.now()
  });
  break;
```

**Beneficio:** Permite auditar si hay órdenes que nunca se procesaron.

---

## 📈 RECOMENDACIONES PARA DEPLOY

### ✅ Antes de desplegar:

1. **CRÍTICO:** Aplicar Solución #1 (corregir búsqueda de pack_id)
2. **IMPORTANTE:** Decidir sobre Solución #2 (¿procesar órdenes sin pack?)
3. **RECOMENDADO:** Implementar Solución #3 (monitoreo de notificaciones)

### ✅ Después de desplegar:

1. Monitorear colección `enviosConInconsistencias`:
   - Verificar que `meli_pack_id` NO esté vacío
   - Verificar que `ordenesEsperadas` tenga datos

2. Ejecutar `reprocesarEnviosInconsistentes` manualmente:
   - Verificar que puede resolver inconsistencias antiguas

3. Monitorear métricas:
   - Tasa de éxito en consolidaciones
   - Cantidad de registros en `reviewQueue`
   - Órdenes fallidas en `pedidosConError`

---

## 🎯 CONCLUSIÓN

### Estado actual:
❌ **NO LISTO PARA PRODUCCIÓN**

### Razones:
1. Bug crítico en `procesarConsolidacionDeEnvio()` que afecta el reprocesador
2. Falta claridad sobre manejo de órdenes individuales sin pack
3. Sin mecanismo de fallback si webhook de shipment falla

### Acciones requeridas:
1. ✅ Aplicar Solución #1 (OBLIGATORIO)
2. ⚠️ Decidir sobre Solución #2 (IMPORTANTE)
3. ℹ️ Considerar Solución #3 (OPCIONAL pero recomendado)

### Tiempo estimado para corrección:
- **30 minutos** - Aplicar correcciones críticas
- **1 hora** - Testing completo
- **2 horas** - Deploy y monitoreo inicial

---

**Analista:** GitHub Copilot
**Severidad general:** 🔴 **ALTA**
**Recomendación:** **NO DESPLEGAR** hasta aplicar correcciones
