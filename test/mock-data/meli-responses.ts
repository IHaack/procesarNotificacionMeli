/**
 * @fileoverview Datos reales de MELI para testing y simulación
 * 
 * Este archivo contiene respuestas reales de la API de MercadoLibre
 * para usar en tests y scripts de simulación sin necesidad de llamar
 * a las APIs reales.
 * 
 * IMPORTANTE: Los datos sensibles (teléfonos, direcciones) están marcados
 * como XXXXXXX por privacidad.
 */

// ============================================================================
// SHIPMENT: 45848383497
// ============================================================================

export const SHIPMENT_45848383497 = {
  "substatus_history": [
    {
      "date": "2025-11-11T12:31:25.065-04:00",
      "substatus": "shipment_paid",
      "status": "pending"
    }
  ],
  "snapshot_packing": {
    "snapshot_id": "06e57f4f-9ecd-4d6e-a0ed-e0d6a8f3a0ea",
    "pack_hash": "2"
  },
  "receiver_id": 220993277,
  "base_cost": 2890,
  "status_history": {
    "date_shipped": "2025-11-12T13:28:52.000-04:00",
    "date_returned": null,
    "date_delivered": null,
    "date_first_visit": null,
    "date_not_delivered": null,
    "date_cancelled": null,
    "date_handling": "2025-11-11T12:31:36.000-04:00",
    "date_ready_to_ship": "2025-11-11T12:31:37.678-04:00"
  },
  "type": "forward",
  "return_details": null,
  "sender_id": 454112654,
  "mode": "me2",
  "order_cost": 52240,
  "priority_class": {
    "id": null
  },
  "service_id": 243981,
  "shipping_items": [
    {
      "quantity": 1,
      "dimensions_source": {
        "origin": "similarity",
        "id": "MLC2401498834__1"
      },
      "description": "24-pack Agua De Coco Natural B Organics 520ml Andina Grains",
      "id": "MLC2401498834",
      "bundle": null,
      "user_product_id": "MLCU362317831",
      "sender_id": 454112654,
      "dimensions": "10.0x26.0x28.0,765.0"
    }
  ],
  "tracking_number": "45848383497",
  "cost_components": {
    "loyal_discount": 0,
    "special_discount": 0,
    "compensation": 0,
    "gap_discount": 0,
    "ratio": 5491
  },
  "id": 45848383497,
  "tracking_method": "ANDINAGRAINS Super Express",
  "last_updated": "2025-11-12T13:28:55.577-04:00",
  "items_types": [
    "new"
  ],
  "comments": null,
  "substatus": "out_for_delivery",
  "date_created": "2025-11-11T12:31:23.477-04:00",
  "date_first_printed": "2025-11-11T12:31:41.282-04:00",
  "created_by": "receiver",
  "application_id": null,
  "shipping_option": {
    "processing_time": null,
    "cost": 0,
    "estimated_schedule_limit": {
      "date": null
    },
    "shipping_method_id": 512745,
    "estimated_delivery_final": {
      "date": "2025-11-12T00:00:00.000-03:00"
    },
    "buffering": {
      "date": null
    },
    "desired_promised_delivery": {
      "from": null
    },
    "pickup_promise": {
      "from": null,
      "to": null
    },
    "list_cost": 2601,
    "estimated_delivery_limit": {
      "date": "2025-11-12T00:00:00.000-03:00"
    },
    "priority_class": {
      "id": null
    },
    "delivery_promise": "estimated",
    "delivery_type": "estimated",
    "estimated_delivery_time": {
      "date": "2025-11-12T00:00:00.000-03:00",
      "pay_before": "2025-11-11T14:00:00.000-03:00",
      "schedule": null,
      "unit": "hour",
      "offset": {
        "date": null,
        "shipping": null
      },
      "shipping": 0,
      "time_frame": {
        "from": null,
        "to": null
      },
      "handling": 0,
      "type": "known"
    },
    "name": "Prioritario a domicilio",
    "id": 1144678442,
    "estimated_delivery_extended": {
      "date": "2025-11-12T00:00:00.000-03:00"
    },
    "currency_id": "CLP"
  },
  "tags": [],
  "sender_address": {
    "country": {
      "id": "CL",
      "name": "Chile"
    },
    "city": {
      "id": "TUxDQ9FV0WU0MmM2",
      "name": "Ñuñoa"
    },
    "geolocation_type": "ROOFTOP",
    "latitude": 0,
    "municipality": {
      "id": null,
      "name": null
    },
    "location_id": null,
    "street_name": "XXXXXXX",
    "zip_code": null,
    "intersection": null,
    "id": null,
    "state": {
      "id": "CL-RM",
      "name": "RM (Metropolitana)"
    },
    "longitude": 0,
    "address_line": "XXXXXXX",
    "types": [
      "logistic_center_CLP4541126541",
      "self_service_partner"
    ],
    "scoring": null,
    "agency": null,
    "version": null,
    "geolocation_source": null,
    "node": {
      "logistic_center_id": "CLP4541126541",
      "node_id": "CLP4541126541"
    },
    "street_number": "XXXXXXX",
    "comment": "XXXXXXX",
    "neighborhood": {
      "id": null,
      "name": "Ñuñoa"
    },
    "geolocation_last_updated": null
  },
  "sibling": {
    "reason": null,
    "sibling_id": null,
    "description": null,
    "source": null,
    "date_created": null,
    "last_updated": null
  },
  "return_tracking_number": null,
  "site_id": "MLC",
  "carrier_info": null,
  "market_place": "MELI",
  "receiver_address": {
    "country": {
      "id": "CL",
      "name": "Chile"
    },
    "city": {
      "id": "TUxDQ9FV0WU0MmM2",
      "name": "Ñuñoa"
    },
    "geolocation_type": "ROOFTOP",
    "latitude": -33.447512,
    "municipality": {
      "id": null,
      "name": null
    },
    "location_id": null,
    "street_name": "General José Artigas",
    "zip_code": null,
    "intersection": null,
    "receiver_name": "Isadora Díaz Yunis",
    "id": 1459975781,
    "state": {
      "id": "CL-RM",
      "name": "RM (Metropolitana)"
    },
    "longitude": -70.598916,
    "address_line": "General José Artigas 3121",
    "types": [],
    "scoring": 1,
    "agency": null,
    "version": "CL-e50d6ca0e6396d3564d8eeb0abacbb89",
    "geolocation_source": "geolocation-visits",
    "delivery_preference": "residential",
    "node": null,
    "street_number": "3121",
    "comment": "206",
    "neighborhood": {
      "id": null,
      "name": "Ñuñoa"
    },
    "geolocation_last_updated": "2025-06-16T15:20:25.661Z",
    "receiver_phone": "XXXXXXX"
  },
  "customer_id": null,
  "order_id": 2000013770481964,
  "quotation": null,
  "status": "shipped",
  "logistic_type": "self_service"
};

