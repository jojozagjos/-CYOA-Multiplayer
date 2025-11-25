# Quick Start Guide

## Run the Server

```bash
cd "C:/Users/jgsla/OneDrive/Desktop/Github-Projects/-CYOA-Multiplayer"
npm start
```

Server will run on `http://localhost:3000`

## Test the New Features

### 1. Black Fade Transitions
- Navigate between screens (Main → Lobby → Theme Vote → Game)
- Watch for smooth black fade effect

### 2. Settings Panel
- Click ⚙️ icon (top-right corner, any screen)
- Adjust volume sliders
- Close and reopen - settings should persist

### 3. Full Game Flow
1. **Open two browser windows** to `http://localhost:3000`
2. **Window 1**: Enter name → Click "Host Game"
3. **Window 2**: Enter name → Enter lobby code → Click "Join"
4. **Both windows**: Create characters (name, role, trait, draw)
5. **Window 1 (host)**: Click "Start Game"
6. **Both**: Vote for a theme
7. **Watch**: Credits sequence (5s per character)
8. **Listen**: Background music starts automatically
9. **See**: Current narration at top, theme background image

### 4. Audio Features
- **Music**: Plays automatically after credits (theme-specific)
- **SFX**: Click action button / vote - hear beep sounds
- **TTS**: Narration reads automatically
- **Settings**: Adjust all volumes in settings panel

### 5. Game UI
- **Top**: Current situation (large, prominent)
- **Middle-left**: Story log (scrollable history)
- **Bottom-left**: Your action input
- **Right**: Party status sidebar

### 6. Save/Load
- **Save**: Click 💾 Save button (host only)
- **Note Campaign ID** shown in game
- **Load**: Go to main menu → Enter Campaign ID → Click Load

## Keyboard Shortcuts
- `Tab`: Navigate between inputs
- `Enter`/`Space`: Activate theme items
- `Esc`: Close settings (if implemented)

## Troubleshooting

### No audio?
- Click anywhere on page first (browsers require user interaction)
- Check settings panel volumes
- Check browser audio isn't muted

### Background image not loading?
- Check internet connection (Unsplash API)
- May take a few seconds to load
- Falls back to gradient if fails

### TTS not working?
- Browser compatibility (Chrome/Edge work best)
- Check narration volume in settings
- Some browsers need voices downloaded first

## Features Summary

✨ **Black fade screen transitions**  
🎵 **Procedural theme music**  
🔊 **Interactive sound effects**  
🗣️ **Text-to-speech narration**  
🖼️ **Dynamic theme backgrounds**  
⚙️ **Persistent settings**  
🎬 **Animated credits sequence**  
📖 **Prominent narration display**  
💾 **Full campaign save/load**  

Enjoy your enhanced CYOA experience! 🚀
