/**
 * @fileoverview Script para simular diferentes escenarios de procesamiento de pedidos.
 * Permite probar el flujo completo incluyendo casos de timing issues.
 * 
 * CASOS DE PRUEBA:
 * 1. Shipment llega ANTES que la order (timing issue)
 * 2. Order llega ANTES que el shipment (caso normal)
 * 3. Pack con múltiples orders (algunas llegan tarde)
 * 4. Order individual sin pack_id
 * 5. Pack con todas las orders llegando a tiempo
 * 
 * Uso:
 *   # Simular timing issue
 *   npx ts-node functions/scripts/simular-casos-prueba.ts --caso timing
 * 
 *   # Simular caso normal
 *   npx ts-node functions/scripts/simular-casos-prueba.ts --caso normal
 * 
 *   # Simular pack incompleto
 *   npx ts-node functions/scripts/simular-casos-prueba.ts --caso pack-incompleto
 * 
 *   # Simular todos los casos
 *   npx ts-node functions/scripts/simular-casos-prueba.ts --caso todos
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Inicializar Firebase Admin
initializeApp();
const db = getFirestore();

// ============================================================================
// UTILIDADES
// ============================================================================

function generarId(prefijo: string): string {
  return `${prefijo}_TEST_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

async function esperarSegundos(segundos: number): Promise<void> {
  console.log(`⏳ Esperando ${segundos} segundos...`);
  await new Promise((resolve) => setTimeout(resolve, segundos * 1000));
}

async function verificarEstado(shipmentId: string, esperado: {
  enInconsistencias: boolean;
  estadoCarga?: string;
  enPedidosBS: boolean;
}): Promise<boolean> {
  const inconsistencyDoc = await db
    .collection("enviosConInconsistencias")
    .doc(shipmentId)
    .get();
  
  const pedidoDoc = await db.collection("PedidosBS").doc(shipmentId).get();

  const resultados = {
    enInconsistencias: inconsistencyDoc.exists,
    estadoCarga: inconsistencyDoc.data()?.estado_de_carga,
    enPedidosBS: pedidoDoc.exists,
  };

  const exito = 
    resultados.enInconsistencias === esperado.enInconsistencias &&
    resultados.enPedidosBS === esperado.enPedidosBS &&
    (!esperado.estadoCarga || resultados.estadoCarga === esperado.estadoCarga);

  console.log(`\n📊 Estado del shipment ${shipmentId}:`);
  console.log(`   En enviosConInconsistencias: ${resultados.enInconsistencias ? "✅" : "❌"} (esperado: ${esperado.enInconsistencias ? "✅" : "❌"})`);
  console.log(`   Estado de carga: ${resultados.estadoCarga || "N/A"} (esperado: ${esperado.estadoCarga || "N/A"})`);
  console.log(`   En PedidosBS: ${resultados.enPedidosBS ? "✅" : "❌"} (esperado: ${esperado.enPedidosBS ? "✅" : "❌"})`);
  console.log(`   Resultado: ${exito ? "✅ CORRECTO" : "❌ FALLÓ"}\n`);

  return exito;
}

// ============================================================================
// CASO 1: TIMING ISSUE - Shipment llega ANTES que la order
// ============================================================================

async function simularTimingIssue(): Promise<boolean> {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 CASO 1: TIMING ISSUE - Shipment llega ANTES que la order");
  console.log("=".repeat(80));
  console.log("Escenario: Simula el bug original donde el shipment llega primero\n");

  const shipmentId = generarId("SHIP");
  const orderId = generarId("ORDER");

  try {
    // PASO 1: Crear shipment sin order previa
    console.log("📦 PASO 1: Insertando shipment en DB...");
    await db.collection("Shipments").doc(shipmentId).set({
      id: Number(shipmentId.replace(/\D/g, "")),
      order_id: Number(orderId.replace(/\D/g, "")),
      status: "ready_to_ship",
      substatus: "printed",
      logistic_type: "self_service",
      created_at: Timestamp.now(),
    });
    console.log(`   ✅ Shipment ${shipmentId} creado\n`);

    // Simular procesamiento del shipment
    console.log("⚙️  PASO 2: Simulando procesamiento del shipment (sin orders disponibles)...");
    // Aquí el sistema debería registrar en enviosConInconsistencias
    await esperarSegundos(2);

    // Verificar que se registró en enviosConInconsistencias con estado "sin carga"
    const resultado1 = await verificarEstado(shipmentId, {
      enInconsistencias: true,
      estadoCarga: "sin carga",
      enPedidosBS: false,
    });

    if (!resultado1) {
      console.log("❌ FALLÓ: El shipment no se registró correctamente en enviosConInconsistencias");
      return false;
    }

    // PASO 3: Crear order (llegada tardía)
    console.log("📋 PASO 3: Insertando order (llegada tardía)...");
    await db.collection("Orders").doc(orderId).set({
      id: Number(orderId.replace(/\D/g, "")),
      meli_shipment_id: shipmentId,
      meli_pack_id: null,
      status: "paid",
      tags: ["paid"],
      total_amount: 50000,
      paid_amount: 50000,
      currency_id: "CLP",
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    console.log(`   ✅ Order ${orderId} creada\n`);

    // PASO 4: Simular trigger automático de TAREA 2
    console.log("⚙️  PASO 4: Esperando trigger automático (TAREA 2)...");
    await esperarSegundos(3);

    // Verificar que ahora se consolidó correctamente
    const resultado2 = await verificarEstado(shipmentId, {
      enInconsistencias: true,
      estadoCarga: "cargado",
      enPedidosBS: true,
    });

    if (!resultado2) {
      console.log("❌ FALLÓ: El trigger automático no funcionó correctamente");
      return false;
    }

    console.log("✅✅✅ CASO 1 EXITOSO: El sistema manejó correctamente el timing issue\n");
    return true;
  } catch (error) {
    console.error("❌ Error en CASO 1:", error);
    return false;
  } finally {
    // Limpieza
    console.log("🧹 Limpiando datos de prueba...");
    await db.collection("Shipments").doc(shipmentId).delete();
    await db.collection("Orders").doc(orderId).delete();
    await db.collection("enviosConInconsistencias").doc(shipmentId).delete();
    await db.collection("PedidosBS").doc(shipmentId).delete();
    console.log("   ✅ Datos de prueba eliminados\n");
  }
}

// ============================================================================
// CASO 2: FLUJO NORMAL - Order llega ANTES que el shipment
// ============================================================================

async function simularFlujoNormal(): Promise<boolean> {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 CASO 2: FLUJO NORMAL - Order llega ANTES que el shipment");
  console.log("=".repeat(80));
  console.log("Escenario: Caso ideal donde la order ya está disponible\n");

  const shipmentId = generarId("SHIP");
  const orderId = generarId("ORDER");

  try {
    // PASO 1: Crear order primero
    console.log("📋 PASO 1: Insertando order...");
    await db.collection("Orders").doc(orderId).set({
      id: Number(orderId.replace(/\D/g, "")),
      meli_shipment_id: shipmentId,
      meli_pack_id: null,
      status: "paid",
      tags: ["paid"],
      total_amount: 50000,
      paid_amount: 50000,
      currency_id: "CLP",
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    console.log(`   ✅ Order ${orderId} creada\n`);

    await esperarSegundos(1);

    // PASO 2: Crear shipment (debería consolidar inmediatamente)
    console.log("📦 PASO 2: Insertando shipment...");
    await db.collection("Shipments").doc(shipmentId).set({
      id: Number(shipmentId.replace(/\D/g, "")),
      order_id: Number(orderId.replace(/\D/g, "")),
      status: "ready_to_ship",
      substatus: "printed",
      logistic_type: "self_service",
      created_at: Timestamp.now(),
    });
    console.log(`   ✅ Shipment ${shipmentId} creado\n`);

    // PASO 3: Esperar procesamiento
    console.log("⚙️  PASO 3: Esperando procesamiento...");
    await esperarSegundos(3);

    // Verificar que se consolidó correctamente
    const resultado = await verificarEstado(shipmentId, {
      enInconsistencias: false, // No debería estar aquí (consolidó inmediatamente)
      enPedidosBS: true,
    });

    if (!resultado) {
      console.log("❌ FALLÓ: El flujo normal no funcionó correctamente");
      return false;
    }

    console.log("✅✅✅ CASO 2 EXITOSO: Flujo normal funcionó correctamente\n");
    return true;
  } catch (error) {
    console.error("❌ Error en CASO 2:", error);
    return false;
  } finally {
    // Limpieza
    console.log("🧹 Limpiando datos de prueba...");
    await db.collection("Shipments").doc(shipmentId).delete();
    await db.collection("Orders").doc(orderId).delete();
    await db.collection("enviosConInconsistencias").doc(shipmentId).delete();
    await db.collection("PedidosBS").doc(shipmentId).delete();
    console.log("   ✅ Datos de prueba eliminados\n");
  }
}

// ============================================================================
// CASO 3: PACK CON MÚLTIPLES ORDERS - Algunas llegan tarde
// ============================================================================

async function simularPackIncompleto(): Promise<boolean> {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 CASO 3: PACK INCOMPLETO - Orders llegan en momentos diferentes");
  console.log("=".repeat(80));
  console.log("Escenario: Pack con 3 orders, solo 2 llegan inicialmente\n");

  const shipmentId = generarId("SHIP");
  const packId = generarId("PACK");
  const order1Id = generarId("ORDER1");
  const order2Id = generarId("ORDER2");
  const order3Id = generarId("ORDER3");

  try {
    // PASO 1: Crear shipment con pack_id
    console.log("📦 PASO 1: Insertando shipment con pack_id...");
    await db.collection("Shipments").doc(shipmentId).set({
      id: Number(shipmentId.replace(/\D/g, "")),
      pack_id: packId,
      status: "ready_to_ship",
      substatus: "printed",
      logistic_type: "self_service",
      created_at: Timestamp.now(),
    });
    console.log(`   ✅ Shipment ${shipmentId} con pack ${packId} creado\n`);

    // PASO 2: Crear solo 2 de 3 orders
    console.log("📋 PASO 2: Insertando 2 de 3 orders del pack...");
    await db.collection("Orders").doc(order1Id).set({
      id: Number(order1Id.replace(/\D/g, "")),
      meli_shipment_id: shipmentId,
      meli_pack_id: packId,
      status: "paid",
      tags: ["paid"],
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    
    await db.collection("Orders").doc(order2Id).set({
      id: Number(order2Id.replace(/\D/g, "")),
      meli_shipment_id: shipmentId,
      meli_pack_id: packId,
      status: "paid",
      tags: ["paid"],
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    console.log(`   ✅ Orders ${order1Id} y ${order2Id} creadas (falta ${order3Id})\n`);

    // PASO 3: Esperar procesamiento (debería detectar inconsistencia)
    console.log("⚙️  PASO 3: Esperando procesamiento (debería detectar que falta 1 order)...");
    await esperarSegundos(3);

    // Verificar que se registró inconsistencia
    const resultado1 = await verificarEstado(shipmentId, {
      enInconsistencias: true,
      estadoCarga: "sin carga",
      enPedidosBS: false,
    });

    if (!resultado1) {
      console.log("❌ FALLÓ: No detectó la inconsistencia del pack incompleto");
      return false;
    }

    // PASO 4: Agregar la order faltante
    console.log("📋 PASO 4: Insertando la order faltante...");
    await db.collection("Orders").doc(order3Id).set({
      id: Number(order3Id.replace(/\D/g, "")),
      meli_shipment_id: shipmentId,
      meli_pack_id: packId,
      status: "paid",
      tags: ["paid"],
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    console.log(`   ✅ Order ${order3Id} creada (pack ahora completo)\n`);

    // PASO 5: Esperar trigger automático
    console.log("⚙️  PASO 5: Esperando trigger automático del pack completo...");
    await esperarSegundos(3);

    // Verificar consolidación exitosa
    const resultado2 = await verificarEstado(shipmentId, {
      enInconsistencias: true,
      estadoCarga: "cargado",
      enPedidosBS: true,
    });

    if (!resultado2) {
      console.log("❌ FALLÓ: No consolidó correctamente después de completar el pack");
      return false;
    }

    console.log("✅✅✅ CASO 3 EXITOSO: Manejó correctamente el pack incompleto\n");
    return true;
  } catch (error) {
    console.error("❌ Error en CASO 3:", error);
    return false;
  } finally {
    // Limpieza
    console.log("🧹 Limpiando datos de prueba...");
    await db.collection("Shipments").doc(shipmentId).delete();
    await db.collection("Orders").doc(order1Id).delete();
    await db.collection("Orders").doc(order2Id).delete();
    await db.collection("Orders").doc(order3Id).delete();
    await db.collection("enviosConInconsistencias").doc(shipmentId).delete();
    await db.collection("PedidosBS").doc(shipmentId).delete();
    console.log("   ✅ Datos de prueba eliminados\n");
  }
}

// ============================================================================
// EJECUCIÓN PRINCIPAL
// ============================================================================

async function ejecutarTests() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                      SIMULACIÓN DE CASOS DE PRUEBA                         ║");
  console.log("║                      Sistema de Pedidos MELI                               ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");
  console.log("\n");

  const args = process.argv.slice(2);
  const caso = args.find((arg) => arg.startsWith("--caso="))?.split("=")[1] || "todos";

  const resultados: { [key: string]: boolean } = {};

  if (caso === "timing" || caso === "todos") {
    resultados["timing-issue"] = await simularTimingIssue();
  }

  if (caso === "normal" || caso === "todos") {
    resultados["flujo-normal"] = await simularFlujoNormal();
  }

  if (caso === "pack-incompleto" || caso === "todos") {
    resultados["pack-incompleto"] = await simularPackIncompleto();
  }

  // Reporte final
  console.log("\n" + "=".repeat(80));
  console.log("📊 RESUMEN DE TESTS");
  console.log("=".repeat(80));

  let exitosos = 0;
  let fallidos = 0;

  Object.entries(resultados).forEach(([nombre, exito]) => {
    if (exito) {
      exitosos++;
      console.log(`✅ ${nombre}: EXITOSO`);
    } else {
      fallidos++;
      console.log(`❌ ${nombre}: FALLIDO`);
    }
  });

  console.log("=".repeat(80));
  console.log(`Total: ${exitosos + fallidos} tests`);
  console.log(`Exitosos: ${exitosos}`);
  console.log(`Fallidos: ${fallidos}`);
  console.log("=".repeat(80));

  if (fallidos > 0) {
    console.log("\n❌ Algunos tests fallaron. Revisar implementación.\n");
    process.exit(1);
  } else {
    console.log("\n✅✅✅ Todos los tests pasaron exitosamente! ✅✅✅\n");
    process.exit(0);
  }
}

ejecutarTests().catch((error) => {
  console.error("\n❌ Error crítico durante la ejecución de tests:", error);
  process.exit(1);
});
