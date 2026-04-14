# 📋 Scripts de Validación y Recuperación

Este directorio contiene scripts para validar, probar y recuperar el sistema de procesamiento de pedidos MELI.

---

## 🔍 Scripts Disponibles

### 1. **validar-reprocesamiento.ts** - Validación Post-Deploy
Valida la consistencia entre `enviosConInconsistencias` y `PedidosBS` después de desplegar cambios.

**Qué hace:**
- ✅ Verifica que todos los documentos "cargado" tengan su pedido en PedidosBS
- ✅ Validación inversa: verifica que los PedidosBS tengan su registro en enviosConInconsistencias
- ✅ Genera reporte detallado de inconsistencias
- ✅ Guarda reporte en Firestore (`reportes_validacion` collection)
- ✅ Exit code 0 si todo OK, 1 si hay problemas

**Uso:**
```bash
cd functions
npx ts-node scripts/validar-reprocesamiento.ts
```

**Cuándo ejecutar:**
- Después de desplegar cambios al sistema
- Mensualmente como auditoría de calidad
- Cuando se sospeche de inconsistencias en producción

**Output esperado:**
```
╔════════════════════════════════════════════════════════════════╗
║           VALIDACIÓN DE SISTEMA DE REPROCESAMIENTO            ║
╚════════════════════════════════════════════════════════════════╝

📊 Validando documentos "cargado" (Forward)...
   ✅ Documento SHIP_123: OK
   ✅ Documento SHIP_456: OK
   
📊 Validando PedidosBS (Inverso)...
   ✅ Pedido SHIP_123: OK
   
✅✅✅ VALIDACIÓN EXITOSA - No se encontraron inconsistencias
```

---

### 2. **recuperar-pedidos-huerfanos.ts** - Recuperación de Pedidos
Encuentra y recupera pedidos marcados como "cargado" que no existen en PedidosBS.

**Qué hace:**
- 🔍 Busca documentos "cargado" sin pedido en PedidosBS
- 🔄 Los marca como "sin carga" para reprocesamiento
- 📝 Registra log de auditoría en cada documento
- 💾 Genera reporte detallado
- 🛡️ Modo dry-run por defecto (no hace cambios)

**Uso:**
```bash
# Modo dry-run (solo reporta, no hace cambios)
npx ts-node scripts/recuperar-pedidos-huerfanos.ts

# Modo REAL (hace cambios en DB)
npx ts-node scripts/recuperar-pedidos-huerfanos.ts --real
```

**Cuándo ejecutar:**
- Cuando se detecten pedidos huérfanos en validación
- Después de incidentes en producción
- Como parte de recuperación después de bugs

**Output esperado (dry-run):**
```
╔════════════════════════════════════════════════════════════════╗
║      RECUPERACIÓN DE PEDIDOS HUÉRFANOS - MODO DRY-RUN         ║
╚════════════════════════════════════════════════════════════════╝

🔍 Escaneando enviosConInconsistencias...
   Documentos "cargado" encontrados: 247

🔍 Verificando existencia en PedidosBS...
   ❌ HUÉRFANO: 45848383497
   ✅ OK: 45848383498
   
📊 RESUMEN:
   Total "cargado": 247
   Pedidos OK: 246
   Pedidos huérfanos: 1

🛡️ MODO DRY-RUN: No se realizaron cambios
💡 Ejecutar con --real para aplicar cambios
```

---

### 3. **simular-casos-prueba.ts** - Simulación de Escenarios
Simula diferentes escenarios de procesamiento para probar el sistema en ambiente controlado.

**Casos de prueba:**
1. **CASO 1: Timing Issue** - Shipment llega antes que order
2. **CASO 2: Flujo Normal** - Order llega antes que shipment
3. **CASO 3: Pack Incompleto** - Orders llegan en diferentes momentos

**Uso:**
```bash
# Simular caso específico
npx ts-node scripts/simular-casos-prueba.ts --caso=timing
npx ts-node scripts/simular-casos-prueba.ts --caso=normal
npx ts-node scripts/simular-casos-prueba.ts --caso=pack-incompleto

# Ejecutar todos los casos
npx ts-node scripts/simular-casos-prueba.ts --caso=todos
```

**Cuándo ejecutar:**
- Antes de desplegar cambios importantes
- Para verificar que los fixes funcionan correctamente
- En ambiente de staging/desarrollo

