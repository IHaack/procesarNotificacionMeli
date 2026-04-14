/**
 * @fileoverview Script de prueba para el servicio de correo electrónico
 * 
 * INSTRUCCIONES:
 * 1. Compilar: npm run build
 * 2. Ejecutar con credenciales:
 *    $env:EMAIL_USER="info@asurity.cl"; $env:EMAIL_PASSWORD="tu-password"; node lib/scripts/test-email.js
 * 3. Verificar que lleguen los 5 correos de prueba
 * 4. Revisar la consola para logs detallados
 * 5. Verificar la colección emailLogs en Firestore Console
 * 
 * NOTA: Los correos siempre se enviarán a los destinatarios globales configurados:
 * - pablo.guerrero@asurity.cl
 * - ivanahaack33@gmail.com
 * 
 * Si hay errores:
 * - Verificar que EMAIL_USER y EMAIL_PASSWORD estén configurados correctamente
 * - Verificar conexión a internet
 * - Revisar logs de Firebase Console
 */

import * as admin from 'firebase-admin';
import {
  notificarInconsistencia,
  notificarConsolidacionExitosa,
  notificarErrorCritico,
  enviarReporteDiario,
  enviarNotificacionGenerica,
} from '../services/email.service';

// Inicializar Firebase Admin (solo si no está inicializado)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Función auxiliar para esperar entre pruebas
 */
