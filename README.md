# VibeMic 🎤

Voice-to-text for vibe coding. Record your voice, auto-transcribe with OpenAI Whisper, and paste directly into any VS Code input — including AI chat boxes (Claude Code, Copilot Chat, ChatGPT, etc.)

## How it works

### Desktop (VS Code)

1. Press `PgDn` to start recording — status bar turns red
2. Press `PgDn` again to stop — transcription happens automatically
3. Text is copied to clipboard and pasted at your cursor position

### Mobile / Web (code-server on iPad / iPhone)

1. Tap **🎤 Record** in the VibeMic panel
2. Speak — button turns red while recording
3. Tap **⏹ Stop** — transcription happens automatically
4. Tap **📋 Copy** to copy to clipboard, then paste wherever you need

## Features

- **One-key recording** — `PgDn` to start and stop (desktop)
- **Auto-paste** — transcribed text is automatically pasted at cursor position (desktop)
- **Auto-copy** — also copies to clipboard as backup (desktop)
- **Mobile support** — works in code-server (iPad / iPhone) with a webview copy button
- **Multi-language** — supports Cantonese, Mandarin, English, Japanese, and [97 other languages](https://platform.openai.com/docs/guides/speech-to-text/supported-languages)
- **Cross-platform** — works on Linux and macOS

## Requirements

- **OpenAI API key** with Whisper access ($0.006/min — very cheap)
- **sox** for audio recording:
  - Linux: `sudo apt install sox`
  - macOS: `brew install sox`

## Setup

1. Install the extension
2. Open VS Code Settings (`Ctrl+,`)
3. Search `vibemic`
4. Set your **OpenAI API key**
5. (Optional) Set **language code** (e.g. `zh` for Chinese, `en` for English, or leave empty for auto-detect)

### code-server (iPad / iPhone)

1. Install the `.vsix` manually into code-server
2. Open the **VibeMic** tab in the bottom panel (next to Terminal)
3. Set your OpenAI API key in Settings

## Keybindings

| Action | Key |
|--------|-----|
| Start recording | `PgDn` |
| Stop recording | `PgDn` |

## Why VibeMic?

AI chat boxes in VS Code don't support voice input. The built-in VS Code Speech extension only works with Copilot Chat. VibeMic fills the gap — it works with **any** input field in VS Code.

Built for the vibe coding era. Stop typing, start talking.

## License

MIT
