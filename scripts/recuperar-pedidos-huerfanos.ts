/**
 * @fileoverview Script para identificar y recuperar pedidos huérfanos.
 * 
 * Un pedido "huérfano" es aquel que está marcado como "cargado" en la colección
 * enviosConInconsistencias pero NO existe en la colección PedidosBS.
 * 
 * Este script:
 * 1. Identifica todos los pedidos huérfanos
 * 2. Los marca como "sin carga" para que se reprocesen
 * 3. Genera un reporte detallado
 * 
 * IMPORTANTE: Ejecutar después de desplegar la corrección de la TAREA 1.
 * 
 * Uso:
 *   npx ts-node functions/scripts/recuperar-pedidos-huerfanos.ts
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Inicializar Firebase Admin
initializeApp();
const db = getFirestore();

interface HuerfanoDetectado {
  shipmentId: string;
  estadoActual: string;
  mensaje: string;
  ultimoIntento?: Date;
  meli_pack_id?: string;
}

interface ResultadoRecuperacion {
  totalRevisados: number;
  huerfanosEncontrados: number;
  huerfanos: HuerfanoDetectado[];
  errores: Array<{ shipmentId: string; error: string }>;
}

/**
 * Función principal para recuperar pedidos huérfanos.
 */
async function recuperarPedidosHuerfanos(): Promise<ResultadoRecuperacion> {
  console.log("🔍 Iniciando búsqueda de pedidos huérfanos...\n");
  console.log("=" .repeat(80));

  const resultado: ResultadoRecuperacion = {
    totalRevisados: 0,
    huerfanosEncontrados: 0,
    huerfanos: [],
    errores: [],
  };

  try {
    // 1. Buscar todos los documentos marcados como "cargado"
    console.log("📋 PASO 1: Buscando documentos con estado 'cargado'...");
    const reviewQueueSnapshot = await db
      .collection("enviosConInconsistencias")
      .where("estado_de_carga", "==", "cargado")
      .get();

    resultado.totalRevisados = reviewQueueSnapshot.size;
    console.log(`   Encontrados: ${resultado.totalRevisados} documentos\n`);

    if (reviewQueueSnapshot.empty) {
      console.log("✅ No hay documentos marcados como 'cargado'. Nada que revisar.\n");
      return resultado;
    }

    // 2. Verificar cada documento
    console.log("🔎 PASO 2: Verificando existencia en PedidosBS...");
    console.log("-".repeat(80));

    for (const doc of reviewQueueSnapshot.docs) {
      const shipmentId = doc.id;
      const data = doc.data();

      try {
        // Verificar si existe en PedidosBS
        const pedidoDoc = await db.collection("PedidosBS").doc(shipmentId).get();

        if (!pedidoDoc.exists) {
          // ❌ HUÉRFANO DETECTADO
          console.log(`❌ HUÉRFANO: ${shipmentId}`);
          console.log(`   Estado actual: ${data.estado_de_carga}`);
          console.log(`   Mensaje: ${data.mensaje || "N/A"}`);
          console.log(`   Pack ID: ${data.meli_pack_id || "N/A"}`);

          resultado.huerfanosEncontrados++;
          resultado.huerfanos.push({
            shipmentId,
            estadoActual: data.estado_de_carga,
            mensaje: data.mensaje,
            ultimoIntento: data.ultimoIntento?.toDate(),
            meli_pack_id: data.meli_pack_id,
          });

          // 3. Marcar para reprocesamiento
          await doc.ref.update({
            estado_de_carga: "sin carga",
            nota: "Marcado para reprocesamiento por script de recuperación de huérfanos",
            fecha_recuperacion: Timestamp.now(),
            recuperado_por_script: true,
          });

          console.log(`   ✅ Marcado como "sin carga" para reprocesamiento\n`);
        } else {
          // ✅ Todo OK
          console.log(`✅ OK: ${shipmentId} (pedido existe en PedidosBS)`);
        }
      } catch (error) {
        const err = error as Error;
        console.error(`⚠️ ERROR al procesar ${shipmentId}: ${err.message}`);
        resultado.errores.push({
          shipmentId,
          error: err.message,
        });
      }
    }

    console.log("-".repeat(80));
    console.log("\n📊 PASO 3: Generando reporte...\n");

    // 4. Generar reporte final
    console.log("=" .repeat(80));
    console.log("📈 RESUMEN DE RECUPERACIÓN");
    console.log("=" .repeat(80));
    console.log(`Total de documentos revisados: ${resultado.totalRevisados}`);
    console.log(`Huérfanos encontrados: ${resultado.huerfanosEncontrados}`);
    console.log(`Errores durante el proceso: ${resultado.errores.length}`);
    console.log("=" .repeat(80));

    if (resultado.huerfanosEncontrados > 0) {
      console.log("\n📋 LISTA DE HUÉRFANOS RECUPERADOS:");
      console.log("-".repeat(80));
      resultado.huerfanos.forEach((huerfano, index) => {
        console.log(`${index + 1}. Shipment ID: ${huerfano.shipmentId}`);
        console.log(`   Pack ID: ${huerfano.meli_pack_id || "N/A"}`);
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

      console.log("\n✅ SIGUIENTE PASO:");
      console.log(
        "   Ejecutar la función 'reprocesarEnviosInconsistentes' para consolidar estos pedidos."
      );
      console.log(
        "   Los pedidos ahora están marcados como 'sin carga' y serán reprocesados.\n"
      );
    } else {
      console.log(
        "\n✅ EXCELENTE: No se encontraron pedidos huérfanos. El sistema está consistente.\n"
      );
    }

    if (resultado.errores.length > 0) {
      console.log("\n⚠️ ERRORES ENCONTRADOS:");
      console.log("-".repeat(80));
      resultado.errores.forEach((error, index) => {
        console.log(`${index + 1}. Shipment ID: ${error.shipmentId}`);
        console.log(`   Error: ${error.error}\n`);
      });
      console.log("-".repeat(80));
    }

    // 5. Guardar reporte en Firestore (opcional)
    await db.collection("reportes_recuperacion").add({
      fecha: Timestamp.now(),
      totalRevisados: resultado.totalRevisados,
      huerfanosEncontrados: resultado.huerfanosEncontrados,
      huerfanos: resultado.huerfanos,
      errores: resultado.errores,
    });

    console.log("\n💾 Reporte guardado en colección 'reportes_recuperacion'");

    return resultado;
  } catch (error) {
    const err = error as Error;
    console.error("\n❌ ERROR CRÍTICO durante la recuperación:");
    console.error(`   ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
    throw error;
  }
}

/**
 * Función para listar todos los pedidos huérfanos sin modificar nada (modo solo lectura).
 */
async function listarHuerfanos(): Promise<void> {
  console.log("🔍 MODO SOLO LECTURA: Listando pedidos huérfanos...\n");

  const reviewQueueSnapshot = await db
    .collection("enviosConInconsistencias")
    .where("estado_de_carga", "==", "cargado")
    .get();

  console.log(`Total de documentos con estado 'cargado': ${reviewQueueSnapshot.size}\n`);

  let huerfanosCount = 0;

  for (const doc of reviewQueueSnapshot.docs) {
    const shipmentId = doc.id;
    const pedidoDoc = await db.collection("PedidosBS").doc(shipmentId).get();

    if (!pedidoDoc.exists) {
      huerfanosCount++;
      const data = doc.data();
      console.log(`❌ HUÉRFANO ${huerfanosCount}: ${shipmentId}`);
      console.log(`   Pack ID: ${data.meli_pack_id || "N/A"}`);
      console.log(`   Mensaje: ${data.mensaje || "N/A"}`);
      console.log("");
    }
  }

  console.log(`\n📊 Total de huérfanos: ${huerfanosCount}`);
}

// ============================================================================
// EJECUCIÓN DEL SCRIPT
// ============================================================================

const args = process.argv.slice(2);
const modoSoloLectura = args.includes("--dry-run") || args.includes("--list");

if (modoSoloLectura) {
  console.log("⚠️ MODO SOLO LECTURA ACTIVADO (no se realizarán cambios)\n");
  listarHuerfanos()
    .then(() => {
      console.log("\n✅ Listado completado.\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Error durante el listado:", error);
      process.exit(1);
    });
} else {
  console.log("⚠️ MODO RECUPERACIÓN ACTIVADO (se marcarán huérfanos para reprocesamiento)\n");
  console.log("   Para solo listar sin modificar, ejecuta: npx ts-node recuperar-pedidos-huerfanos.ts --dry-run\n");

  recuperarPedidosHuerfanos()
    .then((resultado) => {
      console.log("\n✅ Proceso de recuperación completado exitosamente.\n");
      if (resultado.huerfanosEncontrados > 0) {
        process.exit(0); // Salir con código 0 (éxito con huérfanos recuperados)
      } else {
        process.exit(0); // Salir con código 0 (éxito sin huérfanos)
      }
    })
    .catch((error) => {
      console.error("\n❌ Error crítico durante la recuperación:", error);
      process.exit(1);
    });
}
