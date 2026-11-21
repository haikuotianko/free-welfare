import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  randomBytes as nodeRandomBytes,
  randomUUID,
  sign as nodeSign,
  timingSafeEqual,
  verify as nodeVerify,
  constants,
} from 'node:crypto';
import type { AesOptions, BytesLike, CryptoApi } from '@free-welfare/sdk';

function toBuffer(input: BytesLike): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  return Buffer.from(input);
}

function decodeInput(input: string, encoding: 'utf8' | 'base64' | 'hex' = 'utf8'): Buffer {
  if (encoding === 'base64') return Buffer.from(input, 'base64');
  if (encoding === 'hex') return Buffer.from(input, 'hex');
  return Buffer.from(input, 'utf8');
}

function decodeKey(key: string, encoding: 'utf8' | 'base64' | 'hex' = 'utf8'): Buffer {
  const buffer = decodeInput(key, encoding);
  if (![16, 24, 32].includes(buffer.length)) {
    throw new Error('AES key must be 16/24/32 bytes');
  }
  return buffer;
}

function normalizeAesOptions(value?: string | AesOptions): Required<Pick<AesOptions, 'mode' | 'output' | 'keyEncoding'>> & AesOptions {
  const options = typeof value === 'string' ? { iv: value } : (value ?? {});
  return {
    mode: options.mode ?? 'cbc',
    output: options.output ?? 'base64',
    keyEncoding: options.keyEncoding ?? 'utf8',
    ...options,
  };
}

function encodeOutput(buffer: Buffer, output: 'base64' | 'hex'): string {
  return buffer.toString(output);
}

function aesEncrypt(input: BytesLike, key: string, ivOrOptions?: string | AesOptions): string {
  const options = normalizeAesOptions(ivOrOptions);
  const keyBuffer = decodeKey(key, options.keyEncoding);
  const iv =
    options.mode === 'ecb'
      ? null
      : options.iv
        ? decodeInput(options.iv, options.keyEncoding)
        : nodeRandomBytes(12);
  const cipher = createCipheriv(`aes-${keyBuffer.length * 8}-${options.mode}`, keyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(decodeInput(String(input), options.inputEncoding ?? 'utf8')),
    cipher.final(),
  ]);
  if (options.mode === 'gcm') {
    const tag = (cipher as unknown as { getAuthTag(): Buffer }).getAuthTag();
    return [iv!.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }
  return encodeOutput(encrypted, options.output);
}

function aesDecrypt(input: string, key: string, ivOrOptions?: string | AesOptions): string {
  const options = normalizeAesOptions(ivOrOptions);
  const keyBuffer = decodeKey(key, options.keyEncoding);
  let iv: Buffer | null = null;
  let tag: Buffer | undefined;
  let payload = input;

  if (options.mode === 'gcm') {
    if (options.authTag) {
      tag = Buffer.from(options.authTag, 'base64');
      iv = options.iv ? decodeInput(options.iv, options.keyEncoding) : null;
    } else {
      const parts = input.split(':');
      if (parts.length === 3) {
        iv = Buffer.from(parts[0], 'base64');
        tag = Buffer.from(parts[1], 'base64');
        payload = parts[2];
      }
    }
    if (!iv || !tag) throw new Error('GCM decrypt requires iv and authTag');
  } else if (options.mode !== 'ecb') {
    if (!options.iv) throw new Error('CBC decrypt requires iv');
    iv = decodeInput(options.iv, options.keyEncoding);
  }

  const decipher = createDecipheriv(`aes-${keyBuffer.length * 8}-${options.mode}`, keyBuffer, iv);
  if (tag) (decipher as unknown as { setAuthTag(tag: Buffer): void }).setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(decodeInput(payload, options.output)),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function createCryptoApi(): CryptoApi {
  return {
    md5: (input) => createHash('md5').update(toBuffer(input)).digest('hex'),
    sha1: (input) => createHash('sha1').update(toBuffer(input)).digest('hex'),
    sha256: (input) => createHash('sha256').update(toBuffer(input)).digest('hex'),
    sha512: (input) => createHash('sha512').update(toBuffer(input)).digest('hex'),
    hmac: (algorithm, key, data, output = 'hex') =>
      createHmac(algorithm, toBuffer(key)).update(toBuffer(data)).digest(output),
    randomBytes: (length, encoding = 'hex') => nodeRandomBytes(length).toString(encoding),
    uuid: () => randomUUID(),
    base64Encode: (input) => toBuffer(input).toString('base64'),
    base64Decode: (input) => Buffer.from(input, 'base64').toString('utf8'),
    hexEncode: (input) => toBuffer(input).toString('hex'),
    hexDecode: (input) => Buffer.from(input, 'hex').toString('utf8'),
    urlEncode: (input) => encodeURIComponent(input),
    urlDecode: (input) => decodeURIComponent(input),
    aesEncrypt,
    aesDecrypt,
    rsaEncrypt: (input, publicKeyPem, output = 'base64') =>
      publicEncrypt(
        { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
        toBuffer(input),
      ).toString(output),
    rsaDecrypt: (input, privateKeyPem, inputEncoding = 'base64') =>
      privateDecrypt(
        { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
        decodeInput(input, inputEncoding),
      ).toString('utf8'),
    rsaSign: (input, privateKeyPem, algorithm = 'sha256') =>
      nodeSign(algorithm, toBuffer(input), createPrivateKey(privateKeyPem)).toString('base64'),
    rsaVerify: (input, signature, publicKeyPem, algorithm = 'sha256') =>
      nodeVerify(
        algorithm,
        toBuffer(input),
        createPublicKey(publicKeyPem),
        Buffer.from(signature, 'base64'),
      ),
    constantTimeEqual: (a, b) => {
      const left = Buffer.from(a);
      const right = Buffer.from(b);
      return left.length === right.length && timingSafeEqual(left, right);
    },
  };
}
