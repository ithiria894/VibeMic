import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";

let recordButton: vscode.StatusBarItem;
let copyButton: vscode.StatusBarItem;
let recordingProcess: ChildProcess | null = null;
let isRecording = false;
let tempFilePath: string;
let pendingText: string | null = null;
let lastActiveEditor: vscode.TextEditor | undefined;
let lastActiveTerminal: vscode.Terminal | undefined;
let lastFocusTarget: "editor" | "terminal" | "other" = "other";
let webViewProvider: VibeMicViewProvider | undefined;
const isWeb = () => vscode.env.uiKind === vscode.UIKind.Web;

// ─── WebviewView for iPhone/iPad (code-server) ───
class VibeMicViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _state: "idle" | "recording" | "transcribing" | "done" = "idle";
  private _text: string = "";

  resolveWebviewView(view: vscode.WebviewView) {
    this._view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "toggle") {
        vscode.commands.executeCommand("vibemic.toggleRecording");
      } else if (msg.type === "copied") {
        this._state = "idle";
        this._text = "";
        pendingText = null;
        this._render();
      }
    });
    this._render();
  }

  setState(state: "idle" | "recording" | "transcribing" | "done", text?: string) {
    this._state = state;
    if (text !== undefined) this._text = text;
    this._render();
  }

  private _render() {
    if (!this._view) return;
    const raw = JSON.stringify(this._text);
    const state = JSON.stringify(this._state);
    this._view.webview.html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1e1e; padding: 6px 10px; font-family: system-ui, -apple-system, sans-serif; }
  .row { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
  button { padding: 5px 14px; font-size: 13px; font-weight: 600; border: none; border-radius: 4px; cursor: pointer; }
  .mic { background: #0078d4; color: white; }
  .mic:active { background: #005a9e; }
  .rec { background: #d42020; color: white; animation: pulse 1s infinite; }
  .rec:active { background: #a01818; }
  .spin { background: #c08000; color: white; }
  .copy-btn { background: #0078d4; color: white; }
  .copy-btn:active { background: #005a9e; }
  .done { background: #2ea043; color: white; }
  .preview { color: #aaa; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
  textarea { position: absolute; left: -9999px; }
</style></head><body>
  <div class="row" id="ui"></div>
  <textarea id="ta"></textarea>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const text = ${raw};
    const state = ${state};
    const ui = document.getElementById('ui');

    function render() {
      if (state === 'idle') {
        ui.innerHTML = '<button class="mic" onclick="toggle()">🎤 Record</button>';
      } else if (state === 'recording') {
        ui.innerHTML = '<button class="rec" onclick="toggle()">⏹ Stop</button>';
      } else if (state === 'transcribing') {
        ui.innerHTML = '<button class="spin" disabled>⏳ Transcribing...</button>';
      } else if (state === 'done') {
        const preview = text.length > 30 ? text.substring(0, 30) + '…' : text;
        ui.innerHTML = '<span class="preview">' + preview.replace(/</g,'&lt;') + '</span>' +
          '<button class="copy-btn" id="btn" onclick="doCopy()">📋 Copy</button>';
      }
    }

    function toggle() {
      vscodeApi.postMessage({ type: 'toggle' });
    }

    function doCopy() {
      let ok = false;
      try {
        const ta = document.getElementById('ta');
        ta.value = text;
        ta.select();
        ta.setSelectionRange(0, text.length);
        ok = document.execCommand('copy');
      } catch(e) {}
      if (!ok) {
        try { navigator.clipboard.writeText(text); ok = true; } catch(e) {}
      }
      if (ok) {
        document.getElementById('btn').textContent = '✅ Copied!';
        document.getElementById('btn').className = 'done';
        setTimeout(() => vscodeApi.postMessage({ type: 'copied' }), 800);
      }
    }

    render();
  </script>
</body></html>`;
  }
}

// ─── Activate ───
export function activate(context: vscode.ExtensionContext) {
  tempFilePath = path.join(context.globalStorageUri.fsPath, "recording.wav");
  fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });

  // Track focus
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (e) { lastActiveEditor = e; lastFocusTarget = "editor"; }
    }),
    vscode.window.onDidChangeActiveTerminal((t) => {
      if (t) { lastActiveTerminal = t; lastFocusTarget = "terminal"; }
    })
  );
  lastActiveEditor = vscode.window.activeTextEditor;
  lastActiveTerminal = vscode.window.activeTerminal;
  if (vscode.window.activeTextEditor) lastFocusTarget = "editor";
  else if (vscode.window.activeTerminal) lastFocusTarget = "terminal";

  // Desktop: status bar buttons
  if (!isWeb()) {
    recordButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    recordButton.command = "vibemic.toggleRecording";
    setIdleState();
    recordButton.show();

    copyButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    copyButton.command = "vibemic.copyTranscript";
    copyButton.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    copyButton.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    copyButton.hide();

    context.subscriptions.push(recordButton, copyButton);
  }

  // Web: webview panel
  if (isWeb()) {
    webViewProvider = new VibeMicViewProvider();
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider("vibemic.mainView", webViewProvider)
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("vibemic.toggleRecording", toggleRecording),
    vscode.commands.registerCommand("vibemic.stopRecording", stopRecording),
    vscode.commands.registerCommand("vibemic.copyTranscript", copyTranscript),
  );
}

// ─── Status bar states (desktop only) ───
function setIdleState() {
  if (!recordButton) return;
  recordButton.text = "$(mic) VibeMic";
  recordButton.tooltip = "Click to start recording";
  recordButton.backgroundColor = undefined;
  recordButton.color = undefined;
}

function setRecordingState() {
  if (!recordButton) return;
  recordButton.text = "$(circle-filled) Recording...";
  recordButton.tooltip = "Click to stop and transcribe";
  recordButton.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  recordButton.color = new vscode.ThemeColor("statusBarItem.errorForeground");
}

function setTranscribingState() {
  if (!recordButton) return;
  recordButton.text = "$(loading~spin) Transcribing...";
  recordButton.tooltip = "Sending to Whisper API...";
  recordButton.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  recordButton.color = new vscode.ThemeColor("statusBarItem.warningForeground");
}

function showActionButtons(text: string) {
  pendingText = text;
  if (isWeb()) {
    webViewProvider?.setState("done", text);
  } else {
    const preview = text.length > 20 ? text.substring(0, 20) + "…" : text;
    recordButton.text = `$(mic) ${preview}`;
    recordButton.tooltip = `Full text: ${text}\n\nClick to start new recording`;
    copyButton.text = `$(clippy) Copy`;
    copyButton.tooltip = `Copy to clipboard:\n${text}`;
    copyButton.show();
  }
}

function hideActionButtons() {
  pendingText = null;
  if (isWeb()) {
    webViewProvider?.setState("idle");
  } else {
    copyButton?.hide();
    setIdleState();
  }
}

// ─── Commands ───
async function copyTranscript() {
  if (!pendingText) return;
  await vscode.env.clipboard.writeText(pendingText);
  hideActionButtons();
}

async function stopRecording() {
  if (isRecording) await stopAndTranscribe();
}

async function toggleRecording() {
  if (isRecording) {
    await stopAndTranscribe();
  } else {
    hideActionButtons();
    startRecording();
  }
}

// ─── Recording ───
function getRecordCommand(): { cmd: string; args: string[] } {
  if (os.platform() === "darwin") {
    return { cmd: "rec", args: ["-q", "-r", "16000", "-c", "1", "-b", "16", tempFilePath] };
  }
  return { cmd: "sox", args: ["-d", "-r", "16000", "-c", "1", "-b", "16", tempFilePath] };
}

function startRecording() {
  try {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    const { cmd, args } = getRecordCommand();
    recordingProcess = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });

    recordingProcess.on("error", (err) => {
      isRecording = false;
      setIdleState();
      webViewProvider?.setState("idle");
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const tool = os.platform() === "darwin" ? "sox (brew install sox)" : "sox (sudo apt install sox)";
        vscode.window.showErrorMessage(`VibeMic: ${cmd} not found. Install: ${tool}`);
      } else {
        vscode.window.showErrorMessage(`VibeMic: Recording error — ${err.message}`);
      }
    });

    recordingProcess.on("close", () => { recordingProcess = null; });

    isRecording = true;
    vscode.commands.executeCommand("setContext", "vibemic.isRecording", true);
    setRecordingState();
    webViewProvider?.setState("recording");
  } catch (err: any) {
    vscode.window.showErrorMessage(`VibeMic: Failed to start — ${err.message}`);
    setIdleState();
    webViewProvider?.setState("idle");
  }
}

async function stopAndTranscribe() {
  if (!recordingProcess) {
    isRecording = false;
    vscode.commands.executeCommand("setContext", "vibemic.isRecording", false);
    setIdleState();
    webViewProvider?.setState("idle");
    return;
  }

  setTranscribingState();
  webViewProvider?.setState("transcribing");

  recordingProcess.kill("SIGINT");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (recordingProcess && !recordingProcess.killed) recordingProcess.kill("SIGKILL");
      resolve();
    }, 2000);
    if (recordingProcess) {
      recordingProcess.on("exit", () => { clearTimeout(timeout); resolve(); });
    } else {
      clearTimeout(timeout); resolve();
    }
  });

  isRecording = false;
  vscode.commands.executeCommand("setContext", "vibemic.isRecording", false);
  recordingProcess = null;

  if (!fs.existsSync(tempFilePath)) {
    vscode.window.showErrorMessage("VibeMic: No audio recorded. Check mic.");
    setIdleState();
    webViewProvider?.setState("idle");
    return;
  }

  const stat = fs.statSync(tempFilePath);
  if (stat.size < 1000) {
    vscode.window.showWarningMessage("VibeMic: Too short, try again.");
    setIdleState();
    webViewProvider?.setState("idle");
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration("vibemic");
    const apiKey = config.get<string>("openaiApiKey");
    if (!apiKey) {
      vscode.window.showErrorMessage('VibeMic: No API key. Settings → search "vibemic".');
      setIdleState();
      webViewProvider?.setState("idle");
      return;
    }

    const language = config.get<string>("language") || undefined;
    const openai = new OpenAI({ apiKey });
    const audioFile = fs.createReadStream(tempFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      ...(language ? { language } : {}),
    });

    const text = transcription.text?.trim();
    if (!text) {
      vscode.window.showWarningMessage("VibeMic: No speech detected.");
      setIdleState();
      webViewProvider?.setState("idle");
      return;
    }

    if (!isWeb()) {
      // Desktop: clipboard + paste (original working method)
      await vscode.env.clipboard.writeText(text);
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      setIdleState();
    } else {
      // Web: show copy UI in webview
      showActionButtons(text);
    }

  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("401") || msg.includes("Incorrect API key")) {
      vscode.window.showErrorMessage("VibeMic: Invalid API key.");
    } else if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
      vscode.window.showErrorMessage("VibeMic: Can't reach OpenAI.");
    } else {
      vscode.window.showErrorMessage(`VibeMic: Failed — ${msg}`);
    }
    setIdleState();
    webViewProvider?.setState("idle");
  }

  try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch {}
}

export function deactivate() {
  if (recordingProcess) recordingProcess.kill("SIGKILL");
}
