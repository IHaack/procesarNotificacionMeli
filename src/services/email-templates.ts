/**
 * @fileoverview Templates HTML reutilizables para notificaciones por correo electrónico
 * 
 * Contiene templates predefinidos con estilos corporativos para diferentes tipos de alertas.
 */

import {
  TemplateResult,
  InconsistenciaTemplateData,
  ConsolidacionExitosaTemplateData,
  ErrorCriticoTemplateData,
  ReporteDiarioTemplateData,
  GenericTemplateData,
} from '../interfaces/email.interfaces';

/**
 * Template base con estilos corporativos de Andina Grains
 * Todos los templates específicos usan esta base para mantener consistencia visual
 * 
 * @param content - Contenido HTML interno del correo
 * @param title - Título para el tag <title> del HTML
 * @returns HTML completo con estructura base
 */
export function getBaseTemplate(content: string, title: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #2c5282;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }
    .header h1 {
      margin: 0;
      color: #2c5282;
      font-size: 24px;
    }
    .content {
      margin-bottom: 25px;
    }
    .alert {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .error {
      background-color: #f8d7da;
      border-left: 4px solid #dc3545;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .success {
      background-color: #d4edda;
      border-left: 4px solid #28a745;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info {
      background-color: #d1ecf1;
      border-left: 4px solid #17a2b8;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .details {
      background-color: #f8f9fa;
      border-radius: 4px;
      padding: 15px;
      margin: 15px 0;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #dee2e6;
    }
    .details-row:last-child {
      border-bottom: none;
    }
    .label {
      font-weight: bold;
      color: #495057;
    }
    .value {
      color: #212529;
      text-align: right;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #dee2e6;
      font-size: 12px;
      color: #6c757d;
      text-align: center;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #2c5282;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 4px;
      margin: 15px 0;
    }
    pre {
      background: #f8f9fa;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 11px;
      font-family: 'Courier New', Courier, monospace;
    }
    h2 {
      margin-top: 0;
      color: #2c5282;
    }
    p {
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌾 Andina Grains</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Este es un mensaje automático del sistema de alertas de Andina Grains.</p>
      <p>Por favor no responder a este correo.</p>
      <p>&copy; ${new Date().getFullYear()} Asurity SpA. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Template para notificar inconsistencias detectadas en el procesamiento
 * 
 * @param data - Datos de la inconsistencia (shipmentId, mensaje, orders esperadas/encontradas)
 * @returns Objeto con subject y html del correo
 */
export function getInconsistenciaTemplate(
  data: InconsistenciaTemplateData
): TemplateResult {
  const content = `
    <div class="alert">
      <h2>🚨 Inconsistencia Detectada</h2>
    </div>
    
    <p>Se ha detectado una inconsistencia en el procesamiento de un envío que requiere atención.</p>
    
    <div class="details">
      <div class="details-row">
        <span class="label">Shipment ID:</span>
        <span class="value">${data.shipmentId}</span>
      </div>
      <div class="details-row">
        <span class="label">Mensaje:</span>
        <span class="value">${data.mensaje}</span>
      </div>
      ${data.ordenesEsperadas !== undefined ? `
      <div class="details-row">
        <span class="label">Orders esperadas:</span>
        <span class="value">${data.ordenesEsperadas}</span>
      </div>
      ` : ''}
      ${data.ordenesEncontradas !== undefined ? `
      <div class="details-row">
        <span class="label">Orders encontradas:</span>
        <span class="value">${data.ordenesEncontradas}</span>
      </div>
      ` : ''}
      ${data.idsFaltantes && data.idsFaltantes.length > 0 ? `
      <div class="details-row">
        <span class="label">IDs faltantes:</span>
        <span class="value">${data.idsFaltantes.join(', ')}</span>
      </div>
      ` : ''}
    </div>
    
    <div class="info">
      <p><strong>ℹ️ Acción automática:</strong></p>
      <p>El sistema reintentará automáticamente la consolidación cuando las orders faltantes lleguen al sistema.</p>
      <p>No se requiere acción manual a menos que el problema persista por más de 24 horas.</p>
    </div>
  `;
  
  return {
    subject: `🚨 Inconsistencia detectada - Shipment ${data.shipmentId}`,
    html: getBaseTemplate(content, 'Inconsistencia Detectada'),
  };
}

/**
 * Template para notificar consolidaciones exitosas de pedidos
 * 
 * @param data - Datos de la consolidación (shipmentId, orderId, si fue automática)
 * @returns Objeto con subject y html del correo
 */
export function getConsolidacionExitosaTemplate(
  data: ConsolidacionExitosaTemplateData
): TemplateResult {
  const content = `
    <div class="success">
      <h2>✅ Consolidación Exitosa</h2>
    </div>
    
    <p>El pedido ha sido consolidado correctamente y está listo para su procesamiento.</p>
    
    <div class="details">
      <div class="details-row">
        <span class="label">Shipment ID:</span>
        <span class="value">${data.shipmentId}</span>
      </div>
      ${data.orderId ? `
      <div class="details-row">
        <span class="label">Order ID:</span>
        <span class="value">${data.orderId}</span>
      </div>
      ` : ''}
      ${data.automatic ? `
      <div class="details-row">
        <span class="label">Tipo de consolidación:</span>
        <span class="value">🤖 Automática</span>
      </div>
      ` : ''}
    </div>
    
    ${data.automatic ? `
    <div class="info">
      <p><strong>ℹ️ Consolidación automática:</strong></p>
      <p>El sistema detectó que una order llegó tarde y consolidó automáticamente el envío sin requerir intervención manual.</p>
    </div>
    ` : ''}
  `;
  
  return {
    subject: `✅ Consolidación exitosa - Shipment ${data.shipmentId}`,
    html: getBaseTemplate(content, 'Consolidación Exitosa'),
  };
}

/**
 * Template para notificar errores críticos que requieren atención inmediata
 * 
 * @param data - Datos del error (mensaje, stack trace, función origen)
 * @returns Objeto con subject y html del correo
 */
export function getErrorCriticoTemplate(
  data: ErrorCriticoTemplateData
): TemplateResult {
  const content = `
    <div class="error">
      <h2>🔴 Error Crítico en el Sistema</h2>
    </div>
    
    <p><strong>Se ha detectado un error crítico que requiere atención inmediata del equipo técnico.</strong></p>
    
    <div class="details">
      ${data.source ? `
      <div class="details-row">
        <span class="label">Función:</span>
        <span class="value">${data.source}</span>
      </div>
      ` : ''}
      ${data.shipmentId ? `
      <div class="details-row">
        <span class="label">Shipment ID:</span>
        <span class="value">${data.shipmentId}</span>
      </div>
      ` : ''}
      <div class="details-row">
        <span class="label">Mensaje de error:</span>
        <span class="value">${data.errorMessage}</span>
      </div>
      ${data.timestamp ? `
      <div class="details-row">
        <span class="label">Fecha/Hora:</span>
        <span class="value">${data.timestamp.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</span>
      </div>
      ` : ''}
    </div>
    
    ${data.errorStack ? `
    <div class="details">
      <p class="label">Stack Trace:</p>
      <pre>${data.errorStack}</pre>
    </div>
    ` : ''}
    
    <div class="error">
      <p><strong>⚠️ Acción requerida:</strong></p>
      <ul>
        <li>Revisar los logs de Firebase Console para más detalles</li>
        <li>Verificar el estado del sistema</li>
        <li>Investigar y corregir la causa raíz</li>
      </ul>
    </div>
  `;
  
  return {
    subject: `🔴 ERROR CRÍTICO - ${data.source || 'Sistema'}`,
    html: getBaseTemplate(content, 'Error Crítico'),
  };
}

/**
 * Template para reportes diarios con estadísticas del sistema
 * 
 * @param data - Estadísticas del día (pedidos procesados, consolidaciones, inconsistencias, errores)
 * @returns Objeto con subject y html del correo
 */
export function getReporteDiarioTemplate(
  data: ReporteDiarioTemplateData
): TemplateResult {
  const fechaFormateada = data.fecha.toLocaleDateString('es-CL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const content = `
    <div class="info">
      <h2>📊 Reporte Diario del Sistema</h2>
    </div>
    
    <p>Resumen de actividad del <strong>${fechaFormateada}</strong>.</p>
    
    <div class="details">
      <div class="details-row">
        <span class="label">✅ Pedidos procesados:</span>
        <span class="value" style="font-size: 18px; font-weight: bold; color: #28a745;">${data.pedidosProcesados}</span>
      </div>
      <div class="details-row">
        <span class="label">🤖 Consolidaciones automáticas:</span>
        <span class="value" style="font-size: 18px; font-weight: bold; color: #17a2b8;">${data.consolidacionesAutomaticas}</span>
      </div>
      <div class="details-row">
        <span class="label">⚠️ Inconsistencias pendientes:</span>
        <span class="value" style="font-size: 18px; font-weight: bold; color: #ffc107;">${data.inconsistenciasPendientes}</span>
      </div>
      <div class="details-row">
        <span class="label">🔴 Errores totales:</span>
        <span class="value" style="font-size: 18px; font-weight: bold; color: #dc3545;">${data.erroresTotales}</span>
      </div>
    </div>
    
    ${data.erroresTotales === 0 && data.inconsistenciasPendientes === 0 ? `
    <div class="success">
      <p><strong>🎉 Sistema funcionando correctamente</strong></p>
      <p>No hay errores ni inconsistencias pendientes. Todos los pedidos se procesaron sin problemas.</p>
    </div>
    ` : ''}
    
    ${data.inconsistenciasPendientes > 5 ? `
    <div class="alert">
      <p><strong>⚠️ Atención requerida:</strong></p>
      <p>Hay ${data.inconsistenciasPendientes} inconsistencias pendientes. Se recomienda revisar la cola de revisión.</p>
    </div>
    ` : ''}
    
    ${data.erroresTotales > 0 ? `
    <div class="error">
      <p><strong>⚠️ Errores detectados:</strong></p>
      <p>Se registraron ${data.erroresTotales} error(es) durante el día. Revisar logs para más detalles.</p>
    </div>
    ` : ''}
  `;
  
  return {
    subject: `📊 Reporte Diario - ${data.fecha.toLocaleDateString('es-CL')}`,
    html: getBaseTemplate(content, 'Reporte Diario'),
  };
}

/**
 * Template genérico personalizable para mensajes custom
 * 
 * @param data - Datos del mensaje (título, mensaje, detalles opcionales, tipo)
 * @returns Objeto con subject y html del correo
 */
export function getGenericTemplate(data: GenericTemplateData): TemplateResult {
  const typeClass = data.type || 'info';
  const typeEmoji = {
    info: 'ℹ️',
    success: '✅',
    alert: '⚠️',
    error: '🔴',
  };
  
  const content = `
    <div class="${typeClass}">
      <h2>${typeEmoji[typeClass]} ${data.title}</h2>
    </div>
    
    <p>${data.message}</p>
    
    ${data.details && data.details.length > 0 ? `
    <div class="details">
      ${data.details.map(detail => `
        <div class="details-row">
          <span class="label">${detail.label}:</span>
          <span class="value">${detail.value}</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
  `;
  
  return {
    subject: data.title,
    html: getBaseTemplate(content, data.title),
  };
}
