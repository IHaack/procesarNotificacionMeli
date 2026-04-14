/**
 * @fileoverview Interfaces TypeScript para el sistema de notificaciones por correo electrónico
 * 
 * Define los tipos y estructuras de datos utilizados en el servicio de email.
 */

/**
 * Parámetros para enviar una notificación por correo electrónico
 */
export interface EmailNotificationParams {
  // === Destinatarios ===
  /** Destinatario(s) principal(es). Puede ser un email o array de emails */
  to: string | string[];
  
  /** Destinatario(s) en copia (opcional) */
  cc?: string | string[];
  
  /** Destinatario(s) en copia oculta (opcional) */
  bcc?: string | string[];
  
  // === Contenido ===
  /** Asunto del correo */
  subject: string;
  
  /** Contenido en texto plano (opcional, recomendado como fallback) */
  text?: string;
  
  /** Contenido en HTML (opcional, recomendado para formato visual) */
  html?: string;
  
  // === Adjuntos ===
  /** Lista de archivos adjuntos (opcional) */
  attachments?: EmailAttachment[];
  
  // === Prioridad ===
  /** Prioridad del correo (default: normal) */
  priority?: 'high' | 'normal' | 'low';
  
  // === Contexto ===
  /** Información de contexto para logging y trazabilidad (opcional) */
  context?: EmailContext;
}

/**
 * Estructura de un archivo adjunto
 */
export interface EmailAttachment {
  /** Nombre del archivo */
  filename: string;
  
  /** Contenido del archivo (string o Buffer) */
  content?: string | Buffer;
  
  /** Ruta al archivo (alternativa a content) */
  path?: string;
  
  /** Tipo MIME del archivo */
  contentType?: string;
  
  /** Encoding del contenido (default: utf-8) */
  encoding?: string;
  
  /** Content-ID para referenciar en HTML (ej: <img src="cid:logo">) */
  cid?: string;
}

/**
 * Información de contexto para logging y trazabilidad
 */
export interface EmailContext {
  /** ID de trazabilidad para correlacionar logs */
  traceId?: string;
  
  /** Función o módulo origen de la notificación */
  source?: string;
  
  /** ID del shipment relacionado (si aplica) */
  shipmentId?: string;
  
  /** ID de la order relacionada (si aplica) */
  orderId?: string;
  
  /** Datos adicionales para logging */
  metadata?: Record<string, any>;
}

/**
 * Resultado del envío de un correo electrónico
 */
export interface EmailResult {
  /** Indica si el envío fue exitoso */
  success: boolean;
  
  /** ID del mensaje asignado por el servidor SMTP (si exitoso) */
  messageId?: string;
  
  /** Mensaje de error (si falló) */
  error?: string;
  
  /** Timestamp del envío */
  timestamp: Date;
  
  /** Contexto asociado al envío (para trazabilidad) */
  context?: EmailContext;
}

/**
 * Estado del rate limit para el servicio de correo
 */
export interface EmailRateLimitStatus {
  /** Indica si se permite enviar un correo */
  allowed: boolean;
  
  /** Cantidad de correos enviados en el periodo actual */
  count: number;
  
  /** Límite máximo de correos permitidos */
  limit: number;
  
  /** Timestamp cuando se reinicia el contador (opcional, solo si allowed es false) */
  resetAt?: Date;
  
  /** Razón del bloqueo (si allowed es false) */
  reason?: string;
}

/**
 * Registro de envío de correo (para Firestore)
 */
export interface EmailLog {
  /** ID del mensaje asignado por el servidor SMTP */
  messageId?: string;
  
  /** Destinatario(s) del correo */
  to: string | string[];
  
  /** Destinatario(s) en copia (opcional) */
  cc?: string | string[];
  
  /** Destinatario(s) en copia oculta (opcional) */
  bcc?: string | string[];
  
  /** Asunto del correo */
  subject: string;
  
  /** Indica si el envío fue exitoso */
  success: boolean;
  
  /** Mensaje de error (si falló) */
  error?: string | null;
  
  /** Prioridad del correo */
  priority?: 'high' | 'normal' | 'low';
  
  /** Contexto del envío */
  context?: EmailContext;
  
  /** Timestamp del envío (Date se convierte automáticamente a Timestamp por Firestore) */
  timestamp: Date | FirebaseFirestore.Timestamp;
}

/**
 * Datos para template de inconsistencia
 */
export interface InconsistenciaTemplateData {
  shipmentId: string;
  mensaje: string;
  ordenesEsperadas?: number;
  ordenesEncontradas?: number;
  idsFaltantes?: string[];
}

/**
 * Datos para template de consolidación exitosa
 */
export interface ConsolidacionExitosaTemplateData {
  shipmentId: string;
  orderId?: string;
  automatic?: boolean;
}

/**
 * Datos para template de error crítico
 */
export interface ErrorCriticoTemplateData {
  errorMessage: string;
  errorStack?: string;
  source?: string;
  shipmentId?: string;
  timestamp?: Date;
}

/**
 * Datos para template de reporte diario
 */
export interface ReporteDiarioTemplateData {
  fecha: Date;
  pedidosProcesados: number;
  consolidacionesAutomaticas: number;
  inconsistenciasPendientes: number;
  erroresTotales: number;
}

/**
 * Datos para template genérico
 */
export interface GenericTemplateData {
  title: string;
  message: string;
  details?: Array<{ label: string; value: string }>;
  type?: 'info' | 'success' | 'alert' | 'error';
}

/**
 * Resultado de un template (subject + html)
 */
export interface TemplateResult {
  subject: string;
  html: string;
  text?: string;  // Versión texto plano (opcional)
}
