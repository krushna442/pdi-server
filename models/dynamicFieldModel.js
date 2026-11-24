import { query, queryOne, execute } from '../db/db.js';

export async function initDynamicFieldsTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS dynamic_fields (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_names LONGTEXT NOT NULL,
      vendor_codes LONGTEXT NOT NULL,
      model_descriptions LONGTEXT NOT NULL,
      shift_settings LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  const existing = await queryOne('SELECT * FROM dynamic_fields LIMIT 1');
  if (!existing) {
    const defaults = {
      customers: [
        'TATA MOTORS  LTD.',
        'VECV',
        'SWITCH MOBILITY',
        'ALL ALW',
        'ALL PNR',
        'ALL HUSUR',
        'IPLT',
      ],
      vendorCodes: ['R64533', '7205761', '113072', '10830-6'],
      models: [
        'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)',
        'FIFTH WHEEL ASSY WITH STRUCTURE (35 Ton)',
        'FIFTH WHEEL TOP PLATE ASSY',
        'FIFTH WHEEL MOUNTING BRACKET',
      ],
      shifts: [
        { name: 'Shift A', label: 'Shift A (06:00 – 14:00)', startHour: 6, endHour: 14 },
        { name: 'Shift B', label: 'Shift B (14:00 – 22:00)', startHour: 14, endHour: 22 },
        { name: 'Shift C', label: 'Shift C (22:00 – 06:00)', startHour: 22, endHour: 6 },
      ],
    };

    await execute(
      `INSERT INTO dynamic_fields (customer_names, vendor_codes, model_descriptions, shift_settings)
       VALUES (?, ?, ?, ?)`,
      [
        JSON.stringify(defaults.customers),
        JSON.stringify(defaults.vendorCodes),
        JSON.stringify(defaults.models),
        JSON.stringify(defaults.shifts),
      ]
    );
  }
}

export async function getConfig() {
  const row = await queryOne('SELECT * FROM dynamic_fields LIMIT 1');
  if (!row) {
    return {
      customer_names: ['TATA MOTORS  LTD.', 'VECV', 'SWITCH MOBILITY'],
      vendor_codes: ['R64533', '7205761'],
      model_descriptions: ['FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)'],
      shift_settings: [
        { name: 'Shift A', label: 'Shift A (06:00 – 14:00)', startHour: 6, endHour: 14 },
        { name: 'Shift B', label: 'Shift B (14:00 – 22:00)', startHour: 14, endHour: 22 },
        { name: 'Shift C', label: 'Shift C (22:00 – 06:00)', startHour: 22, endHour: 6 },
      ],
    };
  }
  return {
    id: row.id,
    customer_names: typeof row.customer_names === 'string' ? JSON.parse(row.customer_names) : (row.customer_names || []),
    vendor_codes: typeof row.vendor_codes === 'string' ? JSON.parse(row.vendor_codes) : (row.vendor_codes || []),
    model_descriptions: typeof row.model_descriptions === 'string' ? JSON.parse(row.model_descriptions) : (row.model_descriptions || []),
    shift_settings: typeof row.shift_settings === 'string' ? JSON.parse(row.shift_settings) : (row.shift_settings || []),
    updated_at: row.updated_at,
  };
}

export async function updateConfig({ customer_names, vendor_codes, model_descriptions, shift_settings }) {
  const current = await getConfig();

  const newCustomers = customer_names !== undefined ? customer_names : current.customer_names;
  const newVendors = vendor_codes !== undefined ? vendor_codes : current.vendor_codes;
  const newModels = model_descriptions !== undefined ? model_descriptions : current.model_descriptions;
  const newShifts = shift_settings !== undefined ? shift_settings : current.shift_settings;

  if (current.id) {
    await execute(
      `UPDATE dynamic_fields SET
        customer_names = ?,
        vendor_codes = ?,
        model_descriptions = ?,
        shift_settings = ?
       WHERE id = ?`,
      [
        JSON.stringify(newCustomers),
        JSON.stringify(newVendors),
        JSON.stringify(newModels),
        JSON.stringify(newShifts),
        current.id,
      ]
    );
  } else {
    await execute(
      `INSERT INTO dynamic_fields (customer_names, vendor_codes, model_descriptions, shift_settings)
       VALUES (?, ?, ?, ?)`,
      [
        JSON.stringify(newCustomers),
        JSON.stringify(newVendors),
        JSON.stringify(newModels),
        JSON.stringify(newShifts),
      ]
    );
  }

  return await getConfig();
}
