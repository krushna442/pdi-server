import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { findUserByUsername, findUserById } from '../models/userModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'rsb_pdi_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

export async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Your account is disabled. Contact Admin.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const safeUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      mail_types: user.mail_types,
    };

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

export async function getProfile(req, res) {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
