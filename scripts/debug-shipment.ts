import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

const db = getFirestore();

async function checkShipmentDetails(shipmentId: string) {
  console.log(`🔍 Consultando detalles del shipment ${shipmentId}...`);

  // Primero verificar si existe el pedido
  const pedidoRef = db.collection('PedidosBS').doc(shipmentId);
  const pedidoDoc = await pedidoRef.get();

  if (pedidoDoc.exists) {
    const pedidoData = pedidoDoc.data();
    console.log(`📦 Pedido encontrado:`);
    console.log(`   Comuna: "${pedidoData?.Comuna}"`);
    console.log(`   Region: "${pedidoData?.Region}"`);
    console.log(`   Domicilio: "${pedidoData?.Domicilio}"`);
    console.log(`   Tipo: ${pedidoData?.TipoDePedido}`);
  } else {
    console.log(`❌ Pedido ${shipmentId} no encontrado en Firestore`);
  }

  // Ahora verificar el shipment en la colección de notificaciones
  const notifRef = db.collection('meli_notifications');
  const notifQuery = notifRef
    .where('resource', '==', `/shipments/${shipmentId}`)
    .orderBy('timestamp', 'desc')
    .limit(1);

  const notifSnapshot = await notifQuery.get();

  if (!notifSnapshot.empty) {
    const notifDoc = notifSnapshot.docs[0];
    const notifData = notifDoc.data();
    console.log(`\n📡 Notificación encontrada:`);
    console.log(`   Estado: ${notifData.status}`);
    console.log(`   Timestamp: ${notifData.timestamp?.toDate?.()?.toISOString()}`);
  } else {
    console.log(`❌ Notificación para shipment ${shipmentId} no encontrada`);
  }
}

const shipmentId = process.argv[2] || '46928211237';
checkShipmentDetails(shipmentId).catch(console.error);