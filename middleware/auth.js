import jwt from 'jsonwebtoken';
import { findUserById } from '../models/userModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'rsb_pdi_secret_key_2026';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.id);

    if (!user || !user.is_active) {
      return res.status(403).json({ success: false, message: 'User account is inactive or not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
}

export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }

    const userRole = req.user.role;
    // Admin has access to everything
    if (userRole === 'admin') return next();

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: requires one of [${allowedRoles.join(', ')}] role`,
      });
    }

    next();
  };
}
