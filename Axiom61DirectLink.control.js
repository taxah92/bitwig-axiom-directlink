/**
 * Bitwig Controller Script for M-Audio Axiom 61 with DirectLink Protocol
 * 
 * Provides full two-way integration between Bitwig Studio and M-Audio Axiom 61
 * including mixer control, transport, device parameters, and display output.
 *
 * Author: Generated for Bitwig Studio
 * License: MIT
 * 
 * Based on DirectLink protocol documentation and Ableton Live scripts
 */

// Load Bitwig API version 7
loadAPI(7);

// Define controller metadata
host.defineController('M-Audio', 'Axiom 61 DirectLink', '1.0.0', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Axiom61DirectLink');
host.defineMidiPorts(2, 2);  // 2 input ports, 2 output ports (Standard + DirectLink)

// Device discovery names
// Port 0: Axiom USB Out (standard MIDI)
// Port 1: DirectLink Out (bidirectional - indicators, display, and responses)
host.addDeviceNameBasedDiscoveryPair(
    ['Axiom 61', 'DirectLink Out'],  // Input names (Standard + DirectLink)
    ['Axiom 61', 'DirectLink Out']   // Output names (Standard + DirectLink)
);

// ============================================
// Constants
// ============================================

const SYSEX = {
    START: [0xF0, 0x00, 0x01, 0x05, 0x20, 0x7F],
    END: 0xF7,
    ENABLE_DIRECTLINK: [0x20, 0x2E],
    DISABLE_DIRECTLINK: [0x20, 0x00],
    CLEAR_DISPLAY: [0x10],
    DISPLAY_TEXT: 0x11
};

const CC = {
    // Faders (Channel 16 for indicators)
    FADER_1: 33,
    FADER_2: 34,
    FADER_3: 35,
    FADER_4: 36,
    FADER_5: 37,
    FADER_6: 38,
    FADER_7: 39,
    FADER_8: 40,
    FADER_MASTER: 41,
    
    // Mute/Solo buttons
    MUTE_SOLO_1: 49,
    MUTE_SOLO_2: 50,
    MUTE_SOLO_3: 51,
    MUTE_SOLO_4: 52,
    MUTE_SOLO_5: 53,
    MUTE_SOLO_6: 54,
    MUTE_SOLO_7: 55,
    MUTE_SOLO_8: 56,
    
    // Navigation
    PREV_TRACK: 110,
    NEXT_TRACK: 111,
    
    // Transport
    LOOP: 113,
    REWIND: 114,
    FAST_FORWARD: 115,
    STOP: 116,
    PLAY: 117,
    RECORD: 118,
    
    // Encoders (input)
    ENCODER_1: 17,
    ENCODER_2: 18,
    ENCODER_3: 19,
    ENCODER_4: 20,
    ENCODER_5: 21,
    ENCODER_6: 22,
    ENCODER_7: 23,
    ENCODER_8: 24,
    
    // Other
    MUTE: 12,
    SHIFT: 13,
    BANK_DOWN: 14,
    BANK_UP: 15,
    MUTE_SOLO_FLIP: 57,
    PEEK: 78,
    DISPLAY_ON: 79,
    INST: 109,
    PANIC: 121
};

const NOTE = {
    // Pads on channel 16
    PAD_1: 60,
    PAD_2: 62,
    PAD_3: 64,
    PAD_4: 65,
    PAD_5: 67,
    PAD_6: 69,
    PAD_7: 71,
    PAD_8: 72
};

const WINDOW_SIZE = 8;

const INDICATOR_VALUE = {
    OFF: 0,
    ON: 127
};

// ============================================
// Global Variables
// ============================================

let midiIn = null;
let midiInDirectLink = null;
let midiOut = null;
let midiOutDirectLink = null;
let transport = null;
let trackBank = null;
let cursorTrack = null;
let cursorDevice = null;
let remoteControls = null;
let application = null;
let masterTrack = null;
let preferences = null;

let isShiftPressed = false;
let currentEncoderMode = 'pan';  // 'pan', 'device', 'send'
let sceneBank = null;
let activeTrackIndex = 0;

// Device parameter names for display
const deviceParamNames = [];
for (let i = 0; i < WINDOW_SIZE; i++) {
    deviceParamNames[i] = '';
}

// Pan parameter names for display
const panParamNames = [];
for (let i = 0; i < WINDOW_SIZE; i++) {
    panParamNames[i] = 'Pan';
}

// Send parameter names for display
const sendParamNames = [];
for (let i = 0; i < WINDOW_SIZE; i++) {
    sendParamNames[i] = 'Send';
}
let activeEncoderIndex = 0;

// Flag to block volume sync while using controller (encoder, fader, pitch, modwheel, aftertouch)
let controllerTouchTime = 0;
let encoderRestoreTask = null;
let controllerTouchCount = 0;

// Button mode settings
let buttonModeSetting = null;
let buttonMode = 'mute';  // 'mute', 'solo', 'record'

// Encoder mode settings
let encoderModeSetting = null;

// ============================================
// DirectLink Protocol Implementation
// ============================================

/**
 * Convert array of bytes to hex string for Bitwig sendSysex
 * @param {number[]} bytes - Array of MIDI bytes
 * @returns {string} Hex string representation
 */
function bytesToHexString(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return hex;
}

/**
 * Send SysEx message to DirectLink port
 * @param {number[]} data - SysEx data bytes (without F0 start and F7 end)
 */
function sendDirectLinkSysex(data) {
    const message = SYSEX.START.concat(data);
    message.push(SYSEX.END);
    const hexString = bytesToHexString(message);
    println('Sending SysEx: ' + hexString);
    midiOutDirectLink.sendSysex(hexString);
}

/**
 * Enable DirectLink mode on the controller
 */
function enableDirectLink() {
    sendDirectLinkSysex(SYSEX.ENABLE_DIRECTLINK);
    host.scheduleTask(function() {
        clearDisplay();
        displayText('BITWIG', 0);
    }, 500);  // Wait 500ms after enabling
}

/**
 * Disable DirectLink mode on the controller
 */
function disableDirectLink() {
    clearDisplay();
    turnOffAllIndicators();
    sendDirectLinkSysex(SYSEX.DISABLE_DIRECTLINK);
}

/**
 * Clear the controller display
 */
function clearDisplay() {
    sendDirectLinkSysex(SYSEX.CLEAR_DISPLAY);
}

/**
 * Display text on the controller LCD
 * @param {string} text - Text to display
 * @param {number} position - Display position (usually 0)
 */
function displayText(text, position) {
    // Format: F0 00 01 05 20 7F 11 01 PP PP <data> F7
    // Where 11 = display command, 01 = parameter, PP PP = position
    const data = [SYSEX.DISPLAY_TEXT, 0x01, (position >> 7) & 0x7F, position & 0x7F];
    for (let i = 0; i < text.length; i++) {
        data.push(text.charCodeAt(i));
    }
    sendDirectLinkSysex(data);
}

/**
 * Set indicator LED state
 * @param {number} cc - CC number for the indicator
 * @param {number} value - Value (0 = off, 127 = on)
 */
function setIndicator(cc, value) {
    midiOutDirectLink.sendMidi(0xBF, cc, value);  // 0xBF = Control Change on channel 16
}

/**
 * Turn off all indicator LEDs
 */
function turnOffAllIndicators() {
    // Fader LEDs
    for (let i = CC.FADER_1; i <= CC.FADER_MASTER; i++) {
        setIndicator(i, INDICATOR_VALUE.OFF);
    }
    
    // Mute/Solo LEDs
    for (let i = CC.MUTE_SOLO_1; i <= CC.MUTE_SOLO_8; i++) {
        setIndicator(i, INDICATOR_VALUE.OFF);
    }
    
    // Navigation LEDs
    setIndicator(CC.PREV_TRACK, INDICATOR_VALUE.OFF);
    setIndicator(CC.NEXT_TRACK, INDICATOR_VALUE.OFF);
    
    // Transport LEDs
    setIndicator(CC.LOOP, INDICATOR_VALUE.OFF);
    setIndicator(CC.REWIND, INDICATOR_VALUE.OFF);
    setIndicator(CC.FAST_FORWARD, INDICATOR_VALUE.OFF);
    setIndicator(CC.STOP, INDICATOR_VALUE.OFF);
    setIndicator(CC.PLAY, INDICATOR_VALUE.OFF);
    setIndicator(CC.RECORD, INDICATOR_VALUE.OFF);
}

// ============================================
// MIDI Input Handling
// ============================================

/**
 * Handle incoming MIDI messages from standard port (keys, pads)
 */
function onMidi(status, data1, data2) {
    const channel = status & 0x0F;
    const message = status & 0xF0;
    
    // Block volume sync when using pitch/modulation/aftertouch (controller wants to display info)
    // Pitch Bend
    if (message === 0xE0) {
        controllerTouchTime = Date.now();
    }
    // Modulation Wheel (CC 1)
    else if (message === 0xB0 && data1 === 1) {
        controllerTouchTime = Date.now();
    }
    // Channel Aftertouch
    else if (message === 0xD0) {
        controllerTouchTime = Date.now();
    }
    
    // PANIC button
    if (message === 0xB0 && data1 === PANIC && data2 === 0) {
        handlePanic();
    }
    
    // Note: Keys and pads are handled by NoteInput automatically
    // This callback is for other MIDI messages if needed
}

/**
 * Handle incoming MIDI messages from DirectLink port
 * The controller sends CC messages for faders, encoders, buttons through this port
 * When Group P is ON, pads also send Note On/Off on channel 16 through this port
 */
function onDirectLinkMidi(status, data1, data2) {
    const channel = status & 0x0F;
    const message = status & 0xF0;
    
    // Process Control Change messages on any channel
    // Axiom sends CC on channel 16 (0xBF) for DirectLink controls
    if (message === 0xB0) {  // Control Change
        handleControlChange(data1, data2);
    } 
    // Note On/Off on channel 10 (0x9F/0x8F) - pads in DirectLink mode (Group P ON)
    else if (status === 0x9F && data2 > 0) {  // Note On on channel 10
        handleDirectLinkPad(data1, data2);
    }
}

/**
 * Handle incoming SysEx messages from DirectLink port
 * @param {string} data - Hex string of SysEx data
 */
function onSysex(data) {
    // Parse SysEx response from DirectLink
    println('DirectLink SysEx received: ' + data);
    
    // Check if this is a DirectLink response
    // Expected format: f0000105207f20...
    if (data.indexOf('f0000105207f') === 0) {
        // This is a DirectLink response
        // Byte 7 (index 12-13 in hex string) contains the response type
        // Byte 8 (index 14-15) contains capability flags
        println('DirectLink response confirmed');
    }
}

/**
 * Handle Control Change messages
 */
function handleControlChange(cc, value) {
    // Faders
    if (cc >= CC.FADER_1 && cc <= CC.FADER_8) {
        const trackIndex = cc - CC.FADER_1;
        handleFader(trackIndex, value);
    }
    // Master Fader
    else if (cc === CC.FADER_MASTER) {
        handleMasterFader(value);
    }
    // Encoders
    else if (cc >= CC.ENCODER_1 && cc <= CC.ENCODER_8) {
        const encoderIndex = cc - CC.ENCODER_1;
        handleEncoder(encoderIndex, value);
    }
    // Mute/Solo buttons
    else if (cc >= CC.MUTE_SOLO_1 && cc <= CC.MUTE_SOLO_8) {
        const trackIndex = cc - CC.MUTE_SOLO_1;
        handleMuteSoloButton(trackIndex, value);
    }
    // Navigation
    else if (cc === CC.PREV_TRACK) {
        if (value > 0) navigateTracks(-1);
    }
    else if (cc === CC.NEXT_TRACK) {
        if (value > 0) navigateTracks(1);
    }
    // Transport
    else if (cc === CC.PLAY && value > 0) {
        transport.play();
    }
    else if (cc === CC.STOP && value > 0) {
        transport.stop();
    }
    else if (cc === CC.RECORD && value > 0) {
        transport.record();
    }
    else if (cc === CC.LOOP && value > 0) {
        // Toggle loop state
        const loopEnabled = transport.isArrangerLoopEnabled();
        loopEnabled.toggle();
    }
    else if (cc === CC.REWIND) {
        handleRewind(value);
    }
    else if (cc === CC.FAST_FORWARD) {
        handleFastForward(value);
    }
    // Shift button - must be processed BEFORE other buttons that use isShiftPressed
    else if (cc === CC.SHIFT) {
        isShiftPressed = value > 0;
    }
    // Bank navigation (Shift + Bank = scene navigation)
    else if (cc === CC.BANK_UP && value > 0) {
        if (isShiftPressed && sceneBank) {
            sceneBank.scrollPageForwards();
        } else {
            trackBank.scrollPageForwards();
        }
    }
    else if (cc === CC.BANK_DOWN && value > 0) {
        if (isShiftPressed && sceneBank) {
            sceneBank.scrollPageBackwards();
        } else {
            trackBank.scrollPageBackwards();
        }
    }
    // Mute/Solo/Record mode flip (button below 8th fader)
    else if (cc === CC.MUTE_SOLO_FLIP && value > 0) {
        cycleButtonMode();
    }
    // Mute/Solo button 8 (CC 56) - can be used for special functions
    else if (cc === CC.MUTE_SOLO_8 && value > 0) {
        // Button 8 toggles between Mute/Solo/Record modes
        cycleButtonMode();
    }
}

/**
 * Handle DirectLink pad press (Group P ON mode)
 * Without Shift: Launch clips in the selected scene for tracks 1-8
 * With Shift: Encoder modes and transport functions
 */
function handleDirectLinkPad(note, velocity) {
    if (velocity === 0) return;  // Note Off
    
    const padIndex = NOTE_PAD_MAP[note];
    if (padIndex === undefined) return;
    
    if (isShiftPressed) {
        // Shift + Pad: Encoder modes and transport functions
        switch (padIndex) {
            case 0:
                // Shift + Pad 1: PAN mode
                currentEncoderMode = 'pan';
                displayText('PAN', 0);
                scheduleDisplayRestore();
                break;
            case 1:
                // Shift + Pad 2: DEVICE mode
                currentEncoderMode = 'device';
                displayText('DEVICE', 0);
                scheduleDisplayRestore();
                break;
            case 2:
                // Shift + Pad 3: SEND mode
                currentEncoderMode = 'send';
                displayText('SEND', 0);
                scheduleDisplayRestore();
                break;
            case 3:
                // Shift + Pad 4: Toggle Metronome
                transport.isMetronomeEnabled().toggle();
                displayText('METRONOME', 0);
                scheduleDisplayRestore();
                break;
            case 4:
                // Shift + Pad 5: Undo
                application.undo();
                displayText('UNDO', 0);
                scheduleDisplayRestore();
                break;
            case 5:
                // Shift + Pad 6: Redo
                application.redo();
                displayText('REDO', 0);
                scheduleDisplayRestore();
                break;
            case 6:
                // Shift + Pad 7: Tap Tempo
                transport.tapTempo();
                displayText('TAP TEMPO', 0);
                scheduleDisplayRestore();
                break;
            case 7:
                // Shift + Pad 8: Toggle Loop
                transport.isArrangerLoopEnabled().toggle();
                displayText('LOOP', 0);
                scheduleDisplayRestore();
                break;
        }
    } else {
        // Normal pad press: Launch clip
        const track = trackBank.getItemAt(padIndex);
        if (!track) return;
        
        const clipLauncher = track.clipLauncherSlotBank();
        if (clipLauncher && sceneBank) {
            const sceneIndex = sceneBank.scrollPosition().get();
            const clipSlot = clipLauncher.getItemAt(sceneIndex);
            if (clipSlot) {
                clipSlot.launch();
            }
        }
    }
}

/**
 * Handle Note On messages (Pads on standard port - Group P OFF)
 * Note: This is handled by NoteInput automatically - pads send notes to DAW
 */
function handleNoteOn(note, velocity) {
    // Note: This function is not called because NoteInput consumes pad events
    // Pads on standard port (Group P OFF) send notes directly to DAW via NoteInput
}

const NOTE_PAD_MAP = {
    [NOTE.PAD_1]: 0,
    [NOTE.PAD_2]: 1,
    [NOTE.PAD_3]: 2,
    [NOTE.PAD_4]: 3,
    [NOTE.PAD_5]: 4,
    [NOTE.PAD_6]: 5,
    [NOTE.PAD_7]: 6,
    [NOTE.PAD_8]: 7
};

// ============================================
// Mixer Control
// ============================================

/**
 * Handle fader movement
 */
function handleFader(trackIndex, value) {
    const track = trackBank.getItemAt(trackIndex);
    if (track) {
        track.volume().set(value, 128);
        
        // Update LED indicator immediately (don't wait for flush)
        setIndicator(CC.FADER_1 + trackIndex, value);
        
        // Cancel previous restore task
        if (encoderRestoreTask) {
            encoderRestoreTask.cancel();
        }
        
        // Block volume sync to show track name on DISPLAY
        controllerTouchTime = Date.now();
        controllerTouchCount++;
        const touchCount = controllerTouchCount;
        
        // Get track name
        const name = track.name().get();
        const displayName = name ? name.substring(0, 12) : 'Track' + (trackIndex + 1);
        displayText(displayName + ' ' + Math.round(value), 0);
        
        encoderRestoreTask = host.scheduleTask(function() {
            if (controllerTouchCount === touchCount) {
                restoreActiveTrackDisplay();
            }
        }, 3000);
    }
}

/**
 * Handle master fader movement
 */
function handleMasterFader(value) {
    if (masterTrack) {
        masterTrack.volume().set(value, 128);
        
        // Update indicator immediately
        setIndicator(CC.FADER_MASTER, value);
        
        // Cancel previous restore task
        if (encoderRestoreTask) {
            encoderRestoreTask.cancel();
        }
        
        // Block volume sync
        controllerTouchTime = Date.now();
        controllerTouchCount++;
        const touchCount = controllerTouchCount;
        
        // Show name on display
        displayText('Master', 0);
        
        // Schedule restore after 3 seconds
        encoderRestoreTask = host.scheduleTask(function() {
            if (controllerTouchCount === touchCount) {
                restoreActiveTrackDisplay();
            }
        }, 3000);
    }
}

/**
 * Handle encoder rotation (relative mode)
 */
function handleEncoder(encoderIndex, value) {
    // Relative mode: 1-63 = increment, 65-127 = decrement, 64 = no change
    if (value === 64) return;  // No change in relative mode
    
    // Calculate relative increment
    // Values 1-63 = positive increment (clockwise)
    // Values 65-127 = negative increment (counter-clockwise)
    const increment = value < 64 ? value : value - 128;
    
    // Scale down for smooth control - each step is small
    const scaledIncrement = increment * 0.02;
    
    switch (currentEncoderMode) {
        case 'pan':
            handlePanEncoder(encoderIndex, scaledIncrement);
            break;
        case 'device':
            handleDeviceEncoder(encoderIndex, scaledIncrement);
            break;
        case 'send':
            handleSendEncoder(encoderIndex, scaledIncrement);
            break;
    }
}

/**
 * Show track name and volume on display, schedule restore after 3 seconds
 * Blocks volume sync for 3 seconds
 */
function showTrackVolume(trackIndex) {
    // Cancel previous restore task
    if (encoderRestoreTask) {
        encoderRestoreTask.cancel();
    }
    
    // Block volume sync
    controllerTouchTime = Date.now();
    controllerTouchCount++;
    const touchCount = controllerTouchCount;
    
    // Get track name and volume
    const track = trackBank.getItemAt(trackIndex);
    if (track) {
        const name = track.name().get();
        const volume = trackStates[trackIndex].volume;
        
        // Format: "TrackName 127" (name + volume value)
        let displayStr = name ? name.substring(0, 12) : 'Track' + (trackIndex + 1);
        displayStr = displayStr + ' ' + Math.round(volume);
        
        displayText(displayStr, 0);
        
        // Schedule restore after 3 seconds
        encoderRestoreTask = host.scheduleTask(function() {
            if (controllerTouchCount === touchCount) {
                restoreActiveTrackDisplay();
            }
        }, 3000);
    }
}

/**
 * Restore display to active track name and volume
 */
function restoreActiveTrackDisplay() {
    const name = cursorTrack.name().get();
    if (name && name.length > 0) {
        displayText(name.substring(0, 16), 0);
    }
}

/**
 * Schedule display restore after 3 seconds (for mode/button changes)
 * Blocks volume sync for 3 seconds
 */
function scheduleDisplayRestore() {
    // Cancel previous restore task
    if (encoderRestoreTask) {
        encoderRestoreTask.cancel();
    }
    
    // Block volume sync
    controllerTouchTime = Date.now();
    controllerTouchCount++;
    const touchCount = controllerTouchCount;
    
    // Schedule restore after 3 seconds
    encoderRestoreTask = host.scheduleTask(function() {
        if (controllerTouchCount === touchCount) {
            restoreActiveTrackDisplay();
        }
    }, 3000);
}

/**
 * Handle pan encoder
 */
function handlePanEncoder(encoderIndex, increment) {
    // Cancel previous restore task
    if (encoderRestoreTask) {
        encoderRestoreTask.cancel();
    }
    
    // Block volume sync
    controllerTouchTime = Date.now();
    controllerTouchCount++;
    
    const touchCount = controllerTouchCount;  // Capture current count
    
    // Display pan parameter name
    const paramName = panParamNames[encoderIndex] || 'Pan';
    displayText(paramName, 0);
    
    // Schedule restore after 3 seconds
    encoderRestoreTask = host.scheduleTask(function() {
        if (controllerTouchCount === touchCount) {
            restoreActiveTrackDisplay();
        }
    }, 3000);
    
    const track = trackBank.getItemAt(encoderIndex);
    if (track) {
        // Pan range is -1 to 1, so total range is 2
        track.pan().inc(increment, 2.0);
    }
}

/**
 * Handle device parameter encoder
 */
function handleDeviceEncoder(encoderIndex, increment) {
    // Cancel previous restore task
    if (encoderRestoreTask) {
        encoderRestoreTask.cancel();
    }
    
    // Block volume sync
    controllerTouchTime = Date.now();
    activeEncoderIndex = encoderIndex;
    controllerTouchCount++;
    
    const touchCount = controllerTouchCount;  // Capture current count
    
    // Schedule restore after 3 seconds
    encoderRestoreTask = host.scheduleTask(function() {
        if (controllerTouchCount === touchCount) {
            restoreActiveTrackDisplay();
        }
    }, 3000);
    
    if (remoteControls) {
        const param = remoteControls.getParameter(encoderIndex);
        if (param) {
            // Display parameter name (value will be synced by observer)
            const paramName = deviceParamNames[encoderIndex] || 'PARAM';
            displayText(paramName, 0);
            
            // Change parameter
            param.inc(increment, 2.0);
        }
    }
}

/**
 * Handle send encoder
 */
function handleSendEncoder(encoderIndex, increment) {
    // Cancel previous restore task
    if (encoderRestoreTask) {
        encoderRestoreTask.cancel();
    }
    
    // Block volume sync
    controllerTouchTime = Date.now();
    activeEncoderIndex = encoderIndex;
    controllerTouchCount++;
    
    const touchCount = controllerTouchCount;  // Capture current count
    
    // Display send parameter name
    const paramName = sendParamNames[encoderIndex] || 'Send';
    displayText(paramName, 0);
    
    // Schedule restore after 3 seconds
    encoderRestoreTask = host.scheduleTask(function() {
        if (controllerTouchCount === touchCount) {
            restoreActiveTrackDisplay();
        }
    }, 3000);
    
    const track = cursorTrack;
    if (track) {
        const sendBank = track.sendBank();
        if (sendBank) {
            const send = sendBank.getItemAt(encoderIndex);
            if (send) {
                // Send range is 0 to 1, so total range is 1
                send.inc(increment, 2.0);
            }
        }
    }
}

/**
 * Handle Mute/Solo/Record button press
 */
function handleMuteSoloButton(trackIndex, value) {
    if (value === 0) return;
    
    // Cancel previous restore task
    if (encoderRestoreTask) {
        encoderRestoreTask.cancel();
    }
    
    // Block volume sync
    controllerTouchTime = Date.now();
    controllerTouchCount++;
    const touchCount = controllerTouchCount;
    
    const track = trackBank.getItemAt(trackIndex);
    const trackName = track ? (track.name().get() || 'Track' + (trackIndex + 1)) : 'Track' + (trackIndex + 1);
    
    // Get button status
    let status = buttonMode.toUpperCase();
    if (track) {
        switch (buttonMode) {
            case 'mute':
                status = track.mute().get() ? 'MUTE ON' : 'MUTE';
                break;
            case 'solo':
                status = track.solo().get() ? 'SOLO ON' : 'SOLO';
                break;
            case 'record':
                status = track.arm().get() ? 'REC ON' : 'REC';
                break;
        }
    }
    
    displayText(trackName.substring(0, 10) + ' ' + status, 0);
    
    encoderRestoreTask = host.scheduleTask(function() {
        if (controllerTouchCount === touchCount) {
            restoreActiveTrackDisplay();
        }
    }, 3000);
    
    if (isShiftPressed) {
        // Shift + button = select track
        if (track) {
            cursorTrack.selectChannel(track);
        }
    } else {
        // Normal button press: Mute/Solo/Record
        if (track) {
            switch (buttonMode) {
                case 'mute':
                    track.mute().toggle();
                    break;
                case 'solo':
                    track.solo().toggle();
                    break;
                case 'record':
                    track.arm().toggle();
                    break;
            }
        }
    }
}

/**
 * Navigate through tracks
 */
function navigateTracks(direction) {
    if (direction > 0) {
        cursorTrack.selectNext();
    } else {
        cursorTrack.selectPrevious();
    }
}

// ============================================
// Transport Control
// ============================================

let rewindPressed = false;
let fastForwardPressed = false;

function handleRewind(value) {
    rewindPressed = value > 0;
    if (rewindPressed) {
        rewind();
    }
}

function handleFastForward(value) {
    fastForwardPressed = value > 0;
    if (fastForwardPressed) {
        fastForward();
    }
}

function rewind() {
    if (rewindPressed) {
        transport.setPosition(transport.getPosition().get() - 0.1);
        host.scheduleTask(rewind, 50);
    }
}

function fastForward() {
    if (fastForwardPressed) {
        transport.setPosition(transport.getPosition().get() + 0.1);
        host.scheduleTask(fastForward, 50);
    }
}

// ============================================
// Synchronization (DAW -> Controller)
// ============================================

// Store current states for sync
const trackStates = [];
for (let i = 0; i < WINDOW_SIZE; i++) {
    trackStates[i] = {
        volume: 0,
        mute: false,
        solo: false,
        arm: false
    };
}

/**
 * Cycle through button modes: Mute -> Solo -> Record -> Mute
 */
function cycleButtonMode() {
    switch (buttonMode) {
        case 'mute':
            buttonMode = 'solo';
            break;
        case 'solo':
            buttonMode = 'record';
            break;
        case 'record':
            buttonMode = 'mute';
            break;
    }
    syncButtonIndicators();
    displayText(buttonMode.toUpperCase(), 0);
    scheduleDisplayRestore();
}

/**
 * Sync button indicators from stored states
 */
function syncButtonIndicators() {
    for (let i = 0; i < WINDOW_SIZE; i++) {
        const state = trackStates[i];
        let value = INDICATOR_VALUE.OFF;
        
        switch (buttonMode) {
            case 'mute':
                value = state.mute ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF;
                break;
            case 'solo':
                value = state.solo ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF;
                break;
            case 'record':
                value = state.arm ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF;
                break;
        }
        setIndicator(CC.MUTE_SOLO_1 + i, value);
    }
}

/**
 * Sync all indicators from DAW to controller
 */
function syncAllStates() {
    // Sync button indicators from stored states
    syncButtonIndicators();
}

/**
 * Setup observers for two-way synchronization
 */
function setupObservers() {
    // Transport observers
    transport.isPlaying().addValueObserver(function(isPlaying) {
        setIndicator(CC.PLAY, isPlaying ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF);
        if (!isPlaying) {
            setIndicator(CC.STOP, INDICATOR_VALUE.ON);
        } else {
            setIndicator(CC.STOP, INDICATOR_VALUE.OFF);
        }
    });
    
    transport.isArrangerRecordEnabled().addValueObserver(function(isRecording) {
        setIndicator(CC.RECORD, isRecording ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF);
    });
    
    transport.isArrangerLoopEnabled().addValueObserver(function(isLooping) {
        setIndicator(CC.LOOP, isLooping ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF);
    });
    
    // Track volume observers
    for (let i = 0; i < WINDOW_SIZE; i++) {
        const track = trackBank.getItemAt(i);
        const index = i;
        
        // 1. Mark as interested FIRST
        track.volume().markInterested();
        
        // 2. Get initial volume value immediately
        const initialVolume = track.volume().get();
        if (initialVolume !== undefined) {
            // Convert 0-1 to MIDI 0-127
            const midiValue = Math.round(initialVolume * 127);
            trackStates[index].volume = midiValue;
            setIndicator(CC.FADER_1 + index, midiValue);
        }
        
        // 3. Add observer AFTER initial sync
        track.volume().addValueObserver(128, function(value) {
            trackStates[index].volume = value;
            // Volume sync is handled by flush() to only show active track
        });
        
        track.mute().addValueObserver(function(isMuted) {
            trackStates[index].mute = isMuted;
            if (buttonMode === 'mute') {
                setIndicator(CC.MUTE_SOLO_1 + index, isMuted ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF);
            }
        });
        
        track.solo().addValueObserver(function(isSoloed) {
            trackStates[index].solo = isSoloed;
            if (buttonMode === 'solo') {
                setIndicator(CC.MUTE_SOLO_1 + index, isSoloed ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF);
            }
        });
        
        track.arm().addValueObserver(function(isArmed) {
            trackStates[index].arm = isArmed;
            if (buttonMode === 'record') {
                setIndicator(CC.MUTE_SOLO_1 + index, isArmed ? INDICATOR_VALUE.ON : INDICATOR_VALUE.OFF);
            }
        });
        
        track.name().addValueObserver(function(name) {
            // Could display track name when selected
        });
    }
    
    // Cursor track observers
    // Show track name when selection changes
    cursorTrack.name().addValueObserver(function(name) {
        if (name && name.length > 0) {
            displayText(name.substring(0, 16), 0);
        }
    });
    
    // Track position observer to know which track is selected
    cursorTrack.position().addValueObserver(function(pos) {
        activeTrackIndex = pos;
        
        // Get initial volume value when track changes (for Master/FX tracks)
        // This ensures we show volume even if observer doesn't fire initially
        const initialVol = cursorTrack.volume().get();
        const midiValue = Math.round(initialVol * 127);
        if (initialVol !== undefined) {
            // Write to trackStates for flush() to read
            if (activeTrackIndex >= 0 && activeTrackIndex < WINDOW_SIZE) {
                trackStates[activeTrackIndex].volume = midiValue;
            }
            setIndicator(CC.FADER_MASTER, midiValue);
        }
    });
    
    // Cursor track volume observer - shows volume for any selected track (including Master/FX)
    cursorTrack.volume().addValueObserver(128, function(value) {
        // Write to trackStates for flush() to read
        if (activeTrackIndex >= 0 && activeTrackIndex < WINDOW_SIZE) {
            trackStates[activeTrackIndex].volume = value;
        }
        setIndicator(CC.FADER_MASTER, value);
    });
}

// ============================================
// Initialization and Exit
// ============================================

function init() {
    // Get MIDI ports
    // Port 0: Standard MIDI (keys, pads, controllers)
    // Port 1: DirectLink (indicators, display, responses)
    midiIn = host.getMidiInPort(0);
    midiInDirectLink = host.getMidiInPort(1);
    midiOut = host.getMidiOutPort(0);
    midiOutDirectLink = host.getMidiOutPort(1);
    
    // Create separate note inputs for keyboard keys and pads
    // This allows routing them to different instruments in Bitwig
    
    // Note input for keyboard keys (channel 1)
    // Filter masks:
    // 80???? = Note Off on channel 1
    // 90???? = Note On on channel 1
    // B0???? = Control Change on channel 1 (for modulation wheel CC 1)
    // D0???? = Channel Aftertouch on channel 1
    // E0???? = Pitch Bend on channel 1
    const keyNoteInputZ1 = midiIn.createNoteInput('Zone 1', 
        '80????',  // Note Off on channel 1
        '90????',  // Note On on channel 1
        'B0????',  // Control Change on channel 1 (modulation wheel)
        'D0????',  // Channel Aftertouch on channel 1
        'E0????'   // Pitch Bend on channel 1
    );

    keyNoteInputZ1.setShouldConsumeEvents(false);

    const keyNoteInputZ2 = midiIn.createNoteInput('Zone 2', 
        '81????',  // Note Off on channel 2
        '91????',  // Note On on channel 2
        'B1????',  // Control Change on channel 2 (modulation wheel)
        'D1????',  // Channel Aftertouch on channel 2
        'E1????'   // Pitch Bend on channel 2
    );

    keyNoteInputZ2.setShouldConsumeEvents(false);

    const keyNoteInputZ3 = midiIn.createNoteInput('Zone 3', 
        '82????',  // Note Off on channel 3
        '92????',  // Note On on channel 3
        'B2????',  // Control Change on channel 3 (modulation wheel)
        'D2????',  // Channel Aftertouch on channel 3
        'E2????'   // Pitch Bend on channel 3
    );

    keyNoteInputZ3.setShouldConsumeEvents(false);

    const keyNoteInputZ4 = midiIn.createNoteInput('Zone 4', 
        '83????',  // Note Off on channel 4
        '93????',  // Note On on channel 4
        'B3????',  // Control Change on channel 4 (modulation wheel)
        'D3????',  // Channel Aftertouch on channel 4
        'E3????'   // Pitch Bend on channel 4
    );

    keyNoteInputZ4.setShouldConsumeEvents(false);
    
    // Note input for drum pads
    // Pads send on channel 10 (0x99 for Note On, 0x89 for Note Off) when Group P is OFF
    // When Group P is OFF: pads send notes on standard port (port 0) -> notes to DAW
    // When Group P is ON (DirectLink mode): pads send on DirectLink port (port 1) -> control DAW
    // We only create NoteInput on standard port for note playing
    // DirectLink port pads are handled in onDirectLinkMidi for DAW control
    
    const padNoteInput = midiIn.createNoteInput('Pads',
        '89????',  // Note Off on channel 10
        '99????'   // Note On on channel 10
    );
    padNoteInput.setShouldConsumeEvents(false);
    
    // Create transport
    transport = host.createTransport();
    // Mark position as interested to enable .get() calls
    transport.getPosition().markInterested();
    
    // Create track bank (8 tracks, 1 send, 8 scenes for clip launching)
    trackBank = host.createMainTrackBank(WINDOW_SIZE, 1, WINDOW_SIZE);
    
    // Mark track volumes as interested for initial sync
    for (let i = 0; i < WINDOW_SIZE; i++) {
        const track = trackBank.getItemAt(i);
        track.volume().markInterested();
        track.pan().markInterested();
        track.mute().markInterested();
        track.solo().markInterested();
        track.arm().markInterested();
    }
    
    // Create scene bank for clip launching
    sceneBank = host.createSceneBank(WINDOW_SIZE);
    sceneBank.scrollPosition().markInterested();
    
    // Create cursor track (8 sends for send encoder mode)
    cursorTrack = host.createCursorTrack('AXIOM_CURSOR', 'Axiom Cursor', WINDOW_SIZE, 0, true);
    cursorTrack.name().markInterested();
    cursorTrack.volume().markInterested();
    
    // Create cursor device for parameter control
    cursorDevice = cursorTrack.createCursorDevice('AXIOM_DEVICE', 'Axiom Device', 0, CursorDeviceFollowMode.FIRST_INSTRUMENT);
    remoteControls = cursorDevice.createCursorRemoteControlsPage(WINDOW_SIZE);
    
    // Setup observers for device parameter names
    for (let i = 0; i < WINDOW_SIZE; i++) {
        const param = remoteControls.getParameter(i);
        const index = i;
        
        // Observe name changes
        param.name().addValueObserver(function(name) {
            deviceParamNames[index] = name || '';
        });
        
        // Observe value changes and send to encoder CC (only for active encoder)
        param.value().addValueObserver(128, function(value) {
            // Only send if this is the active encoder in device mode
            if (currentEncoderMode === 'device' && index === activeEncoderIndex) {
                // Value from Bitwig is already 0-127
                let midiValue = Math.round(value);
                if (midiValue < 0) midiValue = 0;
                if (midiValue > 127) midiValue = 127;
                midiOutDirectLink.sendMidi(0xBF, CC.ENCODER_1 + index, midiValue);
            }
        });
    }
    
    // Setup observers for pan parameter names and values
    for (let i = 0; i < WINDOW_SIZE; i++) {
        const track = trackBank.getItemAt(i);
        const index = i;
        
        // Observe pan name changes
        track.pan().name().addValueObserver(function(name) {
            panParamNames[index] = name || 'Pan';
        });
        
        // Observe pan value changes and send to encoder CC (only for active encoder in pan mode)
        track.pan().value().addValueObserver(128, function(value) {
            if (currentEncoderMode === 'pan' && index === activeEncoderIndex) {
                let midiValue = Math.round(value);
                if (midiValue < 0) midiValue = 0;
                if (midiValue > 127) midiValue = 127;
                midiOutDirectLink.sendMidi(0xBF, CC.ENCODER_1 + index, midiValue);
            }
        });
    }
    
    // Setup observers for send parameter names and values
    const sendBank = cursorTrack.sendBank();
    if (sendBank) {
        for (let i = 0; i < WINDOW_SIZE; i++) {
            const send = sendBank.getItemAt(i);
            const index = i;
            
            // Observe send name changes
            send.name().addValueObserver(function(name) {
                sendParamNames[index] = name || 'Send';
            });
            
            // Observe send value changes and send to encoder CC (only for active encoder in send mode)
            send.value().addValueObserver(128, function(value) {
                if (currentEncoderMode === 'send' && index === activeEncoderIndex) {
                    let midiValue = Math.round(value);
                    if (midiValue < 0) midiValue = 0;
                    if (midiValue > 127) midiValue = 127;
                    midiOutDirectLink.sendMidi(0xBF, CC.ENCODER_1 + index, midiValue);
                }
            });
        }
    }
    
    // Create master track reference
    masterTrack = host.createMasterTrack(0);
    masterTrack.volume().markInterested();
    
    // Get initial master volume value
    const initialMasterVolume = masterTrack.volume().get();
    if (initialMasterVolume !== undefined) {
        setIndicator(CC.FADER_MASTER, initialMasterVolume);
    }
    
    // Create application reference
    application = host.createApplication();
    
    // Setup preferences for button mode
    preferences = host.getPreferences();
    const buttonModeSetting = preferences.getEnumSetting(
        'Button Mode',
        'Button Functions',
        ['Mute', 'Solo', 'Record'],
        'Mute'
    );
    
    buttonModeSetting.addValueObserver(function(value) {
        buttonMode = value.toLowerCase();
        syncButtonIndicators();
        println('Button mode changed to: ' + buttonMode);
    });
    
    // Setup preferences for encoder mode
    const encoderModeSetting = preferences.getEnumSetting(
        'Encoder Mode',
        'Encoder Functions',
        ['Pan', 'Device', 'Send'],
        'Pan'
    );
    
    encoderModeSetting.addValueObserver(function(value) {
        currentEncoderMode = value.toLowerCase();
        displayText(currentEncoderMode.toUpperCase(), 0);
        scheduleDisplayRestore();
        println('Encoder mode changed to: ' + currentEncoderMode);
    });
    
    // Set up MIDI input callbacks for both ports
    midiIn.setMidiCallback(onMidi);
    midiInDirectLink.setMidiCallback(onDirectLinkMidi);
    
    // Set up SysEx callback for DirectLink responses
    midiInDirectLink.setSysexCallback(onSysex);
    
    // Enable DirectLink mode
    enableDirectLink();
    
    // Setup observers for synchronization
    setupObservers();
    
    println('\n========================================');
    println('M-Audio Axiom 61 DirectLink initialized');
    println('========================================');
    println('Controls:');
    println('  Faders 1-8: Track volumes');
    println('  Master Fader: Master volume');
    println('  Encoders: Pan/Device/Send');
    println('  Pads 1-8: Launch clips in selected scene');
    println('  Buttons 1-8: Mute/Solo/Record (configurable in preferences)');
    println('  Button 8 or Flip button: Cycle Mute->Solo->Record');
    println('  Transport: Play, Stop, Record, Loop');
    println('  Navigation: Prev/Next track, Bank Up/Down');
    println('');
    println('Shift combinations:');
    println('  Shift + Pad 1-3: Switch encoder mode (Pan/Device/Send)');
    println('  Shift + Pad 4: Toggle Metronome');
    println('  Shift + Pad 5: Undo');
    println('  Shift + Pad 6: Redo');
    println('  Shift + Pad 7: Tap Tempo');
    println('  Shift + Pad 8: Toggle Loop');
    println('  Shift + Bank Up/Down: Navigate scenes');
    println('  Shift + Button 1-8: Select track');
    println('');
    println('Preferences: Settings > Controllers > Axiom 61 DirectLink');
    println('========================================\n');
}

function handlePanic() {
    println('PANIC pressed - restarting controller...');
    displayText('PANIC', 0);
    
    // Using host.restart() - requires API 7+
    host.scheduleTask(function() {
        host.restart();
    }, 100);
}

function exit() {
    println('M-Audio Axiom 61 DirectLink exiting...');
    disableDirectLink();
    println('M-Audio Axiom 61 DirectLink disabled.');
}

function flush() {
    // Skip volume sync if controller was touched recently (within 3 seconds)
    if (Date.now() < controllerTouchTime + 3000) {
        return;  // Skip to allow controller display to show info
    }
    
    // Sync volume
    const volume = trackStates[activeTrackIndex].volume;
    setIndicator(CC.FADER_1 + activeTrackIndex, volume);
}
