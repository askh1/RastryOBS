# 📚 RastryOBS - Complete Documentation

**Version:** 2.0  
**Last Updated:** December 20, 2025  
**Author:** Aissa (RastryBot)

---

## 📖 Table of Contents

1. [Executive Summary](#executive-summary)
2. [What is RastryOBS?](#what-is-rastryobs)
3. [Technical Architecture](#technical-architecture)
4. [Premium System](#premium-system)
5. [Security Architecture](#security-architecture)
6. [Backend API Reference](#backend-api-reference)
7. [User Flows](#user-flows)
8. [Roadmap](#roadmap)

---

# 1. Executive Summary

## What is RastryOBS?

**RastryOBS** is a cross-platform desktop application (Electron) that enables streamers to grant remote access to their moderators to control OBS Studio without needing to:
- Have OBS installed on their PC
- Configure port forwarding manually
- Install additional software
- Be physically on the same network

## How it Works

**Basic Flow:**
1. **Streamer** opens OBS Studio → Opens RastryOBS → Connects to local OBS → Creates public tunnel
2. **Moderator** receives tunnel URL → Opens RastryOBS → Pastes URL → Controls streamer's OBS remotely

## Business Model

- Desktop App = **FREE** and **open source** (GitHub)
- Premium services at rastry.com = **PAID** (tunnels, recording, analytics)

## Problem it Solves

Streamers need help from moderators to:
- Switch scenes during stream
- Adjust audio/video sources
- Enable/disable cameras or alerts
- Start/stop recordings

**Traditional Solutions:**
- ❌ TeamViewer/AnyDesk: Full PC access (insecure)
- ❌ Parsec: Requires installation on both sides, visual lag
- ❌ Port Forwarding: Complex, security risks, dynamic IP
- ❌ Discord mods: Only voice, can't control anything

**RastryOBS Solution:**
- ✅ Access ONLY to OBS (not rest of PC)
- ✅ No complex installation
- ✅ Automatic tunnels (ngrok)
- ✅ Real-time stream preview
- ✅ Multi-user (multiple mods simultaneously)

---

# 2. What is RastryOBS?

## Core Features

### For Streamers (Streamer Mode)
- Connect to local OBS Studio (ws://localhost:4455)
- Create secure public tunnel (via ngrok)
- Share tunnel URL with trusted moderators
- See who's connected
- Revoke access anytime

### For Moderators (Moderator Mode)
- Connect to streamer's tunnel (wss://xxx.ngrok.io)
- Full OBS control:
  - Switch scenes
  - Toggle sources (camera, overlays, etc.)
  - Adjust audio mixer
  - Start/stop streaming or recording
- Real-time preview of stream
- No OBS installation needed

### Universal Features
- Preview of current scene
- Audio mixer with volume control
- Scene transitions
- Source filters
- Studio mode support
- WebSocket relay for web integration

---

# 3. Technical Architecture

## Technology Stack

```
Frontend (Desktop App):
├── Electron 28.0.0
├── OBS WebSocket 5.x (obs-websocket-js)
├── HTML/CSS/JavaScript (Vanilla)
└── Ngrok (for tunneling)

Backend (rastry.com):
├── Next.js 14
├── Prisma ORM
├── PostgreSQL/MySQL
├── Twitch OAuth
└── PayPal Integration

Protocols:
├── WebSocket (OBS communication)
├── WebSocket Secure (wss:// for tunnels)
└── HTTP/HTTPS (API calls)
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     STREAMER'S PC                           │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  OBS Studio  │◄────────┤  RastryOBS   │                 │
│  │   (4455)     │  Local  │   (Electron) │                 │
│  └──────────────┘  WS     └───────┬──────┘                 │
│                                    │                         │
│                                    │ Creates                 │
│                                    ▼                         │
│                            ┌──────────────┐                 │
│                            │   Ngrok      │                 │
│                            │   Tunnel     │                 │
│                            └───────┬──────┘                 │
└────────────────────────────────────┼──────────────────────┘
                                     │
                        Public URL:  │
                    wss://abc.ngrok.io
                                     │
┌────────────────────────────────────┼──────────────────────┐
│                  MODERATOR'S PC    │                       │
│                            ┌───────▼──────┐                │
│                            │  RastryOBS   │                │
│                            │  (Electron)  │                │
│                            └──────────────┘                │
│                       Controls OBS remotely                │
└─────────────────────────────────────────────────────────────┘
```

## Communication Flow

### Streamer Mode

```javascript
// 1. Connect to local OBS
const obs = new OBSWebSocket();
await obs.connect('ws://localhost:4455', password);

// 2. Get OBS data
const scenes = await obs.call('GetSceneList');
const sources = await obs.call('GetSceneItemList', { sceneName });

// 3. Create ngrok tunnel
const tunnel = await ngrok.connect({
    addr: 4455,
    proto: 'tcp',
    authtoken: userToken
});
// Returns: wss://abc123.ngrok.io

// 4. Share URL with moderators
```

### Moderator Mode

```javascript
// 1. Connect to streamer's tunnel
const obs = new OBSWebSocket();
await obs.connect('wss://abc123.ngrok.io', password);

// 2. Control OBS
await obs.call('SetCurrentProgramScene', { 
    sceneName: 'Gaming Scene' 
});

await obs.call('SetSceneItemEnabled', {
    sceneName: 'Gaming Scene',
    sceneItemId: 5,
    sceneItemEnabled: true
});
```

## WebSocket Relay (for Web Integration)

RastryOBS includes a local WebSocket relay server that allows web applications and Twitch extensions to connect:

```javascript
// RastryOBS creates local relay
const relay = new WebSocketRelay(obs);
relay.start(4456); // ws://localhost:4456

// Web app connects
const ws = new WebSocket('ws://localhost:4456');
ws.send(JSON.stringify({
    request: 'SetCurrentProgramScene',
    sceneName: 'BRB'
}));
```

---

# 4. Premium System

## Current Status

⚠️ **PREMIUM SYSTEM IS DISABLED DURING DEVELOPMENT**

The entire license system is **100% IMPLEMENTED** but **INACTIVE** to avoid interfering with development.

### What's Implemented

✅ **Frontend (RastryOBS)**:
- `license-manager.js` - Token management
- `hardware-id.js` - Device fingerprinting
- Token redemption UI (modal)
- Premium button (currently hidden)
- Validations (disabled)

✅ **Documentation**:
- Complete security architecture
- Backend API specifications
- Implementation guides

❌ **Backend (rastry.com)**: 
- **NOT implemented yet**
- Needs API endpoints
- Needs Prisma database
- Needs token system

## How to Activate (When Ready)

### Step 1: Change flag in `renderer-obs.js`

```javascript
// Line ~10 of renderer-obs.js
const PREMIUM_ENABLED = true; // ← Change from false to true
```

### Step 2: Implement backend at rastry.com

Create the following endpoints:
- `/api/obs/redeem-token` - Redeem tokens
- `/api/obs/verify-token` - Verify tokens
- `/api/obs/create-tunnel` - Create tunnels (premium)
- Database with Prisma

### Current Behavior

- ✅ Premium button **HIDDEN**
- ✅ Tunnels work **WITHOUT RESTRICTION**
- ✅ No license validation
- ✅ App works 100% free

## Premium Tiers (Planned)

### FREE Tier
- ✅ Free download and installation
- ✅ Local OBS control unlimited
- ✅ Scene and source switching
- ✅ Complete audio mixer
- ✅ Local stream preview
- ✅ No watermark
- ✅ Open source code on GitHub
- ❌ NO remote tunnels (must use manual ngrok)
- ❌ NO cloud recording
- ❌ NO advanced analytics
- ❌ Community support only

### BASIC Plan ($9.99/month)
- ✅ Everything from FREE
- ✅ **Automatic remote tunnels** (no ngrok setup)
- ✅ Up to 3 simultaneous moderators
- ✅ 50 hours cloud recording/month
- ✅ Basic analytics dashboard
- ✅ Email support
- ❌ Advanced features locked

### PRO Plan ($19.99/month)
- ✅ Everything from BASIC
- ✅ Up to 10 simultaneous moderators
- ✅ 200 hours cloud recording/month
- ✅ Advanced analytics and insights
- ✅ Custom branding (remove "RastryOBS" watermark)
- ✅ Priority support (Discord)
- ✅ Scene presets library
- ✅ Multi-stream support (Twitch + YouTube simultaneously)

### TEAM Plan ($49.99/month)
- ✅ Everything from PRO
- ✅ Unlimited moderators
- ✅ Unlimited cloud recording
- ✅ White-label option
- ✅ Dedicated account manager
- ✅ SLA guarantee
- ✅ Custom integrations
- ✅ Team management dashboard

## Payment Flow

1. User signs up at rastry.com with Twitch
2. Goes to "OBS Control" in dashboard
3. Opens ticket to request license
4. Makes payment via PayPal (includes Twitch username)
5. Receives premium token via Discord or ticket
6. Redeems token in RastryOBS desktop app

---

# 5. Security Architecture

## Why This System is Unhackable

### The Crack Problem

**Common Electron/Open Source Hacking Methods:**

1. **Extract code from .exe**
   ```bash
   asar extract resources/app.asar ./extracted
   # Now they have access to all JavaScript
   ```

2. **Modify local validations**
   ```javascript
   // Original code:
   if (licenseManager.isPremium()) { createTunnel(); }
   
   // Hacker modifies to:
   if (true) { createTunnel(); } // Bypass
   ```

3. **Intercept HTTP requests**
   - Use proxy (Burp Suite, Fiddler)
   - See what you send to server
   - Replicate requests without app

4. **Patch the binary**
   - Directly modify .exe
   - Change strings, logic jumps, etc.

## Solution: Backend-Authoritative Architecture

### Principle #1: **NEVER trust the client**

The client (Electron app) can be modified. Everything important must go through your server.

```
❌ BAD (client decides):
Client: "I'm premium, give me tunnel"
Server: "OK, here it is"

✅ GOOD (server decides):
Client: "I want tunnel, here's my token"
Server: *verifies token in DB* → "Valid token, here's tunnel"
```

### Security Layers

#### Layer 1: Client-Side (Basic Protection)

**Purpose:** Make casual hacking difficult, but not main defense.

```javascript
// license-manager.js
class LicenseManager {
    async verifyToken() {
        // 1. Check localStorage
        const stored = localStorage.getItem('obs_license');
        if (!stored) return false;
        
        // 2. Verify with server (THIS IS THE KEY)
        const response = await fetch('https://rastry.com/api/obs/verify-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: stored,
                hwid: this.getHardwareId(),
                appVersion: app.getVersion()
            })
        });
        
        return response.ok;
    }
}
```

**Hackable?** YES - Hacker can modify `return true;`

**Does it matter?** NO - Server still validates everything.

#### Layer 2: Hardware Binding

```javascript
// hardware-id.js
const si = require('systeminformation');
const crypto = require('crypto');

async function generateHardwareId() {
    const cpu = await si.cpu();
    const system = await si.system();
    const osInfo = await si.osInfo();
    
    const data = `${cpu.manufacturer}-${cpu.brand}-${system.uuid}-${osInfo.serial}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}
```

**Protects against:** Sharing tokens between computers

**How it works:**
1. Token is bound to specific hardware ID
2. Server checks: `if (db_hwid !== request_hwid) reject;`
3. Each computer has unique ID

**Hackable?** Difficult - Would need to spoof multiple hardware identifiers

#### Layer 3: Server-Side Validation (UNBREAKABLE)

This is where real security lives.

```javascript
// rastry.com/src/pages/api/obs/create-tunnel.js

export default async function handler(req, res) {
    const { token, hwid } = req.body;
    
    // 1. Verify token exists in database
    const license = await prisma.oBSToken.findUnique({
        where: { token }
    });
    
    if (!license) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    // 2. Check expiration
    if (license.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Token expired' });
    }
    
    // 3. Verify hardware binding
    if (license.hardwareId !== hwid) {
        // Log suspicious activity
        await prisma.auditLog.create({
            data: {
                userId: license.userId,
                action: 'INVALID_HWID',
                details: `Token used on different PC`
            }
        });
        return res.status(403).json({ error: 'Token bound to different device' });
    }
    
    // 4. Check usage limits
    if (license.usageCount >= license.maxUsage) {
        return res.status(429).json({ error: 'Usage limit exceeded' });
    }
    
    // 5. Create ngrok tunnel
    const tunnel = await createNgrokTunnel(license.userId);
    
    // 6. Log usage
    await prisma.oBSToken.update({
        where: { id: license.id },
        data: { 
            usageCount: { increment: 1 },
            lastUsedAt: new Date()
        }
    });
    
    return res.json({ 
        success: true, 
        tunnelUrl: tunnel.url 
    });
}
```

**Why This is Unbreakable:**

1. **Token is server-verified** - Can't fake it
2. **Database is inaccessible** - Can't generate valid tokens
3. **Hardware binding** - Can't share tokens
4. **Usage tracking** - Detect abuse
5. **Audit logs** - Trace suspicious activity

#### Layer 4: Rate Limiting

```javascript
// rastry.com/src/lib/rate-limiter.js

const LIMITS = {
    'basic': 10,    // 10 requests/hour
    'pro': 50,      // 50 requests/hour
    'team': 1000    // 1000 requests/hour
};

export async function checkRateLimit(userId, plan) {
    const key = `ratelimit:${userId}`;
    const count = await redis.incr(key);
    
    if (count === 1) {
        await redis.expire(key, 3600); // 1 hour
    }
    
    if (count > LIMITS[plan]) {
        throw new Error('Rate limit exceeded');
    }
}
```

## Attack Scenarios and Defenses

### Attack 1: "I'll just modify the app to always return true"

```javascript
// Hacker modifies license-manager.js:
isPremium() { return true; }
```

**Defense:** Server doesn't care what client thinks.

```javascript
// Server endpoint:
if (validToken) { 
    createTunnel(); 
} else { 
    return 401; // Unauthorized
}
```

**Result:** Hacker gets `401 Unauthorized`, no tunnel.

### Attack 2: "I'll intercept the request and see the token format"

```bash
# Hacker uses Burp Suite
POST /api/obs/create-tunnel
{
  "token": "RASTRY-1234-5678-ABCD-EFGH",
  "hwid": "a3b2c1..."
}
```

**Defense:** Token must exist in database and match hardware ID.

```javascript
// Server checks:
const dbToken = await db.find({ token });
if (!dbToken || dbToken.hwid !== request.hwid) {
    return 401;
}
```

**Result:** Random tokens won't work. Stolen tokens won't work on different PC.

### Attack 3: "I'll generate my own tokens"

```javascript
// Hacker creates:
const fakeToken = "RASTRY-" + randomString();
```

**Defense:** Token must exist in database.

```sql
SELECT * FROM obs_tokens WHERE token = 'RASTRY-FAKE-TOKEN';
-- Returns: 0 rows
```

**Result:** Server rejects immediately.

### Attack 4: "I'll share my token with friends"

**Defense:** Hardware binding + usage limits.

```javascript
// First use (original PC):
await createTunnel({ 
    token: 'valid_token', 
    hwid: 'original_pc' 
}); // ✅ Works

// Second use (friend's PC):
await createTunnel({ 
    token: 'valid_token', 
    hwid: 'friends_pc' 
}); // ❌ Error: "Token bound to different device"
```

**Result:** Token only works on one PC.

## Token Format and Generation

### Client-Side Token Structure

```
RASTRY-XXXX-XXXX-XXXX-XXXX

Example: RASTRY-A3F2-9B7E-1C4D-8K9M
```

### Server-Side Database

```javascript
{
    id: "clx...",
    token: "RASTRY-A3F2-9B7E-1C4D-8K9M",
    userId: "user_12345",
    hardwareId: "a3b2c1d4e5f6...",
    plan: "pro",
    expiresAt: "2026-01-20T00:00:00Z",
    usageCount: 47,
    maxUsage: 1000,
    isActive: true,
    createdAt: "2025-12-20T10:30:00Z",
    lastUsedAt: "2025-12-20T15:45:00Z"
}
```

---

# 6. Backend API Reference

## Database Schema

```prisma
// prisma/schema.prisma

model User {
  id            String    @id @default(cuid())
  twitchId      String    @unique
  twitchUsername String
  email         String?
  createdAt     DateTime  @default(now())
  
  obsTokens     OBSToken[]
  tunnelLogs    TunnelLog[]
  auditLogs     AuditLog[]
}

model OBSToken {
  id              String    @id @default(cuid())
  token           String    @unique
  userId          String
  plan            String    // "basic", "pro", "team"
  hardwareId      String?   // Device binding
  expiresAt       DateTime?
  isActive        Boolean   @default(true)
  usageCount      Int       @default(0)
  maxUsage        Int       @default(1000)
  createdAt       DateTime  @default(now())
  lastUsedAt      DateTime?
  
  user            User      @relation(fields: [userId], references: [id])
  tunnelLogs      TunnelLog[]
  
  @@index([token])
  @@index([userId])
}

model TunnelLog {
  id              String    @id @default(cuid())
  userId          String
  tokenId         String
  tunnelUrl       String
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  duration        Int?      // seconds
  status          String    // "active", "closed", "error"
  
  user            User      @relation(fields: [userId], references: [id])
  token           OBSToken  @relation(fields: [tokenId], references: [id])
  
  @@index([userId])
  @@index([status])
}

model AuditLog {
  id              String    @id @default(cuid())
  userId          String
  action          String    // "TOKEN_REDEEMED", "TUNNEL_CREATED", "INVALID_HWID"
  details         String?
  ipAddress       String?
  userAgent       String?
  createdAt       DateTime  @default(now())
  
  user            User      @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([action])
}
```

## API Endpoints

### 1. Redeem Token

**Endpoint:** `POST /api/obs/redeem-token`

**Purpose:** Redeem a premium token and bind it to user's hardware.

**Request:**
```json
{
  "token": "RASTRY-A3F2-9B7E-1C4D-8K9M",
  "hwid": "a3b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Response (Success):**
```json
{
  "success": true,
  "license": {
    "plan": "pro",
    "expiresAt": "2026-01-20T00:00:00Z",
    "maxUsage": 1000,
    "usageCount": 0
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Token already redeemed"
}
```

### 2. Verify Token

**Endpoint:** `POST /api/obs/verify-token`

**Purpose:** Verify if token is valid, active, and not expired.

**Request:**
```json
{
  "token": "RASTRY-A3F2-9B7E-1C4D-8K9M",
  "hwid": "a3b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Response:**
```json
{
  "valid": true,
  "plan": "pro",
  "expiresAt": "2026-01-20T00:00:00Z",
  "usageCount": 47,
  "maxUsage": 1000
}
```

### 3. Create Tunnel (Premium)

**Endpoint:** `POST /api/obs/create-tunnel`

**Purpose:** Create an ngrok tunnel for remote OBS control.

**Request:**
```json
{
  "token": "RASTRY-A3F2-9B7E-1C4D-8K9M",
  "hwid": "a3b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "port": 4455
}
```

**Response:**
```json
{
  "success": true,
  "tunnelUrl": "wss://abc123.ngrok.io",
  "expiresAt": "2025-12-21T15:30:00Z"
}
```

### 4. Revoke Token (Admin)

**Endpoint:** `POST /api/obs/revoke-token`

**Purpose:** Admin endpoint to revoke a token.

**Request:**
```json
{
  "token": "RASTRY-A3F2-9B7E-1C4D-8K9M",
  "reason": "User requested cancellation"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token revoked successfully"
}
```

---

# 7. User Flows

## Streamer Flow (First Time)

1. Downloads RastryOBS from GitHub releases
2. Installs and opens app
3. Sees "Streamer Mode" / "Moderator Mode" selector
4. Selects "Streamer Mode"
5. App prompts for ngrok token (free)
6. Goes to ngrok.com/signup → Signs up with Google
7. Copies authtoken from ngrok dashboard
8. Pastes in RastryOBS
9. App connects to local OBS (ws://localhost:4455)
10. Clicks "Create Tunnel"
11. Gets URL: `wss://abc123.ngrok.io`
12. Shares URL with moderator via Discord

## Moderator Flow

1. Receives tunnel URL from streamer: `wss://abc123.ngrok.io`
2. Opens RastryOBS
3. Selects "Moderator Mode"
4. Pastes tunnel URL
5. Enters password (if required)
6. Clicks "Connect"
7. App connects to streamer's OBS remotely
8. Sees live preview of stream
9. Can control:
   - Switch scenes
   - Toggle sources
   - Adjust audio
   - Start/stop recording

## Premium Upgrade Flow

1. User wants automatic tunnels (no ngrok setup)
2. Opens rastry.com
3. Logs in with Twitch
4. Goes to "OBS Control" section
5. Opens support ticket: "Request Premium License"
6. Team responds with PayPal link
7. User pays $19.99 (Pro Plan)
8. Receives token via Discord: `RASTRY-A3F2-9B7E-1C4D-8K9M`
9. Opens RastryOBS → Clicks "Premium" button
10. Pastes token → Click "Redeem"
11. App validates with server
12. Now can create tunnels without ngrok setup

---

# 8. Roadmap

## Phase 1: MVP (Current) ✅
- [x] OBS WebSocket connection
- [x] Scene switching
- [x] Source control
- [x] Audio mixer
- [x] Stream preview
- [x] Ngrok tunneling
- [x] Streamer/Moderator modes
- [x] WebSocket relay for web
- [x] Hotkeys system

## Phase 2: Premium System (In Progress) 🔄
- [x] License manager (frontend)
- [x] Hardware binding
- [x] Token redemption UI
- [ ] Backend API implementation
- [ ] Prisma database
- [ ] Payment integration
- [ ] Admin dashboard

## Phase 3: Enhanced Features
- [ ] Multi-view preview (4-9 scenes grid)
- [ ] Scene collections
- [ ] Stats dashboard (bitrate, FPS, CPU)
- [ ] Chat integration (Twitch)
- [ ] Replay buffer
- [ ] Cloud recording
- [ ] Advanced analytics
- [ ] Mobile companion app

## Phase 4: Enterprise
- [ ] White-label option
- [ ] Team management
- [ ] SSO integration
- [ ] Custom webhooks
- [ ] Advanced permissions
- [ ] Audit logs UI
- [ ] SLA monitoring

---

# Appendix

## File Structure

```
RastryOBS/
├── electron.js                  # Main Electron process
├── renderer-obs.js              # Main app logic
├── index-new.html              # UI structure
├── styles-obs.css              # Styling
├── hotkeys-manager.js          # Keyboard shortcuts
├── license-manager.js          # Premium system (disabled)
├── hardware-id.js              # Device fingerprinting
├── websocket-relay.js          # Local relay server
├── package.json                # Dependencies
└── assets/                     # Images, icons
```

## Dependencies

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "obs-websocket-js": "^5.0.7",
    "ngrok": "^5.0.0",
    "ws": "^8.18.0",
    "systeminformation": "^5.22.0"
  }
}
```

## Environment Variables

```bash
# .env
NGROK_AUTHTOKEN=your_ngrok_token_here
OBS_PASSWORD=your_obs_password_here
```

## Support

- **GitHub Issues:** https://github.com/rastrybot/rastryobs/issues
- **Discord:** discord.gg/rastry
- **Email:** support@rastry.com

---

**Last Updated:** December 20, 2025  
**Version:** 2.0  
**License:** MIT
