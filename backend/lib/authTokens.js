const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'localpulse-dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function newManageToken() {
    return randomBytes(24).toString('hex');
}

module.exports = { signToken, verifyToken, hashPassword, comparePassword, newManageToken };
