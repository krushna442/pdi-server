import { getConfig, updateConfig } from '../models/dynamicFieldModel.js';

export async function getDynamicFields(req, res) {
  try {
    const config = await getConfig();
    return res.json({ success: true, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function saveDynamicFields(req, res) {
  try {
    const { customer_names, vendor_codes, model_descriptions, shift_settings } = req.body;
    const updated = await updateConfig({ customer_names, vendor_codes, model_descriptions, shift_settings });
    return res.json({ success: true, data: updated, message: 'Field options updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
