/**
 * @fileoverview Script para corregir los campos de dirección en los pedidos de la colección PedidosBS.
 *
 * Busca documentos con Domicilio, Comuna o Region igual a "No especificada" y los actualiza usando
 * la información de `destination.shipping_address` o `receiver_address` obtenida desde la API de MELI.
 *
 * Uso:
 *   npx ts-node scripts/fix-pedidos-direccion.ts
 *
 * Opciones:
 *   --dry-run           Solo listar los documentos afectados sin aplicar cambios.
 *   --limit=<n>         Limitar el número de documentos procesados.
 *   --shipment=<id>     Procesar solo un shipment específico.
 *   --shipments=<ids>   Procesar una lista de shipment IDs separados por coma.
 *   --file=<ruta>       Procesar shipment IDs listados en un archivo de texto (uno por línea).
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { fetchShipmentDetails } from "../src/services/meli.services";
import { firestoreCollections } from "../src/config/config";
import fs from "fs";
import path from "path";

initializeApp();
const db = getFirestore();

interface ResultSummary {
  totalCandidates: number;
  updated: number;
  skipped: number;
  errors: Array<{ shipmentId: string; error: string }>;
}

function parseArguments() {
  const args = process.argv.slice(2);
  const shipmentArg = args.find((arg) => arg.startsWith("--shipment="));
  const shipmentsArg = args.find((arg) => arg.startsWith("--shipments="));
  const fileArg = args.find((arg) => arg.startsWith("--file="));

  return {
    dryRun: args.includes("--dry-run"),
    shipmentId: shipmentArg?.split("=")[1] || null,
    shipmentIds: shipmentsArg
      ? shipmentsArg
          .split("=")[1]
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : null,
    filePath: fileArg?.split("=")[1] || null,
    limit: Number(args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "0"),
  };
}

function normalizeAddress(address: any) {
  if (!address) {
    return null;
  }

  const domicilio =
    address.address_line?.trim() ||
    [address.street_name, address.street_number].filter(Boolean).join(" ").trim() ||
    null;

  const comuna = address.city?.name?.trim() || null;
  const region = address.state?.name?.trim() || null;
  const pais = address.country?.name?.trim() || null;

  return {
    domicilio: domicilio || "No especificada",
    comuna: comuna || "No especificada",
    region: region || "No especificada",
    pais: pais || "Chile",
  };
}

async function readShipmentIdsFromFile(filePath: string) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function findCandidates(
  shipmentId: string | null,
  shipmentIds: string[] | null,
  filePath: string | null,
  limit: number
) {
  if (shipmentId) {
    const doc = await db.collection(firestoreCollections.processedOrders).doc(shipmentId).get();
    return doc.exists ? [doc] : [];
  }

  if (shipmentIds && shipmentIds.length > 0) {
    const docs = await Promise.all(
      shipmentIds.map(async (id) => db.collection(firestoreCollections.processedOrders).doc(id).get())
    );
    return docs.filter((doc) => doc.exists).slice(0, limit > 0 ? limit : undefined);
  }

  if (filePath) {
    const idsFromFile = await readShipmentIdsFromFile(filePath);
    const docs = await Promise.all(
      idsFromFile.map(async (id) => db.collection(firestoreCollections.processedOrders).doc(id).get())
    );
    return docs.filter((doc) => doc.exists).slice(0, limit > 0 ? limit : undefined);
  }

  const candidatesMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const fieldsToCheck = ["Domicilio", "Comuna", "Region"];

  for (const field of fieldsToCheck) {
    const snapshot = await db
      .collection(firestoreCollections.processedOrders)
      .where(field, "==", "No especificada")
      .get();

    snapshot.docs.forEach((doc) => {
      if (!candidatesMap.has(doc.id)) {
        candidatesMap.set(doc.id, doc);
      }
    });

    if (limit > 0 && candidatesMap.size >= limit) {
      break;
    }
  }

  const docs = Array.from(candidatesMap.values());
  return limit > 0 ? docs.slice(0, limit) : docs;
}

async function run() {
  const { dryRun, shipmentId, shipmentIds, filePath, limit } = parseArguments();
  console.log("🔧 Script de corrección de direcciones para PedidosBS");
  console.log(`🔍 Modo: ${dryRun ? "dry-run" : "actualización"}`);
  if (shipmentId) {
    console.log(`📦 Shipment específico: ${shipmentId}`);
  }
  if (shipmentIds && shipmentIds.length > 0) {
    console.log(`📦 Lista de shipments: ${shipmentIds.join(",")}`);
  }
  if (filePath) {
    console.log(`📄 Archivo de shipments: ${filePath}`);
  }
  if (limit > 0) {
    console.log(`⏱️ Límite de documentos: ${limit}`);
  }

  try {
    const candidates = await findCandidates(shipmentId, shipmentIds, filePath, limit);
    const summary: ResultSummary = {
      totalCandidates: candidates.length,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    if (candidates.length === 0) {
      console.log("✅ No se encontraron documentos coincidientes en PedidosBS.");
      return;
    }

    console.log(`📄 Documentos encontrados: ${candidates.length}\n`);

    for (const doc of candidates) {
      const shipmentIdDoc = doc.id;
      const data = doc.data() as Record<string, any>;
      console.log(`-----------------------------`);
      console.log(`Shipment ID: ${shipmentIdDoc}`);
      console.log(`Domicilio actual: ${data.Domicilio}`);
      console.log(`Comuna actual: ${data.Comuna}`);
      console.log(`Region actual: ${data.Region}`);

      try {
        const shipment = await fetchShipmentDetails(Number(shipmentIdDoc), `fix-pedidos-direccion-${shipmentIdDoc}`);
        const addressSource = shipment.destination?.shipping_address || shipment.receiver_address;
        const normalized = normalizeAddress(addressSource);

        if (!normalized) {
          console.log(`   ⚠️ No se encontró una dirección válida en el shipment MELI.`);
          summary.skipped += 1;
          continue;
        }

        const updates: Record<string, any> = {
          Domicilio: normalized.domicilio,
          Comuna: normalized.comuna,
          Region: normalized.region,
          Pais: normalized.pais,
        };

        const needsUpdate =
          data.Domicilio !== updates.Domicilio ||
          data.Comuna !== updates.Comuna ||
          data.Region !== updates.Region ||
          data.Pais !== updates.Pais;

        console.log(`   Dirección resuelta:`);
        console.log(`     Domicilio: ${updates.Domicilio}`);
        console.log(`     Comuna: ${updates.Comuna}`);
        console.log(`     Region: ${updates.Region}`);
        console.log(`     Pais: ${updates.Pais}`);

        if (!needsUpdate) {
          console.log(`   ℹ️ No se requiere actualización para este documento.`);
          summary.skipped += 1;
          continue;
        }

        if (!dryRun) {
          await doc.ref.update({
            ...updates,
            direccion_corregida_por_script: true,
            direccion_corregida_en: Timestamp.now(),
          });
          console.log(`   ✅ Documento actualizado.`);
          summary.updated += 1;
        } else {
          console.log(`   🔎 Dry run: no se aplicaron cambios.`);
          summary.updated += 1;
        }
      } catch (error) {
        const err = error as Error;
        console.error(`   ❌ Error al procesar shipment ${shipmentIdDoc}: ${err.message}`);
        summary.errors.push({ shipmentId: shipmentIdDoc, error: err.message });
      }
    }

    console.log(`\n✅ Resumen final:`);
    console.log(`   Documentos evaluados: ${summary.totalCandidates}`);
    console.log(`   Documentos actualizados: ${summary.updated}`);
    console.log(`   Documentos omitidos: ${summary.skipped}`);
    console.log(`   Errores: ${summary.errors.length}`);

    if (summary.errors.length > 0) {
      console.log(`\n📌 Errores:`);
      summary.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. Shipment ${error.shipmentId}: ${error.error}`);
      });
    }
  } catch (error) {
    console.error("❌ Error crítico durante la ejecución:", (error as Error).message);
    process.exit(1);
  }
}

run().then(() => process.exit(0));
