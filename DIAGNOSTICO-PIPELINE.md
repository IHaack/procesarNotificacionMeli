# 🔍 DIAGNÓSTICO COMPLETO DEL PIPELINE - procesarNotificacionMeli

**Fecha:** 24 de abril de 2026  
**Estado:** ❌ ERRORES CRÍTICOS DETECTADOS Y CORREGIDOS

---

## 📋 RESUMEN EJECUTIVO

**Problema:** Todos los pedidos están cayendo en la colección `enviosConInconsistencias` y NO se están guardando en `Orders`, `OrderItems`, `Shipments` ni `PedidosBS`.

**Causa Raíz Identificada:** 
1. ✅ **BUG CRÍTICO CORREGIDO:** Uso de `undefined` en lugar de `null` en `billing_info` (Firestore no acepta `undefined`)
2. ⚠️ **FILTRO BLOQUEANDO PEDIDOS:** Pedidos tipo "fulfillment" (Full) están siendo rechazados silenciosamente

---

## 🐛 BUG #1: Error en Transacción de Firestore

### Síntoma
```
Error: [Trace: ...] [Orquestador] Error fatal en el pipeline.
```

El error ocurría después de mapear los items pero antes de completar la transacción.

### Causa
En `db.adapter.ts`, línea 49:
```typescript
billing_info: meliBillingInfo ? {
  doc_type: meliBillingInfo.doc_type,
  doc_number: meliBillingInfo.doc_number,
} : undefined,  // ❌ FIRESTORE NO ACEPTA undefined
```

**Firestore rechaza cualquier campo con valor `undefined`**, causando que la transacción falle.

### Solución Aplicada ✅
```typescript
billing_info: meliBillingInfo ? {
  doc_type: meliBillingInfo.doc_type,
  doc_number: meliBillingInfo.doc_number,
} : null,  // ✅ CORRECTO
```

**Archivos modificados:**
- ✅ `src/adapters/db.adapter.ts` - Cambiado `undefined` a `null`
- ✅ `src/interfaces/db.interfaces.ts` - Actualizado tipo para aceptar `null`

---

## ⚠️ BUG #2: Filtro Bloqueando Pedidos "Full"

### Síntoma (de logs anteriores)
```
Actualización de envío omitida. El tipo logístico 'fulfillment' (traducido como 'Full') no está permitido.
```

### Causa
Los pedidos que llegan son tipo **"fulfillment" (Mercado Envíos Full)** pero la configuración actual solo permite:
```typescript
ALLOWED_LOGISTIC_TYPES: ["Flex", "Colecta"]  // ❌ Falta "Full"
```

### Solución Propuesta (PENDIENTE DE DECISIÓN)
Agregar "Full" a la lista de tipos permitidos en `src/config/config.ts`:
```typescript
ALLOWED_LOGISTIC_TYPES: ["Flex", "Colecta", "Full"]
```

**ACCIÓN REQUERIDA:** Confirmar si quieren procesar pedidos tipo "Full" o mantener el filtro.

---

## 🔧 MEJORAS IMPLEMENTADAS

### 1. Logging Diagnóstico Mejorado
Se agregó logging detallado en cada paso del pipeline:

```
📡 PASO 1: Obteniendo detalles de la orden...
✅ Orden obtenida. ID: XXX, Status: paid

📡 PASO 2: Obteniendo shipment...
✅ Shipment obtenido. Logistic Type: fulfillment

📡 PASO 3: Obteniendo billing info (opcional)...
✅ Billing info obtenida.

🔄 PASO 4a: Mapeando Order...
✅ Order mapeada. ID: XXX

🔄 PASO 4b: Mapeando OrderItems...
✅ OrderItems mapeados. Cantidad: 2

🔄 PASO 4c: Mapeando Shipment...
✅ Shipment mapeado. ID: XXX

💾 PASO 5: Preparando transacción...
💾 Transacción iniciada...
✅ FASE 4 (Execute): Transacción completada exitosamente!
```

### 2. Error Logging Mejorado
Ahora los errores muestran mensaje completo, stack trace y payload en logs separados (más visibles).

### 3. Script de Consulta de Billing Info
Creado `src/scripts/consultar-billing-info.ts` para diagnosticar problemas con billing info.

---

## 📊 FLUJO DEL PIPELINE (Completo)

### FASE 1: Validate
- ✅ Verificar que el webhook tenga `resource` y `topic`

### FASE 2: Confirm & Prepare  
- ✅ Verificar idempotencia (evitar duplicados)
- ✅ Marcar notificación como "processing"

