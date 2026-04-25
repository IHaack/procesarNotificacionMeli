import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

const db = getFirestore();

async function checkRecentOrders() {
  console.log('🔍 Consultando pedidos recientes en Firestore...');

  const pedidosRef = db.collection('PedidosBS');
  const query = pedidosRef
    .orderBy('FechaOriginalPedido', 'desc')
    .limit(10);

  const snapshot = await query.get();

  console.log(`📊 Encontrados ${snapshot.size} pedidos recientes:`);

  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`\n📦 Pedido ID: ${doc.id}`);
    console.log(`   Fecha: ${data.FechaOriginalPedido?.toDate?.()?.toISOString() || 'N/A'}`);
    console.log(`   Comuna: "${data.Comuna}"`);
    console.log(`   Region: "${data.Region}"`);
    console.log(`   Domicilio: "${data.Domicilio}"`);
    console.log(`   Tipo: ${data.TipoDePedido}`);
    console.log(`   Estado Interno: ${data.estadoInterno}`);
  });
}

checkRecentOrders().catch(console.error);