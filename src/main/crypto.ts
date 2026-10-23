import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { join } from 'path'
import { getDataDir } from './paths'

/**
 * Server-side replacement for Electron's `safeStorage`.
 *
 * AES-256-GCM with a random 32-byte key stored in <dataDir>/secret.key
 * (mode 600). Override the key with TERMINUX_SECRET_KEY (64 hex chars).
 */
let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const fromEnv = process.env['TERMINUX_SECRET_KEY']
  if (fromEnv) {
    cachedKey = Buffer.from(fromEnv, 'hex')
    if (cachedKey.length !== 32) throw new Error('TERMINUX_SECRET_KEY phải là 64 ký tự hex')
    return cachedKey
  }

  const keyPath = join(getDataDir(), 'secret.key')
  if (existsSync(keyPath)) {
    cachedKey = Buffer.from(readFileSync(keyPath, 'utf-8').trim(), 'hex')
    if (cachedKey.length === 32) return cachedKey
  }

  cachedKey = randomBytes(32)
  writeFileSync(keyPath, cachedKey.toString('hex'), { mode: 0o600 })
  try { chmodSync(keyPath, 0o600) } catch { /* best effort on non-POSIX */ }
  return cachedKey
}

/** Returns base64(iv | tag | ciphertext). */
export function encryptString(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

/** Throws when the payload was not produced by this server / key. */
export function decryptString(payload: string): string {
  const raw = Buffer.from(payload, 'base64')
  if (raw.length < 29) throw new Error('Dữ liệu mã hoá không hợp lệ')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const data = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8')
}