### FASE 3: Calculate
- **PASO 1:** Obtener detalles de la orden desde API MELI (`/orders/{id}`)
- **PASO 2:** Obtener detalles del shipment (`/shipments/{id}`)
- **PASO 3:** Obtener billing info (opcional) (`/orders/billing-info/{siteId}/{billingInfoId}`)
- ⚠️ **FILTRO:** Verificar tipo logístico (Flex, Colecta, ~~Full~~)

### FASE 4: Execute
- **PASO 4a:** Mapear Order a formato DB
- **PASO 4b:** Mapear OrderItems a formato DB
- **PASO 4c:** Mapear Shipment a formato DB
- **PASO 5:** Guardar todo en una transacción atómica de Firestore:
  - → Colección `Orders`
  - → Colección `OrderItems`
  - → Colección `Shipments`

### FASE 5: Save & Persist
- ✅ Marcar notificación como "processed"

### FASE 6: Notify (solo para shipments)
- Si es shipment en estado `ready_to_ship` → Disparar consolidación
- Buscar todas las orders del pack
- Generar documento consolidado
- Guardar en `PedidosBS`

---

## 🚀 PASOS PARA DESPLEGAR LA CORRECCIÓN

### 1. Compilar el Proyecto
```powershell
npm run build
```

Verificar que compile sin errores.

### 2. Desplegar a Firebase
```powershell
firebase deploy --only functions
```

**Tiempo estimado:** 3-5 minutos

### 3. Verificar el Despliegue
Ir a Firebase Console → Functions y verificar que la función esté desplegada.

### 4. Testear con un Pedido Real
Crear un webhook de prueba o esperar un pedido nuevo.

### 5. Revisar Logs Detallados
Buscar en Firebase Console → Logs:
- ✅ Buscar: `"✅ FASE 4 (Execute): Transacción completada exitosamente!"`
- ❌ Buscar: `"❌ ERROR FATAL EN EL PIPELINE ❌"`

---

## 🔍 CÓMO DIAGNOSTICAR ERRORES DESPUÉS DEL DESPLIEGUE

### Si sigue fallando, buscar estos logs:

**1. Identificar en qué PASO falla:**
```
📡 PASO 1: Obteniendo detalles de la orden...    ← ¿Llegó hasta aquí?
📡 PASO 2: Obteniendo shipment...                ← ¿Y aquí?
🔄 PASO 4a: Mapeando Order...                    ← ¿Y aquí?
💾 PASO 5: Preparando transacción...             ← ¿Y aquí?
```

**2. Ver el error completo:**
```
❌ ERROR FATAL EN EL PIPELINE ❌
Mensaje: [aquí estará el mensaje real del error]
Stack: [aquí el stack trace completo]
```

**3. Verificar si es el filtro:**
```
Orden omitida. El tipo logístico 'fulfillment' (traducido como 'Full') no está en la lista de permitidos.
```

---

## ✅ CHECKLIST DE VERIFICACIÓN POST-DESPLIEGUE

- [ ] Compilar código sin errores
- [ ] Desplegar a Firebase
- [ ] Ver un pedido procesarse exitosamente
- [ ] Verificar documento en colección `Orders`
- [ ] Verificar documentos en colección `OrderItems`
- [ ] Verificar documento en colección `Shipments`
- [ ] Cuando llegue el shipment, verificar consolidación
- [ ] Verificar documento final en colección `PedidosBS`
- [ ] Confirmar que NO hay documentos nuevos en `enviosConInconsistencias`

---

## 🎯 DECISIÓN PENDIENTE

### ¿Permitir pedidos tipo "Full"?

**Opción A: SÍ** (recomendado si quieren todos los pedidos)
```typescript
ALLOWED_LOGISTIC_TYPES: ["Flex", "Colecta", "Full"]
```

**Opción B: NO** (mantener filtro actual)
```typescript
ALLOWED_LOGISTIC_TYPES: ["Flex", "Colecta"]  // Solo estos
```

---

## 📞 CONTACTO PARA SOPORTE

Si después del despliegue siguen habiendo errores:
1. Copiar el trace ID del error
2. Buscar ese trace ID en los logs
3. Copiar todos los logs de ese trace ID
4. Enviar para análisis

**Logs clave a buscar:**
- `[Orquestador]` - Punto de entrada
- `[processOrderTopic]` - Procesamiento de órdenes
- `❌ ERROR FATAL` - Errores críticos
- `✅ Transacción completada` - Éxito

---

## 📝 HISTORIAL DE CAMBIOS

### 2026-04-24
- ✅ Corregido bug de `undefined` en billing_info
- ✅ Agregado logging diagnóstico detallado
- ✅ Mejorado error logging
- ✅ Creado script de consulta de billing info
- ⚠️ Identificado filtro bloqueando pedidos "Full"