function esperar(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ejecuta todas las pruebas del servicio de email
 */
async function ejecutarPruebas(): Promise<void> {
  console.log('🧪 Iniciando pruebas del servicio de correo...\n');
  console.log('📧 Destinatarios globales (siempre incluidos):');
  console.log('   - pablo.guerrero@asurity.cl');
  console.log('   - ivanahaack33@gmail.com\n');

  let pruebasExitosas = 0;
  let pruebasFallidas = 0;

  // =========================================================================
  // PRUEBA 1: Notificación de inconsistencia
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📨 PRUEBA 1: Notificación de Inconsistencia');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const resultado1 = await notificarInconsistencia(
      {
        shipmentId: '45848383497',
        mensaje: 'Orders faltantes detectadas en consolidación',
        ordenesEsperadas: 3,
        ordenesEncontradas: 1,
        idsFaltantes: ['ORDER-001', 'ORDER-002'],
      },
      [] // Los destinatarios globales se agregan automáticamente
    );

    if (resultado1.success) {
      console.log('✅ Prueba 1 EXITOSA');
      console.log(`   Message ID: ${resultado1.messageId}\n`);
      pruebasExitosas++;
    } else {
      console.error('❌ Prueba 1 FALLIDA');
      console.error(`   Error: ${resultado1.error}\n`);
      pruebasFallidas++;
    }
  } catch (error: any) {
    console.error('❌ Prueba 1 FALLIDA (excepción)');
    console.error(`   Error: ${error.message}\n`);
    pruebasFallidas++;
  }

  await esperar(2000); // Esperar 2 segundos entre pruebas

  // =========================================================================
  // PRUEBA 2: Consolidación exitosa
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📨 PRUEBA 2: Consolidación Exitosa');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const resultado2 = await notificarConsolidacionExitosa(
      {
        shipmentId: '45848383498',
        orderId: 'ORDER-TEST-123',
        automatic: true,
      },
      [] // Los destinatarios globales se agregan automáticamente
    );

    if (resultado2.success) {
      console.log('✅ Prueba 2 EXITOSA');
      console.log(`   Message ID: ${resultado2.messageId}\n`);
      pruebasExitosas++;
    } else {
      console.error('❌ Prueba 2 FALLIDA');
      console.error(`   Error: ${resultado2.error}\n`);
      pruebasFallidas++;
    }
  } catch (error: any) {
    console.error('❌ Prueba 2 FALLIDA (excepción)');
    console.error(`   Error: ${error.message}\n`);
    pruebasFallidas++;
  }

  await esperar(2000);

  // =========================================================================
  // PRUEBA 3: Error crítico
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📨 PRUEBA 3: Error Crítico');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const resultado3 = await notificarErrorCritico(
      {
        errorMessage: 'Error al procesar consolidación: conexión timeout',
        errorStack: `Error: Connection timeout
    at procesarConsolidacion (/functions/index.js:245)
    at Runtime.processOrderTopic (/functions/index.js:450)`,
        source: 'processOrderTopic',
        shipmentId: '45848383499',
        timestamp: new Date(),
      },
      [] // Los destinatarios globales se agregan automáticamente
    );

    if (resultado3.success) {
      console.log('✅ Prueba 3 EXITOSA');
      console.log(`   Message ID: ${resultado3.messageId}\n`);
      pruebasExitosas++;
    } else {
      console.error('❌ Prueba 3 FALLIDA');
      console.error(`   Error: ${resultado3.error}\n`);
      pruebasFallidas++;
    }
  } catch (error: any) {
    console.error('❌ Prueba 3 FALLIDA (excepción)');
    console.error(`   Error: ${error.message}\n`);
    pruebasFallidas++;
  }

  await esperar(2000);

  // =========================================================================
  // PRUEBA 4: Reporte diario
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📨 PRUEBA 4: Reporte Diario');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const resultado4 = await enviarReporteDiario(
      {
        fecha: new Date(),
        pedidosProcesados: 47,
        consolidacionesAutomaticas: 12,
        inconsistenciasPendientes: 3,
        erroresTotales: 1,
      },
      [] // Los destinatarios globales se agregan automáticamente
    );

    if (resultado4.success) {
      console.log('✅ Prueba 4 EXITOSA');
      console.log(`   Message ID: ${resultado4.messageId}\n`);
      pruebasExitosas++;
    } else {
      console.error('❌ Prueba 4 FALLIDA');
      console.error(`   Error: ${resultado4.error}\n`);
      pruebasFallidas++;
    }
  } catch (error: any) {
    console.error('❌ Prueba 4 FALLIDA (excepción)');
    console.error(`   Error: ${error.message}\n`);
    pruebasFallidas++;
  }

  await esperar(2000);

  // =========================================================================
  // PRUEBA 5: Notificación genérica
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📨 PRUEBA 5: Notificación Genérica');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const resultado5 = await enviarNotificacionGenerica(
      {
        title: 'Prueba de notificación personalizada',
        message: 'Este es un mensaje de prueba usando el template genérico. Puedes personalizar completamente el contenido y agregar detalles adicionales.',
        type: 'info',
        details: [
          { label: 'Sistema', value: 'Cloud Functions 2da Gen' },
          { label: 'Ambiente', value: 'Test' },
          { label: 'Fecha', value: new Date().toLocaleString('es-CL') },
        ],
      },
      [], // Los destinatarios globales se agregan automáticamente
      'normal'
    );

    if (resultado5.success) {
      console.log('✅ Prueba 5 EXITOSA');
      console.log(`   Message ID: ${resultado5.messageId}\n`);
      pruebasExitosas++;
    } else {
      console.error('❌ Prueba 5 FALLIDA');
      console.error(`   Error: ${resultado5.error}\n`);
      pruebasFallidas++;
    }
  } catch (error: any) {
    console.error('❌ Prueba 5 FALLIDA (excepción)');
    console.error(`   Error: ${error.message}\n`);
    pruebasFallidas++;
  }

  // =========================================================================
  // RESUMEN FINAL
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 RESUMEN DE PRUEBAS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`✅ Pruebas exitosas: ${pruebasExitosas}/5`);
  console.log(`❌ Pruebas fallidas: ${pruebasFallidas}/5\n`);

  if (pruebasFallidas === 0) {
    console.log('🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!\n');
    console.log('✅ Verificaciones recomendadas:');
    console.log('   1. Revisar tu bandeja de entrada (5 correos)');
    console.log('   2. Verificar la colección emailLogs en Firestore Console');
    console.log('   3. Comprobar que los HTML se vean correctamente\n');
    console.log('📌 Siguiente paso: Integrar en functions/src/index.ts\n');
  } else {
    console.error('⚠️ ALGUNAS PRUEBAS FALLARON\n');
    console.error('🔍 Troubleshooting:');
    console.error('   1. Verificar que EMAIL_USER y EMAIL_PASSWORD estén configurados');
    console.error('      Comando: firebase functions:secrets:access EMAIL_USER');
    console.error('   2. Verificar conexión a internet');
    console.error('   3. Revisar logs detallados arriba');
    console.error('   4. Verificar Firebase Console > Functions > Logs\n');
  }

  // Esperar para dar tiempo a que Firestore complete las escrituras
  console.log('⏳ Esperando 5 segundos para asegurar escritura en Firestore...\n');
  await esperar(5000);

  console.log('✅ Script de prueba finalizado\n');
}

// Ejecutar pruebas y manejar errores globales
ejecutarPruebas()
  .then(() => {
    console.log('🏁 Ejecución completada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ ERROR FATAL en la ejecución del script:');
    console.error(error);
    process.exit(1);
  });