// ============================================================================
// ORDER: 2000013770481964
// ============================================================================

export const ORDER_2000013770481964 = {
  "id": 2000013770481964,
  "date_created": "2025-11-11T12:31:23.000-04:00",
  "last_updated": "2025-11-11T12:33:06.000-04:00",
  "date_closed": "2025-11-11T12:31:26.000-04:00",
  "pack_id": 2000009955773085,
  "fulfilled": null,
  "buying_mode": "buy_equals_pay",
  "shipping_cost": null,
  "mediations": [],
  "total_amount": 52240.00,
  "paid_amount": 52240.00,
  "order_items": [
    {
      "item": {
        "id": "MLC2401498834",
        "title": "24-pack Agua De Coco Natural B Organics 520ml Andina Grains",
        "category_id": "MLC437078",
        "variation_id": null,
        "seller_custom_field": null,
        "variation_attributes": [],
        "warranty": "Garantía del vendedor: 15 días",
        "condition": "new",
        "seller_sku": "CAJA-040",
        "global_price": null,
        "net_weight": null,
        "user_product_id": "MLCU362317831",
        "release_date": null,
        "attributes": [
          {
            "id": "ITEM_CONDITION",
            "values": [
              {
                "id": "2230284"
              }
            ]
          }
        ]
      },
      "quantity": 1,
      "requested_quantity": {
        "measure": "unit",
        "value": 1
      },
      "picked_quantity": null,
      "unit_price": 52240.00,
      "full_unit_price": 54990.00,
      "full_unit_price_currency_id": "CLP",
      "currency_id": "CLP",
      "manufacturing_days": null,
      "sale_fee": 5746.00,
      "listing_type_id": "gold_special",
      "base_exchange_rate": null,
      "base_currency_id": null,
      "element_id": null,
      "discounts": null,
      "bundle": null,
      "compat_id": null,
      "stock": {
        "store_id": null,
        "node_id": "CLP4541126541"
      },
      "kit_instance_id": null
    }
  ],
  "currency_id": "CLP",
  "payments": [
    {
      "id": 132814584771,
      "order_id": 2000013770481964,
      "payer_id": 220993277,
      "collector": {
        "id": 454112654
      },
      "card_id": null,
      "reason": "24-pack Agua De Coco Natural B Organics 520ml Andina Grains",
      "site_id": "MLC",
      "payment_method_id": "account_money",
      "currency_id": "CLP",
      "installments": 1,
      "issuer_id": "2020",
      "atm_transfer_reference": {
        "transaction_id": null,
        "company_id": null
      },
      "coupon_id": null,
      "activation_uri": null,
      "operation_type": "regular_payment",
      "payment_type": "account_money",
      "available_actions": [
        "refund"
      ],
      "status": "approved",
      "status_code": null,
      "status_detail": "accredited",
      "transaction_amount": 52240.00,
      "transaction_amount_refunded": 0.00,
      "taxes_amount": 0.00,
      "shipping_cost": 0.00,
      "coupon_amount": 0.00,
      "overpaid_amount": 0.00,
      "total_paid_amount": 52240.00,
      "installment_amount": null,
      "deferred_period": null,
      "date_approved": "2025-11-11T12:31:25.000-04:00",
      "transaction_order_id": null,
      "date_created": "2025-11-11T12:31:25.000-04:00",
      "date_last_modified": "2025-11-11T12:31:25.000-04:00",
      "marketplace_fee": 5746.00,
      "reference_id": null,
      "authorization_code": null
    }
  ],
  "shipping": {
    "id": 45848383497
  },
  "status": "paid",
  "status_detail": null,
  "tags": [
    "pack_order",
    "order_has_discount",
    "paid",
    "not_delivered"
  ],
  "internal_tags": [],
  "static_tags": [],
  "feedback": {
    "seller": null,
    "buyer": null
  },
  "context": {
    "channel": "marketplace",
    "site": "MLC",
    "flows": []
  },
  "seller": {
    "id": 454112654
  },
  "buyer": {
    "id": 220993277,
    "nickname": "DAZISADORA",
    "first_name": "Isadora",
    "last_name": "Díaz Yunis",
    "billing_info": {
      "id": "776121809365303355"
    }
  },
  "taxes": {
    "amount": null,
    "currency_id": null,
    "id": null
  },
  "cancel_detail": null,
  "manufacturing_ending_date": null,
  "order_request": {
    "change": null,
    "return": null
  },
  "related_orders": null
};

