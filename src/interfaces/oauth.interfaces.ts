import { Timestamp } from "firebase-admin/firestore";

/**
 * @interface OAuthResponseDocument
 * @description Define la estructura de un documento para almacenar las respuestas de un flujo de autenticación OAuth 2.0.
 *              Este documento guarda las credenciales necesarias para interactuar con una API externa de forma segura.
 * @property {string} access_token - El token de acceso utilizado para autenticar las solicitudes a la API en nombre de un usuario.
 * @property {string} aplicacion - Identifica la aplicación cliente que solicitó la autenticación.
 * @property {number} expires_in - El tiempo de vida del `access_token` en segundos, a partir del momento en que fue otorgado.
 * @property {Timestamp} fechaHoraDeEjecucion - La fecha y hora exactas en que se recibió la respuesta y se guardó el token.
 * @property {string} refresh_token - El token utilizado para obtener un nuevo `access_token` una vez que el actual ha expirado, sin necesidad de que el usuario vuelva a iniciar sesión.
 * @property {string} scope - Define el alcance o los permisos que el `access_token` tiene sobre la API.
 * @property {string} token_type - El tipo de token. Generalmente es "Bearer".
 * @property {number} user_id - El identificador del usuario al que pertenecen estas credenciales.
 */
export interface OAuthResponseDocument {
  access_token: string;
  aplicacion: string;
  expires_in: number;
  // Se almacena la fecha de ejecución para poder calcular la fecha de expiración real del token.
  // La fecha de expiración se calcula sumando 'expires_in' (en segundos) a este timestamp.
  fechaHoraDeEjecucion: Timestamp;
  refresh_token: string;
  scope: string;
  token_type: string;
  user_id: number;
  // TODO: Añadir un campo 'last_used_at' (Timestamp) para auditar cuándo se utilizó el token por última vez.
  // Esto podría ayudar a identificar tokens inactivos que podrían ser revocados o eliminados por seguridad.
}