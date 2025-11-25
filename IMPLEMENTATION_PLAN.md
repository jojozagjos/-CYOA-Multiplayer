# CYOA Multiplayer - Comprehensive Update Plan

## Changes Requested & Status

### ✅ COMPLETED
1. **Story ordering** - Narration now appears last after system messages
2. **Credits blocking** - Game won't start until credits complete
3. **Save/load system** - In-memory campaign saves with full state preservation

### 🚧 IN PROGRESS (Need to implement)

#### High Priority - UI/UX
1. **Black screen fade transitions** - Replace current transitions with fullscreen black fade
2. **Redesigned game screen** - Split into:
   - Current narration display (highlighted, prominent)
   - Action/proposal interface (clean, separated)
   - Party sidebar (simplified)
3. **Settings panel** - Accessible from any screen with:
   - Master volume
   - Music volume  
   - SFX volume
   - Narration volume
   - Save settings to localStorage
   - Global (all players see/hear same content)

#### Medium Priority - Audio
4. **Background music** - Theme-appropriate ambient music
5. **Sound effects** - Procedural SFX for actions/events
6. **TTS Narration** - Web Speech API for narration voiceover

#### Medium Priority - Visual
7. **Dynamic backgrounds** - Use Unsplash API for theme-appropriate images
8. **Animations** - Smooth text animations for story entries

### Implementation Notes

**Audio System Design:**
- Use Web Audio API for music/SFX
- Use SpeechSynthesis API for TTS narration
- All audio synchronized across clients via socket events
- Volume controls are client-side only (localStorage)
- Playback timing is server-controlled to ensure sync

**Settings Panel:**
- Fixed overlay accessible via gear icon on all screens
- Saves to localStorage: `cyoa_settings`
- Does NOT affect gameplay speed or visual presentation
- Only controls local audio volume levels

**Visual Assets:**
- Unsplash API (no key required for basic use)
- Fallback to CSS gradients if API fails
- Theme-mapped keywords for image search

**Game Screen Redesign:**
- Top: Current narration (large, prominent, animated)
- Middle: Story log (scrollable history)
- Bottom: Input area (context-dependent)
- Right sidebar: Party status (compact)

## Files to Update

1. `public/index.html` - Add settings panel, redesign game screen, add fade overlay
2. `public/styles.css` - Black fade transitions, new game layout, settings styles
3. `public/client.js` - Audio system, settings management, TTS, API integration
4. `public/audio.js` (new) - Separate audio management module
5. `server.js` - Add audio sync events

## Next Steps

1. Implement black fade transitions
2. Add settings panel HTML/CSS
3. Redesign game screen layout
4. Implement audio system
5. Add Unsplash integration
6. Add text animations
7. Test end-to-end

Would you like me to proceed with implementing all of these changes?
