# ChordPro Link

A web application for rendering ChordPro format text files with synchronized viewing across multiple devices. Perfect for bands who want to share chord charts and lyrics in real-time.

**Note:** This is a localhost/development version. The application runs on `localhost:3000` and requires all users to be on the same local network to connect to the master session.

## Features

- **Master View**: Control the session, scroll position, and song selection
- **Client View**: Viewers automatically sync with the master's scroll position
- **Real-time Synchronization**: WebSocket-based synchronization for instant updates
- **Setlist Management**: Upload multiple songs, reorder with drag-and-drop, quick navigation
- **Persistent Storage**: All files and setlists stored locally using IndexedDB and localStorage
- **Custom Session IDs**: Create memorable session names (e.g., "blue-guitar")
- **Dark/Light Mode**: Toggle between themes for different lighting conditions
- **Text Size Controls**: Adjust text size while maintaining chord-lyric alignment
- **Mobile Responsive**: Full functionality on mobile and tablet devices
- **Line-based Scroll Sync**: Synchronized viewing works across different text zoom levels
- **ChordPro Rendering**: Beautiful rendering of lyrics with chords positioned above

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. **Master** creates a session and uploads a ChordPro file
2. **Clients** join the session using a session ID
3. When the master scrolls, all clients automatically sync to the same position
4. Perfect for band rehearsals and performances!

## ChordPro Format

ChordPro files use a simple text format:
- Chords are placed in square brackets: `[D]`, `[G]`, `[Am]`
- Directives use curly braces: `{title: Song Name}`
- Comments start with `#`

Example:
```
{title: Swing Low Sweet Chariot}
Swing [D]low, sweet [G]chari[D]ot,
Comin' for to carry me [A7]home.
```

## License

MIT
