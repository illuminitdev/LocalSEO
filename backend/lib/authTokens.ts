import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'localpulse-dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function signToken(payload: any) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES as any });
}

function verifyToken(token: string) {
    return jwt.verify(token, JWT_SECRET);
}

async function hashPassword(password: string) {
    return bcrypt.hash(password, 10);
}

async function comparePassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
}

function newManageToken() {
    return randomBytes(24).toString('hex');
}

export { signToken, verifyToken, hashPassword, comparePassword, newManageToken };
