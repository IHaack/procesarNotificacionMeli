/**
 * @fileoverview Script para validar que el reprocesamiento funciona correctamente.
 * Ejecutar después de cada despliegue para verificar consistencia del sistema.
 * 
 * Uso:
 *   npx ts-node functions/scripts/validar-reprocesamiento.ts
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Inicializar Firebase Admin
initializeApp();
const db = getFirestore();

interface ResultadoValidacion {
  totalRevisados: number;
  inconsistenciasReales: number;
  huerfanosDetectados: Array<{
    shipmentId: string;
    estado: string;
    mensaje: string;
    ultimoIntento?: Date;
  }>;
}

/**
 * Valida que todos los documentos marcados como "cargado" 
 * realmente tengan un pedido en PedidosBS.
 */
async function validarReprocesamiento(): Promise<ResultadoValidacion> {
  console.log("🔍 Validando configuración de reprocesamiento...\n");
  console.log("=" .repeat(80));
  
  const resultado: ResultadoValidacion = {
    totalRevisados: 0,
    inconsistenciasReales: 0,
    huerfanosDetectados: [],
  };

  try {
    // 1. Verificar documentos marcados como "cargado"
    console.log("📋 PASO 1: Buscando documentos marcados como 'cargado'...");
    const inconsistenciasSnapshot = await db
      .collection("enviosConInconsistencias")
      .where("estado_de_carga", "==", "cargado")
      .get();

    resultado.totalRevisados = inconsistenciasSnapshot.size;
    console.log(`   Encontrados: ${resultado.totalRevisados} documentos\n`);

    if (inconsistenciasSnapshot.empty) {
      console.log("✅ No hay documentos marcados como 'cargado'. Sistema limpio.\n");
      return resultado;
    }

    // 2. Verificar cada uno contra PedidosBS
    console.log("🔎 PASO 2: Verificando existencia en PedidosBS...");
    console.log("-".repeat(80));

    for (const doc of inconsistenciasSnapshot.docs) {
      const shipmentId = doc.id;
      const data = doc.data();

      // Verificar si existe en PedidosBS
      const pedidoDoc = await db.collection("PedidosBS").doc(shipmentId).get();

      if (!pedidoDoc.exists) {
        // ❌ INCONSISTENCIA DETECTADA
        resultado.inconsistenciasReales++;
        console.log(`❌ INCONSISTENCIA ${resultado.inconsistenciasReales}: ${shipmentId}`);
        console.log(`   Estado: ${data.estado_de_carga}`);
        console.log(`   Mensaje: ${data.mensaje || "N/A"}`);
        console.log(`   Último intento: ${data.ultimoIntento?.toDate().toISOString() || "N/A"}`);
        
        resultado.huerfanosDetectados.push({
          shipmentId,
          estado: data.estado_de_carga,
          mensaje: data.mensaje,
          ultimoIntento: data.ultimoIntento?.toDate(),
        });
        console.log("");
      } else {
        // ✅ OK
        console.log(`✅ OK: ${shipmentId} (pedido existe en PedidosBS)`);
      }
    }

    console.log("-".repeat(80));
    console.log("\n📊 PASO 3: Generando reporte...\n");

    // 3. Generar reporte final
    console.log("=" .repeat(80));
    console.log("📈 RESUMEN DE VALIDACIÓN");
    console.log("=" .repeat(80));
    console.log(`Total de documentos revisados: ${resultado.totalRevisados}`);
    console.log(`Inconsistencias detectadas: ${resultado.inconsistenciasReales}`);
    console.log("=" .repeat(80));

    if (resultado.inconsistenciasReales === 0) {
      console.log("\n✅✅✅ VALIDACIÓN EXITOSA ✅✅✅");
      console.log("No hay inconsistencias detectadas. El sistema está funcionando correctamente.\n");
    } else {
      console.log(`\n⚠️⚠️⚠️ VALIDACIÓN FALLIDA ⚠️⚠️⚠️`);
      console.log(`Se detectaron ${resultado.inconsistenciasReales} inconsistencias (pedidos huérfanos).\n`);
      
      console.log("📋 LISTA DE INCONSISTENCIAS:");
      console.log("-".repeat(80));
      resultado.huerfanosDetectados.forEach((huerfano, index) => {
        console.log(`${index + 1}. Shipment ID: ${huerfano.shipmentId}`);
        console.log(`   Estado: ${huerfano.estado}`);
        console.log(`   Mensaje: ${huerfano.mensaje}`);
        console.log(
          `   Último intento: ${
            huerfano.ultimoIntento
              ? huerfano.ultimoIntento.toISOString()
              : "N/A"
          }`
        );
        console.log("");
      });
      console.log("-".repeat(80));

      console.log("\n🔧 ACCIÓN RECOMENDADA:");
      console.log("   Ejecutar el script de recuperación:");
      console.log("   npx ts-node functions/scripts/recuperar-pedidos-huerfanos.ts\n");
    }

    // 4. Guardar reporte en Firestore
    await db.collection("reportes_validacion").add({
      fecha: new Date(),
      totalRevisados: resultado.totalRevisados,
      inconsistenciasReales: resultado.inconsistenciasReales,
      huerfanos: resultado.huerfanosDetectados,
      tipo: "validacion_post_deploy",
    });

    console.log("💾 Reporte guardado en colección 'reportes_validacion'\n");

    return resultado;
  } catch (error) {
    const err = error as Error;
    console.error("\n❌ ERROR CRÍTICO durante la validación:");
    console.error(`   ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
    throw error;
  }
}

/**
 * Validación adicional: Verificar que todos los pedidos en PedidosBS
 * tienen su correspondiente documento marcado como "cargado" en enviosConInconsistencias.
 */
async function validarConsistenciaInversa(): Promise<void> {
  console.log("\n" + "=" .repeat(80));
  console.log("🔄 VALIDACIÓN INVERSA: PedidosBS → enviosConInconsistencias");
  console.log("=" .repeat(80));

  const pedidosSnapshot = await db
    .collection("PedidosBS")
    .orderBy("__name__")
    .limit(100)
    .get();

  console.log(`\n📊 Revisando ${pedidosSnapshot.size} pedidos recientes en PedidosBS...\n`);

  let sinRegistro = 0;

  for (const pedidoDoc of pedidosSnapshot.docs) {
    const shipmentId = pedidoDoc.id;
    const inconsistencyDoc = await db
      .collection("enviosConInconsistencias")
      .doc(shipmentId)
      .get();

    if (!inconsistencyDoc.exists) {
      // Esto puede ser normal si el pedido se creó sin inconsistencias
      console.log(`ℹ️  Pedido ${shipmentId}: Sin registro en enviosConInconsistencias (normal si no hubo inconsistencias)`);
    } else {
      const data = inconsistencyDoc.data();
      if (data?.estado_de_carga !== "cargado") {
        sinRegistro++;
        console.log(`⚠️  Pedido ${shipmentId}: Existe pero NO está marcado como 'cargado' (estado: ${data?.estado_de_carga})`);
      }
    }
  }

  console.log(`\n📊 Pedidos sin estado 'cargado': ${sinRegistro}`);
  console.log("=" .repeat(80));
}

// ============================================================================
// EJECUCIÓN DEL SCRIPT
// ============================================================================

console.log("\n");
console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║                   VALIDACIÓN DE REPROCESAMIENTO                            ║");
console.log("║                      Sistema de Pedidos MELI                               ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝");
console.log("\n");

validarReprocesamiento()
  .then(async (resultado) => {
    console.log("✅ Validación directa completada.\n");

    // Ejecutar validación inversa
    await validarConsistenciaInversa();

    console.log("\n✅ Proceso de validación completado exitosamente.\n");

    if (resultado.inconsistenciasReales > 0) {
      process.exit(1); // Salir con error si hay inconsistencias
    } else {
      process.exit(0); // Salir con éxito
    }
  })
  .catch((error) => {
    console.error("\n❌ Error crítico durante la validación:", error);
    process.exit(1);
  });