// ============================================================================
// PACK: 2000009955773085
// ============================================================================

export const PACK_2000009955773085 = {
  "shipment": {
    "id": 45848383497
  },
  "orders": [
    {
      "id": 2000013770481964,
      "static_tags": []
    }
  ],
  "id": 2000009955773085,
  "status": "released",
  "status_detail": null,
  "family_pack_id": null,
  "trash_pack_id": null,
  "buyer": {
    "id": 220993277
  },
  "date_created": "2025-11-11T12:31:05.000-0400",
  "last_updated": "2025-11-12T13:28:57.000-0400"
};

// ============================================================================
// BILLING INFO: 2000013770481964
// ============================================================================

export const BILLING_INFO_2000013770481964 = {
  "billing_info": {
    "additional_info": [
      {
        "type": "SITE_ID",
        "value": "MLC"
      },
      {
        "type": "FIRST_NAME",
        "value": "isadora"
      },
      {
        "type": "LAST_NAME",
        "value": "díaz"
      },
      {
        "type": "DOC_TYPE",
        "value": "RUT"
      },
      {
        "type": "DOC_NUMBER",
        "value": "189565135"
      },
      {
        "type": "CITY_NAME",
        "value": "Ñuñoa"
      },
      {
        "type": "STREET_NAME",
        "value": "General José Artigas"
      },
      {
        "type": "STREET_NUMBER",
        "value": "3121"
      },
      {
        "type": "STATE_CODE",
        "value": "CL-RM"
      },
      {
        "type": "STATE_NAME",
        "value": "RM (Metropolitana)"
      },
      {
        "type": "NEIGHBORHOOD",
        "value": "Ñuñoa"
      },
      {
        "type": "COUNTRY_ID",
        "value": "CL"
      },
      {
        "type": "VAT_DISCRIMINATED_BILLING",
        "value": "True"
      },
      {
        "type": "NEW_BILLING_INFO",
        "value": "True"
      }
    ],
    "doc_number": "189565135",
    "doc_type": "RUT"
  }
};

