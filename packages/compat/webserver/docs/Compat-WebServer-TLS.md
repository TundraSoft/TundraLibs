# TLS Configuration

Guide to configuring HTTPS/TLS for the WebServer module.

## Table of Contents

- [Overview](#overview)
- [Certificate Types](#certificate-types)
- [File-Based Configuration](#file-based-configuration)
- [String-Based Configuration](#string-based-configuration)
- [Certificate Authority (CA)](#certificate-authority-ca)
- [Generating Certificates](#generating-certificates)
- [Runtime Differences](#runtime-differences)
- [Troubleshooting](#troubleshooting)

## Overview

The WebServer module supports TLS (Transport Layer Security) for secure HTTPS connections. TLS encrypts data between client and server, preventing eavesdropping and tampering.

Two configuration approaches are supported:

1. **File-based**: Paths to certificate/key files
2. **String-based**: Certificate/key content as strings

## Certificate Types

| File                  | Purpose                     | Format |
| --------------------- | --------------------------- | ------ |
| Certificate (`cert`)  | Server's public certificate | PEM    |
| Private Key (`key`)   | Server's private key        | PEM    |
| CA Certificate (`ca`) | Certificate authority chain | PEM    |

## File-Based Configuration

Reference certificate files by path:

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('SecureAPI', {
  mode: 'TCP',
  port: 443,
  tls: {
    certFile: '/etc/ssl/server.crt',
    keyFile: '/etc/ssl/server.key',
    caFile: '/etc/ssl/ca.crt', // Optional
  },
  handler: (req) => new Response('Secure!'),
});
```

### Options

| Option     | Type     | Required | Description              |
| ---------- | -------- | -------- | ------------------------ |
| `certFile` | `string` | Yes      | Path to certificate file |
| `keyFile`  | `string` | Yes      | Path to private key file |
| `caFile`   | `string` | No       | Path to CA certificate   |

### Validation

During construction, the server validates:

- Both `certFile` and `keyFile` are provided
- Files exist and are readable
- You have read permission for all files

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

// This will throw ServerConfigurationError
const server = new WebServer('API', {
  mode: 'TCP',
  port: 443,
  tls: {
    certFile: '/missing/cert.pem', // File doesn't exist
    keyFile: '/etc/ssl/key.pem',
  },
  handler: (req) => new Response('OK'),
});
```

## String-Based Configuration

Provide certificate content directly:

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

declare const caCert: string;

const cert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0Gcx...
-----END CERTIFICATE-----`;

const key = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwgg...
-----END PRIVATE KEY-----`;

const server = new WebServer('SecureAPI', {
  mode: 'TCP',
  port: 443,
  tls: {
    cert,
    key,
    ca: [caCert], // Optional, array of CA certs
  },
  handler: (req) => new Response('Secure!'),
});
```

### Options

| Option | Type       | Required | Description               |
| ------ | ---------- | -------- | ------------------------- |
| `cert` | `string`   | Yes      | Certificate content (PEM) |
| `key`  | `string`   | Yes      | Private key content (PEM) |
| `ca`   | `string[]` | No       | Array of CA certificates  |

### Use Cases

String-based configuration is useful when:

- Certificates are stored in environment variables
- Certificates are loaded from a secrets manager
- Certificates are embedded in the application

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

// From environment variables
const server = new WebServer('API', {
  mode: 'TCP',
  port: 443,
  tls: {
    cert: process.env.TLS_CERT!,
    key: process.env.TLS_KEY!,
  },
  handler: (req) => new Response('OK'),
});
```

## Certificate Authority (CA)

The CA certificate is used to verify client certificates or establish a trust chain.

### File-Based

```typescript ignore
tls: {
  certFile: '/etc/ssl/server.crt',
  keyFile: '/etc/ssl/server.key',
  caFile: '/etc/ssl/ca-bundle.crt',
}
```

### String-Based

```typescript ignore
tls: {
  cert: serverCert,
  key: serverKey,
  ca: [
    rootCaCert,
    intermediateCaCert,
  ],
}
```

## Generating Certificates

### Development (Self-Signed)

Generate a self-signed certificate for development:

```bash
# Generate private key
openssl genrsa -out server.key 2048

# Generate self-signed certificate (valid for 365 days)
openssl req -new -x509 -key server.key -out server.crt -days 365 \
  -subj "/CN=localhost"
```

### With Subject Alternative Names (SAN)

For multiple domains or IP addresses:

```bash
# Create config file (san.cnf)
cat > san.cnf << EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = myapp.local
IP.1 = 127.0.0.1
IP.2 = 192.168.1.100
EOF

# Generate certificate with SANs
openssl req -new -x509 -key server.key -out server.crt -days 365 \
  -config san.cnf
```

### Production (Let's Encrypt)

For production, use a certificate from a trusted CA:

```bash
# Using certbot for Let's Encrypt
certbot certonly --standalone -d example.com

# Certificates are saved to:
# /etc/letsencrypt/live/example.com/fullchain.pem
# /etc/letsencrypt/live/example.com/privkey.pem
```

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('ProdAPI', {
  mode: 'TCP',
  port: 443,
  tls: {
    certFile: '/etc/letsencrypt/live/example.com/fullchain.pem',
    keyFile: '/etc/letsencrypt/live/example.com/privkey.pem',
  },
  handler: (req) => new Response('OK'),
});
```

## Runtime Differences

### Bun

- Uses `Bun.file()` for efficient certificate loading
- Supports all standard TLS options

```typescript ignore
// Bun internally does:
tls: {
  cert: Bun.file(certFile),
  key: Bun.file(keyFile),
}
```

### Deno

- Reads certificate files into memory
- Uses `Deno.serve()` TLS options

```typescript ignore
// Deno internally does:
{
  cert: Deno.readTextFileSync(certFile),
  key: Deno.readTextFileSync(keyFile),
}
```

### Node.js

- Uses `node:https` module
- Standard Node.js TLS options

```typescript ignore
// Node.js internally does:
https.createServer({
  cert: fs.readFileSync(certFile),
  key: fs.readFileSync(keyFile),
}, handler);
```

## Troubleshooting

### Certificate Not Trusted

**Browser shows "Not Secure" or certificate error**

For self-signed certificates:

1. Add to system trust store
2. Use `--ignore-certificate-errors` flag (development only)
3. Use a proper CA-signed certificate

### Permission Denied

**`ServerPermissionError: Insufficient permissions`**

```bash
# Check file permissions
ls -la /etc/ssl/server.*

# Fix permissions (be careful with security)
chmod 644 /etc/ssl/server.crt
chmod 600 /etc/ssl/server.key
```

### Key Mismatch

**Certificate and key don't match**

Verify they match:

```bash
# Compare modulus hashes
openssl x509 -noout -modulus -in server.crt | openssl md5
openssl rsa -noout -modulus -in server.key | openssl md5

# Hashes should match
```

### Encrypted Key

**Key requires passphrase but not provided**

Passphrase-protected keys are not supported due to Deno limitations. Decrypt the key before use:

```bash
# Decrypt the private key
openssl rsa -in encrypted.key -out decrypted.key

# Or for EC keys
openssl ec -in encrypted.key -out decrypted.key
```

> ⚠️ **Security Note**: Store decrypted keys with restrictive permissions (`chmod 600`) and never commit them to version control.

### Certificate Expired

**`ERR_CERT_DATE_INVALID`**

Check expiration:

```bash
openssl x509 -enddate -noout -in server.crt
```

Renew the certificate before expiration.

### Wrong Certificate Format

**`unable to load certificate`**

Ensure certificates are in PEM format (base64 with headers):

```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiU...
-----END CERTIFICATE-----
```

Convert DER to PEM if needed:

```bash
openssl x509 -inform DER -in cert.der -out cert.pem
```

---

[← Back to WebServer](../Compat-WebServer.md)
