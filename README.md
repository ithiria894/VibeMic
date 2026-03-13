# VibeMic 🎤

Voice-to-text for vibe coding. Record your voice, auto-transcribe with OpenAI Whisper, and paste directly into any VS Code input — including AI chat boxes (Claude Code, Copilot Chat, ChatGPT, etc.)

## How it works

1. Click **🎤 VibeMic** in the status bar (or press `Ctrl+Shift+M` / `Cmd+Shift+M`)
2. Speak — status bar turns red while recording
3. Click again to stop — transcription happens automatically
4. Text is copied to clipboard and pasted at your cursor position

No panels. No popups. No extra windows. Just talk and paste.

## Features

- **One-click recording** — status bar button with visual feedback (red = recording, yellow = transcribing)
- **Auto-paste** — transcribed text is automatically pasted at cursor position
- **Auto-copy** — also copies to clipboard as backup
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

## Keybinding

| Action | Linux | macOS |
|--------|-------|-------|
| Toggle recording | `Ctrl+Shift+M` | `Cmd+Shift+M` |

## Why VibeMic?

AI chat boxes in VS Code don't support voice input. The built-in VS Code Speech extension only works with Copilot Chat. VibeMic fills the gap — it works with **any** input field in VS Code.

Built for the vibe coding era. Stop typing, start talking.

## License

MIT
