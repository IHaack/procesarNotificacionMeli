/**
 * @fileoverview Servicio principal para envío de correos electrónicos
 * 
 * Proporciona funciones reutilizables y desacopladas para enviar notificaciones por email
 * con rate limiting, logging automático, y manejo de errores fail-safe.
 */

import * as nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {
  emailConfig,
  notificationTypes,
  getSmtpConfig,
} from './email-config';
import {
  getInconsistenciaTemplate,
  getConsolidacionExitosaTemplate,
  getErrorCriticoTemplate,
  getReporteDiarioTemplate,
  getGenericTemplate,
} from './email-templates';
import {
  EmailNotificationParams,
  EmailResult,
  EmailRateLimitStatus,
  EmailLog,
  InconsistenciaTemplateData,
  ConsolidacionExitosaTemplateData,
  ErrorCriticoTemplateData,
  ReporteDiarioTemplateData,
  GenericTemplateData,
} from '../interfaces/email.interfaces';

// Variables para lazy initialization
let _db: FirebaseFirestore.Firestore | null = null;
let _transporter: nodemailer.Transporter | null = null;

/**
 * Obtiene la instancia de Firestore (lazy initialization)
 */
function getDb(): FirebaseFirestore.Firestore {
  if (!_db) {
    _db = admin.firestore();
  }
  return _db;
}

/**
 * Obtiene el transporter de nodemailer (lazy initialization)
 */
function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport(getSmtpConfig());
  }
  return _transporter;
}

/**
 * Convierte destinatarios a formato string (helper function)
 */
function formatRecipients(recipients: string | string[] | undefined): string | undefined {
  if (!recipients) return undefined;
  return Array.isArray(recipients) ? recipients.join(', ') : recipients;
}

/**
 * Verifica si el envío de correo está dentro de los límites de rate limiting
 * 
 * @param context - Contexto opcional con metadatos para logging
 * @returns Promise con estado del rate limit (allowed: boolean, count, limit, resetAt)
 */
async function verificarRateLimit(
  context?: EmailNotificationParams['context']
): Promise<EmailRateLimitStatus> {
  try {
    const db = getDb();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Contar emails enviados en la última hora
    const lastHourSnapshot = await db
      .collection('emailLogs')
      .where('timestamp', '>=', oneHourAgo)
      .where('success', '==', true)
      .get();

    const countLastHour = lastHourSnapshot.size;

    if (countLastHour >= emailConfig.rateLimits.maxPerHour) {
      logger.warn('⚠️ Rate limit por hora excedido', {
        count: countLastHour,
        limit: emailConfig.rateLimits.maxPerHour,
        context,
      });
      
      return {
        allowed: false,
        count: countLastHour,
        limit: emailConfig.rateLimits.maxPerHour,
        resetAt: new Date(oneHourAgo.getTime() + 60 * 60 * 1000),
        reason: 'maxPerHour excedido',
      };
    }

    // Contar emails enviados en el último día
    const lastDaySnapshot = await db
      .collection('emailLogs')
      .where('timestamp', '>=', oneDayAgo)
      .where('success', '==', true)
      .get();

    const countLastDay = lastDaySnapshot.size;

    if (countLastDay >= emailConfig.rateLimits.maxPerDay) {
      logger.warn('⚠️ Rate limit diario excedido', {
        count: countLastDay,
        limit: emailConfig.rateLimits.maxPerDay,
        context,
      });
      
      return {
        allowed: false,
        count: countLastDay,
        limit: emailConfig.rateLimits.maxPerDay,
        resetAt: new Date(oneDayAgo.getTime() + 24 * 60 * 60 * 1000),
        reason: 'maxPerDay excedido',
      };
    }

    // Todo OK
    return {
      allowed: true,
      count: countLastDay,
      limit: emailConfig.rateLimits.maxPerDay,
    };
  } catch (error) {
    logger.error('❌ Error al verificar rate limit', { error, context });
    
    // En caso de error, permitir el envío (fail-safe)
    return {
      allowed: true,
      count: 0,
      limit: emailConfig.rateLimits.maxPerDay,
      reason: 'Error en verificación, permitido por fail-safe',
    };
  }
}

