# M-Audio Axiom 61 DirectLink for Bitwig Studio

Controller script for full two-way integration of M-Audio Axiom 61 with Bitwig Studio via DirectLink protocol.

## Features

### Mixer
- **Faders 1-8**: Control volume of 8 tracks
- **Master Fader**: Control master volume
- **Mute/Solo/Record Buttons**: Toggle Mute/Solo/Record for tracks
- **Encoders**: Control pan, device parameters, or sends

### Transport
- **Play**: Play/Pause
- **Stop**: Stop
- **Record**: Record
- **Loop**: Toggle Loop mode
- **Rewind/Fast Forward**: Rewind/Forward (hold)

### Navigation
- **Prev/Next Track**: Navigate to previous/next track
- **Bank Up/Down**: Scroll track bank

### Display
- Shows selected track name
- Shows current encoder mode

### Two-way Synchronization
- Fader LEDs display current volume
- Button LEDs display Mute/Solo/Record states
- Transport LEDs synchronized with DAW

## Installation

### Step 1: Copy the Script

Copy the `Axiom61DirectLink.control.js` file to the Bitwig Studio controller scripts directory:

**Windows:**
```
%USERPROFILE%\Documents\Bitwig Studio\Controller Scripts\
```

**macOS:**
```
~/Documents/Bitwig Studio/Controller Scripts/
```

**Linux:**
```
~/Bitwig Studio/Controller Scripts/
```

### Step 2: Configure MIDI Ports

1. Connect M-Audio Axiom 61 to your computer
2. Launch Bitwig Studio
3. Open **Settings** → **Controllers**
4. Click **Add Controller**
5. Select **M-Audio** → **Axiom 61 DirectLink**
6. Make sure MIDI ports are configured correctly:
   - **Input 1**: Axiom 61 (standard MIDI - keys, pads, controllers)
   - **Input 2**: DirectLink Out (responses from controller)
   - **Output 1**: Axiom 61 (standard MIDI)
   - **Output 2**: DirectLink Out (indicators and display)

### Step 3: Activation

1. Enable the script (On/Off button)
2. "BITWIG" text should appear on the controller display
3. Indicators should synchronize with DAW

## Controls

### Pads (DirectLink Mode)

| Pad | Without Shift | With Shift |
|-----|---------------|------------|
| 1 | Launch clip | PAN mode (encoders) |
| 2 | Launch clip | DEVICE mode (encoders) |
| 3 | Launch clip | SEND mode (encoders) |
| 4 | Launch clip | Toggle Metronome |
| 5 | Launch clip | Undo |
| 6 | Launch clip | Redo |
| 7 | Launch clip | Tap Tempo |
| 8 | Launch clip | Toggle Loop |

### Mute/Solo/Record Buttons

- **Normal mode**: Mute/Solo/Record depending on current mode
- **Shift + Button 1-8**: Select track
- **Button 9 or Flip**: Cycle mode Mute → Solo → Record → Mute

### Settings (Preferences)

In Bitwig Studio: **Settings** → **Controllers** → **Axiom 61 DirectLink**

Available settings:
- **Button Mode**: Select button mode (Mute/Solo/Record)

### Navigation

- **Prev/Next Track**: Select previous/next track
- **Bank Up/Down**: Scroll bank of 8 tracks
- **Shift + Bank Up/Down**: Navigate scenes

## Files

```
├── Axiom61DirectLink.control.js  # Main script
├── README.md                     # Quick start
├── README_EN.md                  # This file
└── README_RU.md                  # Russian documentation
```

## Technical Details

### MIDI Ports

| Port | Name | Direction | Purpose |
|------|------|-----------|---------|
| 0 | Axiom USB Out | Input/Output | Standard MIDI (keys, pads, controllers) |
| 1 | DirectLink Out | Input/Output | DirectLink protocol (indicators, display, responses) |

### SysEx Commands

```
Enable DirectLink:    F0 00 01 05 20 7F 20 2E F7
Disable DirectLink:   F0 00 01 05 20 7F 20 00 F7
Clear Display:        F0 00 01 05 20 7F 10 F7
Display Text:         F0 00 01 05 20 7F 11 LL PP PP <data> F7
```

### CC Mapping

| CC | Assignment |
|----|------------|
| 17-24 | Encoders (relative mode) |
| 33-40 | Faders 1-8 |
| 41 | Master Fader |
| 49-56 | Mute/Solo Buttons |
| 110-111 | Track Navigation |
| 113-118 | Transport (Loop, RW, FF, Stop, Play, Rec) |

## Troubleshooting

### Script Not Detected

1. Make sure the file is in the correct directory
2. Restart Bitwig Studio
3. Check that the filename has `.control.js` extension

### Indicators Not Working

1. Make sure DirectLink Out port is configured correctly
2. Check that the controller is in DirectLink mode
3. On Axiom 61, DirectLink mode must be enabled (see controller manual)

### Display Not Showing Text

1. Check DirectLink Out port connection
2. Make sure the script initialized successfully (check console)

### Encoders Not Working Correctly

1. Make sure encoders are set to Relative mode
2. On Axiom 61: Settings → Encoder Mode → Relative

## Compatibility

- Bitwig Studio 3.0+ (API v6)
- M-Audio Axiom 61 (first generation)
- May be compatible with other Axiom models (testing required)

## License

MIT License

## Acknowledgments

- Author of original Ableton Live scripts for reference
- z.ai for the glm-5 model, without which reverse engineering and creating this script would have been impossible
