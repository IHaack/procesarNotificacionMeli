/**
 * @fileoverview Configuración del servicio de correo electrónico
 * 
 * Este archivo contiene la configuración SMTP y los parámetros del sistema de notificaciones.
 */

import { defineSecret } from 'firebase-functions/params';

// Secretos de Firebase (configurar antes del deploy)
export const emailUser = defineSecret('EMAIL_USER');       // info@asurity.cl
export const emailPassword = defineSecret('EMAIL_PASSWORD'); // Password de aplicación

/**
 * Configuración principal del servicio de correo (valores estáticos)
 */
export const emailConfig = {
  // Configuración del remitente
  from: {
    address: 'info@asurity.cl',
    name: 'Andina Grains - Sistema de Alertas'
  },
  
  // Rate limiting (evitar spam y proteger contra bucles infinitos)
  rateLimits: {
    maxPerHour: 50,                  // Máximo 50 correos por hora
    maxPerDay: 200,                  // Máximo 200 correos por día
  },
  
  // Destinatarios globales que SIEMPRE recibirán todos los correos
  // Estos se agregarán automáticamente a cualquier envío
  globalRecipients: [
    'pablo.guerrero@asurity.cl',
    'ivanahaack33@gmail.com'
  ],
  
  // Destinatarios por defecto según tipo de alerta
  // Estos se usan como fallback si no se especifica destinatario
  defaultRecipients: {
    alerts: ['operaciones@asurity.cl'],           // Alertas operacionales
    errors: ['dev@asurity.cl'],                   // Errores técnicos
    reports: ['gerencia@asurity.cl'],             // Reportes diarios
    critical: ['operaciones@asurity.cl', 'gerencia@asurity.cl']  // Críticos
  }
};

/**
 * Obtiene la configuración SMTP en runtime (con acceso a secretos)
 * IMPORTANTE: Solo llamar esta función en runtime, no durante la carga del módulo
 */
export function getSmtpConfig() {
  return {
    service: 'gmail',
    auth: {
      user: emailUser.value(),      // info@asurity.cl (debe ser cuenta Gmail)
      pass: emailPassword.value()   // Password de aplicación de Google
    }
  };
  
  // === OPCIÓN ALTERNATIVA: Servidor SMTP corporativo ===
  // Si Asurity tiene servidor SMTP propio, reemplazar el return anterior con:
  /*
  return {
    host: 'smtp.asurity.cl',        // Servidor SMTP corporativo
    port: 587,                       // Puerto SMTP (587 para TLS, 465 para SSL)
    secure: false,                   // true para SSL, false para TLS
    auth: {
      user: emailUser.value(),       // info@asurity.cl
      pass: emailPassword.value()    // Password del correo corporativo
    },
    tls: {
      rejectUnauthorized: false      // Solo si hay problemas con certificados
    }
  };
  */
}

/**
 * Tipos de notificación soportados
 */
export const notificationTypes = {
  INCONSISTENCIA: 'inconsistencia_detectada',
  CONSOLIDACION_EXITOSA: 'consolidacion_exitosa',
  ERROR_CRITICO: 'error_critico',
  REPORTE_DIARIO: 'reporte_diario',
  CUSTOM: 'custom',
} as const;