/**
 * Registra el envío de un email en Firestore para auditoría y rate limiting
 * 
 * @param result - Resultado del envío (success, messageId, error)
 * @param params - Parámetros originales del email
 */
async function registrarEnvio(
  result: EmailResult,
  params: EmailNotificationParams
): Promise<void> {
  try {
    const db = getDb();
    const logData: EmailLog = {
      timestamp: result.timestamp,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      priority: params.priority,
      context: params.context,
    };

    await db.collection('emailLogs').add(logData);
    
    logger.info('📝 Email registrado en Firestore', {
      success: result.success,
      messageId: result.messageId,
      to: params.to,
    });
  } catch (error) {
    // No fallar si no se puede registrar, solo loguear
    logger.error('❌ Error al registrar envío en Firestore', {
      error,
      result,
      params: {
        to: params.to,
        subject: params.subject,
      },
    });
  }
}

/**
 * FUNCIÓN PRINCIPAL: Envía un correo de notificación con rate limiting y logging automático
 * 
 * Esta función es fail-safe: nunca lanza excepciones que puedan romper el flujo principal.
 * Si hay errores, los loguea pero retorna un resultado indicando el fallo.
 * 
 * @param params - Parámetros del email (to, subject, html, etc.)
 * @returns Promise con resultado del envío (success, messageId, error)
 * 
 * @example
 * ```typescript
 * const result = await enviarCorreoNotificacion({
 *   to: ['admin@asurity.cl'],
 *   subject: 'Test',
 *   html: '<p>Hola mundo</p>',
 *   context: { traceId: '123', source: 'testFunction' }
 * });
 * 
 * if (result.success) {
 *   logger.info('Email enviado', { messageId: result.messageId });
 * } else {
 *   logger.error('Error enviando email', { error: result.error });
 * }
 * ```
 */
export async function enviarCorreoNotificacion(
  params: EmailNotificationParams
): Promise<EmailResult> {
  const timestamp = new Date();
  
  try {
    logger.info('📧 Intentando enviar correo', {
      to: params.to,
      subject: params.subject,
      context: params.context,
    });

    // 1. Verificar rate limit
    const rateLimitStatus = await verificarRateLimit(params.context);
    
    if (!rateLimitStatus.allowed) {
      const error = `Rate limit excedido: ${rateLimitStatus.reason}`;
      logger.warn('⚠️ Email no enviado por rate limit', {
        ...rateLimitStatus,
        params: { to: params.to, subject: params.subject },
      });
      
      const result: EmailResult = {
        success: false,
        error,
        timestamp,
        context: params.context,
      };
      
      await registrarEnvio(result, params);
      return result;
    }

    // 2. Combinar destinatarios: siempre incluir los globales
    const allRecipients = [
      ...(Array.isArray(params.to) ? params.to : params.to ? [params.to] : []),
      ...emailConfig.globalRecipients
    ];
    
    // Eliminar duplicados
    const uniqueRecipients = [...new Set(allRecipients)];
    
    // 3. Preparar opciones del email
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
      to: formatRecipients(uniqueRecipients),
      cc: formatRecipients(params.cc),
      bcc: formatRecipients(params.bcc),
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments,
      priority: params.priority === 'high' ? 'high' : 'normal',
    };

    // 3. Enviar email
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);
    
    logger.info('✅ Email enviado exitosamente', {
      messageId: info.messageId,
      to: uniqueRecipients,
      subject: params.subject,
      context: params.context,
    });

    const result: EmailResult = {
      success: true,
      messageId: info.messageId,
      timestamp,
      context: params.context,
    };

    // 4. Registrar en Firestore
    await registrarEnvio(result, params);

    return result;
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    
    logger.error('❌ Error al enviar email', {
      error: errorMessage,
      stack: error?.stack,
      to: params.to,
      subject: params.subject,
      context: params.context,
    });

    const result: EmailResult = {
      success: false,
      error: errorMessage,
      timestamp,
      context: params.context,
    };

    // Intentar registrar el error (fail-safe)
    try {
      await registrarEnvio(result, params);
    } catch (logError) {
      logger.error('❌ No se pudo registrar el error de envío', { logError });
    }

    return result;
  }
}

