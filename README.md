# ChordPro Link

A web application for rendering ChordPro format text files with synchronized viewing across multiple devices. Perfect for bands who want to share chord charts and lyrics in real-time.

## Features

- **Master View**: Control the session and scroll position
- **Client View**: Viewers automatically sync with the master's scroll position
- **Real-time Synchronization**: WebSocket-based synchronization for instant updates
- **ChordPro Rendering**: Beautiful rendering of lyrics and chords

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
