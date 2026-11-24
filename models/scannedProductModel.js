import { query, queryOne, execute } from '../db/db.js';

export async function initScannedProductsTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS scanned_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      part_no VARCHAR(100) NOT NULL,
      vendor_code VARCHAR(100) DEFAULT '',
      model VARCHAR(255) DEFAULT '',
      rev_no VARCHAR(100) DEFAULT '',
      customer_name VARCHAR(150) DEFAULT '',
      part_sl_no VARCHAR(100) DEFAULT '',
      scanned_text TEXT NOT NULL,
      format VARCHAR(50) DEFAULT 'F2',
      shift VARCHAR(10) NOT NULL,
      validation_status ENUM('pass', 'fail', 'pending') DEFAULT 'pass',
      is_rejected TINYINT(1) DEFAULT 0,
      remarks TEXT DEFAULT NULL,
      plant_location VARCHAR(100) DEFAULT 'RSB JSR U - IV',
      created_by VARCHAR(100) NOT NULL,
      created_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_part (part_no),
      INDEX idx_shift (shift),
      INDEX idx_status (validation_status),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);
}

export function getCurrentShift() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'A';
  if (hour >= 14 && hour < 22) return 'B';
  return 'C';
}

export async function recordScan({
  part_no,
  vendor_code = '',
  model = '',
  rev_no = '',
  customer_name = '',
  part_sl_no = '',
  scanned_text,
  format = 'F2',
  shift,
  validation_status = 'pass',
  is_rejected = 0,
  remarks = '',
  plant_location = 'RSB JSR U - IV',
  created_by,
}) {
  const currentShift = shift || getCurrentShift();
  const result = await execute(
    `INSERT INTO scanned_products (
      part_no, vendor_code, model, rev_no, customer_name, part_sl_no,
      scanned_text, format, shift, validation_status, is_rejected,
      remarks, plant_location, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      part_no.trim(),
      vendor_code.trim(),
      model.trim(),
      rev_no.trim(),
      customer_name.trim(),
      part_sl_no.trim(),
      scanned_text,
      format,
      currentShift,
      validation_status,
      is_rejected ? 1 : 0,
      remarks,
      plant_location,
      created_by || 'QA Inspector',
    ]
  );
  return await queryOne('SELECT * FROM scanned_products WHERE id = ?', [result.insertId]);
}

export async function findScans({
  part_no = '',
  shift = '',
  status = '',
  customer = '',
  fromDate = '',
  toDate = '',
  search = '',
  page = 1,
  limit = 50,
} = {}) {
  let sql = 'SELECT * FROM scanned_products WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as total FROM scanned_products WHERE 1=1';
  const params = [];
  const countParams = [];

  if (part_no) {
    sql += ' AND part_no = ?';
    countSql += ' AND part_no = ?';
    params.push(part_no);
    countParams.push(part_no);
  }
  if (shift) {
    sql += ' AND shift = ?';
    countSql += ' AND shift = ?';
    params.push(shift);
    countParams.push(shift);
  }
  if (status) {
    sql += ' AND validation_status = ?';
    countSql += ' AND validation_status = ?';
    params.push(status);
    countParams.push(status);
  }
  if (customer) {
    sql += ' AND customer_name = ?';
    countSql += ' AND customer_name = ?';
    params.push(customer);
    countParams.push(customer);
  }
  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    sql += ' AND created_at >= ?';
    countSql += ' AND created_at >= ?';
    params.push(from);
    countParams.push(from);
  }
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    sql += ' AND created_at <= ?';
    countSql += ' AND created_at <= ?';
    params.push(to);
    countParams.push(to);
  }
  if (search) {
    const s = `%${search}%`;
    sql += ' AND (part_no LIKE ? OR part_sl_no LIKE ? OR scanned_text LIKE ? OR customer_name LIKE ?)';
    countSql += ' AND (part_no LIKE ? OR part_sl_no LIKE ? OR scanned_text LIKE ? OR customer_name LIKE ?)';
    params.push(s, s, s, s);
    countParams.push(s, s, s, s);
  }

  const countRow = await queryOne(countSql, countParams);
  const total = countRow ? countRow.total : 0;

  const offset = (Math.max(1, page) - 1) * limit;
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = await query(sql, params);
  return {
    records: rows,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / limit),
  };
}

export function getProductionDayBounds(refDate = new Date()) {
  const d = new Date(refDate);
  // Production day runs 06:00:00 to 06:00:00 next day.
  // If current hour is before 6 AM, it belongs to yesterday's production day (Shift C).
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  const pad = (n) => String(n).padStart(2, '0');
  const prodDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startStr = `${prodDateStr} 06:00:00`;

  const nextDay = new Date(d);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDateStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
  const endStr = `${nextDateStr} 06:00:00`;

  const now = new Date();
  const curD = new Date(now);
  if (curD.getHours() < 6) curD.setDate(curD.getDate() - 1);
  const curProdDateStr = `${curD.getFullYear()}-${pad(curD.getMonth() + 1)}-${pad(curD.getDate())}`;

  return {
    startStr,
    endStr,
    prodDateStr,
    nextDateStr,
    isCurrentDay: prodDateStr === curProdDateStr,
  };
}

export async function findCurrentShiftScans() {
  const currentShift = getCurrentShift();
  const bounds = getProductionDayBounds();

  let shiftStart = bounds.startStr;
  let shiftEnd = bounds.endStr;
  if (currentShift === 'A') {
    shiftStart = `${bounds.prodDateStr} 06:00:00`;
    shiftEnd = `${bounds.prodDateStr} 14:00:00`;
  } else if (currentShift === 'B') {
    shiftStart = `${bounds.prodDateStr} 14:00:00`;
    shiftEnd = `${bounds.prodDateStr} 22:00:00`;
  } else {
    // Shift C: 22:00 of production date to 06:00 of next calendar date
    shiftStart = `${bounds.prodDateStr} 22:00:00`;
    shiftEnd = bounds.endStr;
  }

  const rows = await query(
    'SELECT * FROM scanned_products WHERE shift = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC',
    [currentShift, shiftStart, shiftEnd]
  );
  return rows;
}

export async function getDashboardStats(targetDate) {
  let bounds;
  if (targetDate) {
    const [y, m, d] = String(targetDate).split('-').map(Number);
    const ref = new Date(y, m - 1, d, 12, 0, 0);
    bounds = getProductionDayBounds(ref);
  } else {
    bounds = getProductionDayBounds(new Date());

    // If current production day has 0 scans, check if there are recent scans from latest production day
    const currentCount = await queryOne(
      'SELECT COUNT(*) as total FROM scanned_products WHERE created_at >= ? AND created_at < ?',
      [bounds.startStr, bounds.endStr]
    );
    if (!currentCount || currentCount.total === 0) {
      const latest = await queryOne('SELECT created_at FROM scanned_products ORDER BY created_at DESC LIMIT 1');
      if (latest && latest.created_at) {
        bounds = getProductionDayBounds(new Date(latest.created_at));
      }
    }
  }

  // Overall summary
  const totalScans = await queryOne('SELECT COUNT(*) as total FROM scanned_products');
  const todayScans = await queryOne(
    'SELECT COUNT(*) as total FROM scanned_products WHERE created_at >= ? AND created_at < ?',
    [bounds.startStr, bounds.endStr]
  );
  const passedToday = await queryOne(
    "SELECT COUNT(*) as total FROM scanned_products WHERE validation_status = 'pass' AND created_at >= ? AND created_at < ?",
    [bounds.startStr, bounds.endStr]
  );
  const failedToday = await queryOne(
    "SELECT COUNT(*) as total FROM scanned_products WHERE validation_status = 'fail' AND created_at >= ? AND created_at < ?",
    [bounds.startStr, bounds.endStr]
  );

  // Shift breakdown within this 6 AM to 6 AM production day
  const shiftsRaw = await query(
    `SELECT shift, COUNT(*) as count,
      SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN validation_status = 'fail' THEN 1 ELSE 0 END) as failed
     FROM scanned_products
     WHERE created_at >= ? AND created_at < ?
     GROUP BY shift`,
    [bounds.startStr, bounds.endStr]
  );

  // Customer-wise distribution
  const customerDistribution = await query(
    `SELECT 
       COALESCE(NULLIF(customer_name, ''), 'TATA MOTORS LTD.') as customer,
       COUNT(*) as count,
       SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) as passed,
       SUM(CASE WHEN validation_status = 'fail' THEN 1 ELSE 0 END) as failed,
       ROUND(SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as yield_rate
     FROM scanned_products
     GROUP BY customer
     ORDER BY count DESC`
  );

  // Model-wise distribution
  const modelDistribution = await query(
    `SELECT 
       COALESCE(NULLIF(model, ''), 'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)') as model,
       COUNT(*) as count,
       SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) as passed,
       SUM(CASE WHEN validation_status = 'fail' THEN 1 ELSE 0 END) as failed,
       ROUND(SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as yield_rate
     FROM scanned_products
     GROUP BY model
     ORDER BY count DESC
     LIMIT 8`
  );

  // Part number distribution (top 10)
  const partDistribution = await query(
    `SELECT 
       part_no, 
       COALESCE(NULLIF(model, ''), 'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)') as model,
       COALESCE(NULLIF(customer_name, ''), 'TATA MOTORS LTD.') as customer,
       COUNT(*) as count,
       SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) as passed,
       SUM(CASE WHEN validation_status = 'fail' THEN 1 ELSE 0 END) as failed,
       ROUND(SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as yield_rate
     FROM scanned_products
     GROUP BY part_no, model, customer_name
     ORDER BY count DESC
     LIMIT 10`
  );

  // Live Hourly Tracking Timeline (6:00 AM Today to 06:00 AM Next Day)
  const hourlyRaw = await query(
    `SELECT 
       DATE_FORMAT(created_at, '%H:00') as time_slot,
       HOUR(created_at) as hour,
       COUNT(*) as total,
       SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) as passed,
       SUM(CASE WHEN validation_status = 'fail' THEN 1 ELSE 0 END) as failed
     FROM scanned_products
     WHERE created_at >= ? AND created_at < ?
     GROUP BY time_slot, hour
     ORDER BY (hour + 18) % 24 ASC`,
    [bounds.startStr, bounds.endStr]
  );

  // 24 Production Hours Sequence: 06:00 AM Today to 06:00 AM Next Day
  const PROD_HOURS = [
    { hour: 6, label: '06:00', shift: 'Shift A', isNextDay: false },
    { hour: 7, label: '07:00', shift: 'Shift A', isNextDay: false },
    { hour: 8, label: '08:00', shift: 'Shift A', isNextDay: false },
    { hour: 9, label: '09:00', shift: 'Shift A', isNextDay: false },
    { hour: 10, label: '10:00', shift: 'Shift A', isNextDay: false },
    { hour: 11, label: '11:00', shift: 'Shift A', isNextDay: false },
    { hour: 12, label: '12:00', shift: 'Shift A', isNextDay: false },
    { hour: 13, label: '13:00', shift: 'Shift A', isNextDay: false },
    { hour: 14, label: '14:00', shift: 'Shift B', isNextDay: false },
    { hour: 15, label: '15:00', shift: 'Shift B', isNextDay: false },
    { hour: 16, label: '16:00', shift: 'Shift B', isNextDay: false },
    { hour: 17, label: '17:00', shift: 'Shift B', isNextDay: false },
    { hour: 18, label: '18:00', shift: 'Shift B', isNextDay: false },
    { hour: 19, label: '19:00', shift: 'Shift B', isNextDay: false },
    { hour: 20, label: '20:00', shift: 'Shift B', isNextDay: false },
    { hour: 21, label: '21:00', shift: 'Shift B', isNextDay: false },
    { hour: 22, label: '22:00', shift: 'Shift C', isNextDay: false },
    { hour: 23, label: '23:00', shift: 'Shift C', isNextDay: false },
    { hour: 0, label: '00:00', shift: 'Shift C', isNextDay: true },
    { hour: 1, label: '01:00', shift: 'Shift C', isNextDay: true },
    { hour: 2, label: '02:00', shift: 'Shift C', isNextDay: true },
    { hour: 3, label: '03:00', shift: 'Shift C', isNextDay: true },
    { hour: 4, label: '04:00', shift: 'Shift C', isNextDay: true },
    { hour: 5, label: '05:00', shift: 'Shift C', isNextDay: true },
  ];

  const hourMap = new Map();
  for (const row of hourlyRaw) {
    hourMap.set(Number(row.hour), row);
  }

  const fullHourlyTracking = PROD_HOURS.map((slot) => {
    const data = hourMap.get(slot.hour);
    const total = Number(data?.total || 0);
    const passed = Number(data?.passed || 0);
    const failed = Number(data?.failed || 0);
    const yieldRate = total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 100;
    return {
      time_slot: slot.isNextDay ? `${slot.label} (+1d)` : slot.label,
      raw_time: slot.label,
      hour: slot.hour,
      shift: slot.shift,
      is_next_day: slot.isNextDay,
      total,
      passed,
      failed,
      yield_rate: yieldRate,
    };
  });

  // Also add 06:00 Next Day endpoint to complete the 24-hr line visual cycle
  fullHourlyTracking.push({
    time_slot: '06:00 (+1d)',
    raw_time: '06:00',
    hour: 6,
    shift: 'Shift C End',
    is_next_day: true,
    total: 0,
    passed: 0,
    failed: 0,
    yield_rate: 100,
  });

  // Available production days in the database
  const distinctDays = await query(
    `SELECT 
       DATE_FORMAT(IF(HOUR(created_at) < 6, DATE_SUB(created_at, INTERVAL 1 DAY), created_at), '%Y-%m-%d') as prod_date,
       COUNT(*) as count
     FROM scanned_products
     GROUP BY prod_date
     ORDER BY prod_date DESC
     LIMIT 10`
  );

  const curProdDate = getProductionDayBounds().prodDateStr;
  const availableDates = distinctDays.map((d) => ({
    date: d.prod_date,
    count: Number(d.count || 0),
    isToday: d.prod_date === curProdDate,
  }));
  if (!availableDates.some((d) => d.date === curProdDate)) {
    availableDates.unshift({
      date: curProdDate,
      count: 0,
      isToday: true,
    });
  }

  // Recent Live Scan stream
  const recentLiveScans = await query(
    `SELECT id, part_no, model, customer_name, vendor_code, validation_status, shift, created_at, created_by
     FROM scanned_products
     ORDER BY id DESC
     LIMIT 10`
  );

  // Weekly trend by production date
  const weeklyTrend = await query(
    `SELECT 
       DATE_FORMAT(IF(HOUR(created_at) < 6, DATE_SUB(created_at, INTERVAL 1 DAY), created_at), '%Y-%m-%d') as date,
       COUNT(*) as total,
       SUM(CASE WHEN validation_status = 'pass' THEN 1 ELSE 0 END) as passed,
       SUM(CASE WHEN validation_status = 'fail' THEN 1 ELSE 0 END) as failed
     FROM scanned_products
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY date
     ORDER BY date ASC`
  );

  return {
    productionDate: bounds.prodDateStr,
    productionStart: bounds.startStr,
    productionEnd: bounds.endStr,
    isCurrentDay: bounds.isCurrentDay,
    availableDates,
    totalScans: totalScans?.total || 0,
    todayScans: todayScans?.total || 0,
    passedToday: passedToday?.total || 0,
    failedToday: failedToday?.total || 0,
    shiftsBreakdown: shiftsRaw,
    customerDistribution,
    modelDistribution,
    partDistribution,
    hourlyTracking: fullHourlyTracking,
    recentLiveScans,
    weeklyTrend,
  };
}