/**
 * Envía notificación de inconsistencia detectada
 * 
 * @param data - Datos de la inconsistencia
 * @param recipients - Destinatarios (por defecto usa emailConfig.defaultRecipients.alerts)
 * @returns Promise con resultado del envío
 */
export async function notificarInconsistencia(
  data: InconsistenciaTemplateData,
  recipients?: string[]
): Promise<EmailResult> {
  const template = getInconsistenciaTemplate(data);
  
  return enviarCorreoNotificacion({
    to: recipients || emailConfig.defaultRecipients.alerts,
    subject: template.subject,
    html: template.html,
    priority: 'normal',
    context: {
      source: 'notificarInconsistencia',
      shipmentId: data.shipmentId,
      metadata: { tipo: notificationTypes.INCONSISTENCIA },
    },
  });
}

/**
 * Envía notificación de consolidación exitosa
 * 
 * @param data - Datos de la consolidación
 * @param recipients - Destinatarios (por defecto usa emailConfig.defaultRecipients.alerts)
 * @returns Promise con resultado del envío
 */
export async function notificarConsolidacionExitosa(
  data: ConsolidacionExitosaTemplateData,
  recipients?: string[]
): Promise<EmailResult> {
  const template = getConsolidacionExitosaTemplate(data);
  
  return enviarCorreoNotificacion({
    to: recipients || emailConfig.defaultRecipients.alerts,
    subject: template.subject,
    html: template.html,
    priority: 'normal',
    context: {
      source: 'notificarConsolidacionExitosa',
      shipmentId: data.shipmentId,
      orderId: data.orderId,
      metadata: { tipo: notificationTypes.CONSOLIDACION_EXITOSA },
    },
  });
}

/**
 * Envía notificación de error crítico
 * 
 * @param data - Datos del error
 * @param recipients - Destinatarios (por defecto usa emailConfig.defaultRecipients.critical)
 * @returns Promise con resultado del envío
 */
export async function notificarErrorCritico(
  data: ErrorCriticoTemplateData,
  recipients?: string[]
): Promise<EmailResult> {
  const template = getErrorCriticoTemplate(data);
  
  return enviarCorreoNotificacion({
    to: recipients || emailConfig.defaultRecipients.critical,
    subject: template.subject,
    html: template.html,
    priority: 'high',
    context: {
      source: data.source || 'notificarErrorCritico',
      shipmentId: data.shipmentId,
      metadata: { tipo: notificationTypes.ERROR_CRITICO },
    },
  });
}

/**
 * Envía reporte diario con estadísticas
 * 
 * @param data - Estadísticas del día
 * @param recipients - Destinatarios (por defecto usa emailConfig.defaultRecipients.reports)
 * @returns Promise con resultado del envío
 */
export async function enviarReporteDiario(
  data: ReporteDiarioTemplateData,
  recipients?: string[]
): Promise<EmailResult> {
  const template = getReporteDiarioTemplate(data);
  
  return enviarCorreoNotificacion({
    to: recipients || emailConfig.defaultRecipients.reports,
    subject: template.subject,
    html: template.html,
    priority: 'normal',
    context: {
      source: 'enviarReporteDiario',
      metadata: {
        tipo: notificationTypes.REPORTE_DIARIO,
        fecha: data.fecha.toISOString(),
      },
    },
  });
}

/**
 * Envía notificación genérica personalizada
 * 
 * @param data - Datos del mensaje
 * @param recipients - Destinatarios
 * @param priority - Prioridad del email (normal o high)
 * @returns Promise con resultado del envío
 */
export async function enviarNotificacionGenerica(
  data: GenericTemplateData,
  recipients: string[],
  priority: 'normal' | 'high' = 'normal'
): Promise<EmailResult> {
  const template = getGenericTemplate(data);
  
  return enviarCorreoNotificacion({
    to: recipients,
    subject: template.subject,
    html: template.html,
    priority,
    context: {
      source: 'enviarNotificacionGenerica',
      metadata: { tipo: notificationTypes.CUSTOM },
    },
  });
}
