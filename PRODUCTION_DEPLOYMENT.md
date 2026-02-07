# Production Deployment Guide for ChordPro Link

## Overview
This document outlines the production-ready configuration for deploying ChordPro Link to `chordpro.link` on Railway or similar cloud platforms.

## Key Features Implemented

### 1. Environment & Deployment Configuration
- ✅ `package.json` updated with Node.js engine requirement (`>=18.x`)
- ✅ Server listens on `0.0.0.0` for Railway proxy compatibility
- ✅ Express + Socket.io integration
- ✅ Environment variable support for socket URL

### 2. Backend Logic (Socket.io Rooms)
- ✅ **Room-based architecture**: Uses Socket.io rooms for session isolation
- ✅ **Connection State Recovery**: Enabled for mobile signal drops (2-minute window)
- ✅ **Unified `join-session` event**: First person to join becomes master
- ✅ **`sync-scroll` event**: Master broadcasts scroll percentage to room
- ✅ **Sticky Master**: Master session ID persists across reconnections

### 3. Frontend Enhancements
- ✅ **Deep Linking**: `chordpro.link/[ROOM_ID]` automatically joins as viewer
- ✅ **Wake Lock API**: Prevents screen dimming during performances
- ✅ **Auto-Reconnection**: Shows "Syncing..." status indicator
- ✅ **Connection Status**: Visual feedback for connected/disconnected/syncing states

### 4. Responsive UI
- ✅ **Mobile-First CSS**: Prevents horizontal scrolling on small screens
- ✅ **Copy Invite Link**: Uses Web Share API with clipboard fallback

## Deployment Steps

### 1. Environment Variables
Set these in your Railway/production environment:

```bash
NODE_ENV=production
PORT=3000
HOSTNAME=chordpro.link
NEXT_PUBLIC_SOCKET_URL=https://chordpro.link
```

### 2. Build & Start
```bash
npm install
npm run build
npm start
```

### 3. Server Configuration
- Server listens on `0.0.0.0:PORT` for Railway compatibility
- Socket.io path: `/api/socket`
- CORS configured for `chordpro.link` domain

## Architecture Details

### Socket Events

#### `join-session`
- **Purpose**: Unified event for joining/creating rooms
- **Parameters**: `roomID` (string), `masterSessionId` (optional string)
- **Behavior**: 
  - If room doesn't exist, first person becomes master
  - If masterSessionId matches, user regains master control
  - Returns room state and master status

#### `sync-scroll`
- **Purpose**: Master broadcasts scroll position
- **Parameters**: `roomID`, `scrollTopPercent`, `scrollPosition`, `lineIndex`
- **Behavior**: Only master can sync scroll; broadcasts to all clients in room

### Connection Recovery
- **Connection State Recovery**: Enabled with 2-minute window
- **Auto-Reconnection**: Infinite attempts with exponential backoff
- **Sticky Master**: Master session ID stored in localStorage for persistence

### Mobile Optimizations
- **Wake Lock**: Automatically requested when joining a session
- **Horizontal Scroll Prevention**: Container-level overflow hidden
- **Touch-Friendly**: Smooth scrolling on iOS devices
- **Responsive Text**: Maintains readability on small screens

## Testing Checklist

- [ ] Create room as master
- [ ] Join room as client via URL
- [ ] Verify scroll synchronization
- [ ] Test reconnection after network drop
- [ ] Verify master regains control after reconnection
- [ ] Test Wake Lock on mobile device
- [ ] Verify "Syncing..." indicator appears during reconnection
- [ ] Test share functionality (native + clipboard fallback)
- [ ] Verify mobile-first CSS (no horizontal scroll)
- [ ] Test on iOS and Android devices

## Production Considerations

### Scaling
- Current implementation uses in-memory Map for rooms
- For production scale, consider:
  - Redis adapter for Socket.io rooms
  - Database for room persistence
  - Load balancer with sticky sessions

### Security
- CORS configured for specific domains
- Room IDs are 4-6 alphanumeric characters
- No authentication required (by design for ease of use)

### Monitoring
- Server logs room creation/joining
- Client-side connection status tracking
- Consider adding analytics for room usage

## Troubleshooting

### Connection Issues
- Verify `NEXT_PUBLIC_SOCKET_URL` matches production domain
- Check CORS configuration in `server.js`
- Ensure server listens on `0.0.0.0`, not `localhost`

### Mobile Issues
- Wake Lock requires HTTPS in production
- Test on actual devices, not just emulators
- Verify Web Share API support (fallback to clipboard)

### Scroll Sync Issues
- Check that master is actually master (`isMaster: true`)
- Verify `sync-scroll` event is being emitted
- Check browser console for connection errors
