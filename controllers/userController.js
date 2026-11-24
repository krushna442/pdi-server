import { findAllUsers, findUserById, createUser, updateUser, deleteUser, VALID_ROLES } from '../models/userModel.js';

export async function getUsers(req, res) {
  try {
    const users = await findAllUsers();
    return res.json({ success: true, data: users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getUser(req, res) {
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function addUser(req, res) {
  try {
    const { name, username, email, password, role, mail_types } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, message: 'Name, username, and password are required' });
    }

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Role must be one of [${VALID_ROLES.join(', ')}]` });
    }

    const newUser = await createUser({ name, username, email, password, role, mail_types });
    return res.status(201).json({ success: true, data: newUser, message: 'User created successfully' });
  } catch (err) {
    if (err.message?.includes('Duplicate entry')) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function editUser(req, res) {
  try {
    const { id } = req.params;
    const { name, username, email, password, role, is_active, mail_types } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Role must be one of [${VALID_ROLES.join(', ')}]` });
    }

    const updated = await updateUser(id, { name, username, email, password, role, is_active, mail_types });
    return res.json({ success: true, data: updated, message: 'User updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function removeUser(req, res) {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }
    await deleteUser(id);
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
