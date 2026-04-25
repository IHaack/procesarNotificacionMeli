import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

initializeApp();

const db = getFirestore();

async function getValidAccessToken() {
  const configRef = db.collection('oAuthResponses').doc('UXzSDkmBSknCwKlMxcUP');
  const doc = await configRef.get();
  if (!doc.exists) {
    throw new Error('Access token not found in Firestore');
  }
  const data = doc.data();
  return data?.access_token;
}

async function fetchShipmentDetails(shipmentId: string) {
  const accessToken = await getValidAccessToken();

  const url = `https://api.mercadolibre.com/shipments/${shipmentId}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'x-format-new': 'true'
  };

  console.log(`📡 Consultando shipment ${shipmentId} en MELI API...`);

  try {
    const response = await axios.get(url, { headers });
    const shipment = response.data;

    console.log(`✅ Shipment obtenido. Status: ${shipment.status}`);
    console.log(`📍 Logistic Type: ${shipment.logistic?.type}`);

    console.log(`\n🏠 DIRECCIONES:`);

    if (shipment.destination?.shipping_address) {
      console.log(`   ✅ destination.shipping_address existe:`);
      console.log(`      - City: "${shipment.destination.shipping_address.city?.name}"`);
      console.log(`      - State: "${shipment.destination.shipping_address.state?.name}"`);
      console.log(`      - Country: "${shipment.destination.shipping_address.country?.name}"`);
      console.log(`      - Address Line: "${shipment.destination.shipping_address.address_line}"`);
    } else {
      console.log(`   ❌ destination.shipping_address: NO EXISTE o es null`);
    }

    if (shipment.receiver_address) {
      console.log(`   ✅ receiver_address existe (fallback):`);
      console.log(`      - City: "${shipment.receiver_address.city?.name}"`);
      console.log(`      - State: "${shipment.receiver_address.state?.name}"`);
      console.log(`      - Country: "${shipment.receiver_address.country?.name}"`);
      console.log(`      - Address Line: "${shipment.receiver_address.address_line}"`);
    } else {
      console.log(`   ❌ receiver_address: NO EXISTE o es null`);
    }

    return shipment;
  } catch (error) {
    console.error(`❌ Error consultando shipment ${shipmentId}:`, (error as Error).message);
    throw error;
  }
}

const shipmentId = process.argv[2] || '46928211237';
fetchShipmentDetails(shipmentId).catch(console.error);