// ============================================================================
// ÍNDICE DE DATOS MOCK POR ID
// ============================================================================

export const MOCK_SHIPMENTS: Record<string, any> = {
  "45848383497": SHIPMENT_45848383497,
};

export const MOCK_ORDERS: Record<string, any> = {
  "2000013770481964": ORDER_2000013770481964,
};

export const MOCK_PACKS: Record<string, any> = {
  "2000009955773085": PACK_2000009955773085,
};

export const MOCK_BILLING_INFO: Record<string, any> = {
  "2000013770481964": BILLING_INFO_2000013770481964,
};

// ============================================================================
// HELPERS PARA USAR EN TESTS
// ============================================================================

/**
 * Obtiene un shipment mock por ID
 */
export function getMockShipment(shipmentId: string): any | null {
  return MOCK_SHIPMENTS[shipmentId] || null;
}

/**
 * Obtiene una order mock por ID
 */
export function getMockOrder(orderId: string): any | null {
  return MOCK_ORDERS[orderId] || null;
}

/**
 * Obtiene un pack mock por ID
 */
export function getMockPack(packId: string): any | null {
  return MOCK_PACKS[packId] || null;
}

/**
 * Obtiene billing info mock por order ID
 */
export function getMockBillingInfo(orderId: string): any | null {
  return MOCK_BILLING_INFO[orderId] || null;
}

/**
 * Verifica si existe un shipment mock
 */
export function hasMockShipment(shipmentId: string): boolean {
  return shipmentId in MOCK_SHIPMENTS;
}

/**
 * Verifica si existe una order mock
 */
export function hasMockOrder(orderId: string): boolean {
  return orderId in MOCK_ORDERS;
}

/**
 * Verifica si existe un pack mock
 */
export function hasMockPack(packId: string): boolean {
  return packId in MOCK_PACKS;
}

/**
 * Verifica si existe billing info mock
 */
export function hasMockBillingInfo(orderId: string): boolean {
  return orderId in MOCK_BILLING_INFO;
}

// ============================================================================
// PLANTILLAS PARA AGREGAR MÁS DATOS
// ============================================================================

/**
 * INSTRUCCIONES PARA AGREGAR MÁS DATOS:
 * 
 * 1. Agregar el shipment como constante:
 *    export const SHIPMENT_XXXXX = { ... };
 * 
 * 2. Agregar la order como constante:
 *    export const ORDER_XXXXX = { ... };
 * 
 * 3. Agregar pack y billing info si aplica:
 *    export const PACK_XXXXX = { ... };
 *    export const BILLING_INFO_XXXXX = { ... };
 * 
 * 4. Registrar en los índices:
 *    export const MOCK_SHIPMENTS: Record<string, any> = {
 *      "45848383497": SHIPMENT_45848383497,
 *      "XXXXX": SHIPMENT_XXXXX,  // <- Agregar aquí
 *    };
 * 
 *    export const MOCK_ORDERS: Record<string, any> = {
 *      "2000013770481964": ORDER_2000013770481964,
 *      "XXXXX": ORDER_XXXXX,  // <- Agregar aquí
 *    };
 * 
 *    export const MOCK_PACKS: Record<string, any> = {
 *      "2000009955773085": PACK_2000009955773085,
 *      "XXXXX": PACK_XXXXX,  // <- Agregar aquí
 *    };
 * 
 *    export const MOCK_BILLING_INFO: Record<string, any> = {
 *      "2000013770481964": BILLING_INFO_2000013770481964,
 *      "XXXXX": BILLING_INFO_XXXXX,  // <- Agregar aquí
 *    };
 */
