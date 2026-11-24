import express from 'express';
import { getUsers, getUser, addUser, editUser, removeUser } from '../controllers/userController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', requireRole(['admin']), addUser);
router.put('/:id', requireRole(['admin']), editUser);
router.delete('/:id', requireRole(['admin']), removeUser);

export default router;