**Output esperado:**
```
╔════════════════════════════════════════════════════════════════╗
║              SIMULACIÓN DE CASOS DE PRUEBA                     ║
╚════════════════════════════════════════════════════════════════╝

🧪 CASO 1: TIMING ISSUE - Shipment llega ANTES que la order
================================================================

📦 PASO 1: Insertando shipment en DB...
   ✅ Shipment SHIP_TEST_123 creado

⚙️  PASO 2: Simulando procesamiento del shipment (sin orders disponibles)...
⏳ Esperando 2 segundos...

📊 Estado del shipment SHIP_TEST_123:
   En enviosConInconsistencias: ✅ (esperado: ✅)
   Estado de carga: sin carga (esperado: sin carga)
   En PedidosBS: ❌ (esperado: ❌)
   Resultado: ✅ CORRECTO

📋 PASO 3: Insertando order (llegada tardía)...
   ✅ Order ORDER_TEST_456 creada

⚙️  PASO 4: Esperando trigger automático (TAREA 2)...
⏳ Esperando 3 segundos...

📊 Estado del shipment SHIP_TEST_123:
   En enviosConInconsistencias: ✅ (esperado: ✅)
   Estado de carga: cargado (esperado: cargado)
   En PedidosBS: ✅ (esperado: ✅)
   Resultado: ✅ CORRECTO

✅✅✅ CASO 1 EXITOSO: El sistema manejó correctamente el timing issue

🧹 Limpiando datos de prueba...
   ✅ Datos de prueba eliminados
```

---

## 🔄 Workflow Recomendado

### 1. **Pre-Deploy (Desarrollo/Staging)**
```bash
# Ejecutar suite de tests unitarios
npm test -- reprocesamiento.test.ts

# Simular todos los casos
npx ts-node scripts/simular-casos-prueba.ts --caso=todos

# Si todos pasan → OK para deploy
```

### 2. **Post-Deploy (Producción)**
```bash
# Validar consistencia del sistema
npx ts-node scripts/validar-reprocesamiento.ts

# Si encuentra inconsistencias → Ejecutar recuperación
npx ts-node scripts/recuperar-pedidos-huerfanos.ts --real

# Volver a validar
npx ts-node scripts/validar-reprocesamiento.ts
```

### 3. **Mantenimiento Mensual**
```bash
# Auditoría de calidad
npx ts-node scripts/validar-reprocesamiento.ts

# Revisar reportes en Firestore
# Collection: reportes_validacion
```

---

## 🚨 Troubleshooting

### Error: "Firebase Admin no inicializado"
```bash
# Asegurarse de tener las credenciales configuradas
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"
```

### Script se queda colgado
```bash
# Verificar que las Cloud Functions estén desplegadas y activas
# Los scripts simulan notificaciones que requieren functions activas
```

### Demasiados pedidos huérfanos
```bash
# Ejecutar en modo dry-run primero para analizar
npx ts-node scripts/recuperar-pedidos-huerfanos.ts

# Revisar logs en Cloud Logging para identificar causa raíz
# Filtrar por: "🚨 INCONSISTENCIA DETECTADA"
```

---

## 📊 Interpretación de Resultados

### ✅ Sistema Saludable
```
Total "cargado": 500
Pedidos OK: 500
Pedidos huérfanos: 0
```

### ⚠️ Atención Requerida (1-5 huérfanos)
```
Total "cargado": 500
Pedidos OK: 497
Pedidos huérfanos: 3
```
**Acción:** Ejecutar recuperación y monitorear.

### 🚨 Problema Crítico (>5 huérfanos)
```
Total "cargado": 500
Pedidos OK: 480
Pedidos huérfanos: 20
```
**Acción:** Detener deploy, investigar causa raíz, ejecutar recuperación.

---

## 📝 Logs y Auditoría

Todos los scripts generan logs detallados:

### En consola
- Emojis para fácil identificación visual
- Formato tabular para resultados
- Colores para estados (si terminal lo soporta)

### En Firestore
- **Collection:** `reportes_validacion`
- **Campos:** timestamp, tipo, resultados, inconsistencias

### En Cloud Logging
- Filtrar por: `"📋 RECUPERACIÓN"`, `"📊 VALIDACIÓN"`, `"🧪 SIMULACIÓN"`
- Severity: INFO (éxito), WARNING (inconsistencias), ERROR (fallos)

---

## 🛠️ Desarrollo

### Agregar nuevo caso de prueba
1. Editar `simular-casos-prueba.ts`
2. Crear función `async function simularNuevoCaso(): Promise<boolean>`
3. Agregar caso en `ejecutarTests()`
4. Documentar en este README

### Agregar nueva validación
1. Editar `validar-reprocesamiento.ts`
2. Agregar lógica en función `validarReprocesamiento` o crear nueva
3. Actualizar interface `ResultadoValidacion`
4. Documentar criterios de validación

---

## 📚 Referencias

- **TODO.md** - Documentación completa de tareas y arquitectura
- **functions/test/** - Tests unitarios con Jest
- **functions/src/index.ts** - Funciones principales del sistema
- **Cloud Logging** - Logs de producción con filtros por emoji

---

## ⚡ Quick Reference

```bash
# Validación rápida
npx ts-node scripts/validar-reprocesamiento.ts

# Recuperación (dry-run)
npx ts-node scripts/recuperar-pedidos-huerfanos.ts

# Recuperación (real)
npx ts-node scripts/recuperar-pedidos-huerfanos.ts --real

# Tests completos
npm test && npx ts-node scripts/simular-casos-prueba.ts --caso=todos

# Simular problema específico
npx ts-node scripts/simular-casos-prueba.ts --caso=timing
```
