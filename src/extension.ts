import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";

let recordButton: vscode.StatusBarItem;
let recordingProcess: ChildProcess | null = null;
let isRecording = false;
let tempFilePath: string;

export function activate(context: vscode.ExtensionContext) {
  tempFilePath = path.join(context.globalStorageUri.fsPath, "recording.wav");
  fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });

  recordButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  recordButton.command = "vibemic.toggleRecording";
  setIdleState();
  recordButton.show();

  context.subscriptions.push(
    vscode.commands.registerCommand("vibemic.toggleRecording", toggleRecording),
    recordButton
  );
}

function setIdleState() {
  recordButton.text = "$(mic) VibeMic";
  recordButton.tooltip = "Click to start recording (Ctrl+Shift+M)";
  recordButton.backgroundColor = undefined;
  recordButton.color = undefined;
}

function setRecordingState() {
  recordButton.text = "$(circle-filled) Recording...";
  recordButton.tooltip = "Click to stop and transcribe";
  recordButton.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.errorBackground"
  );
  recordButton.color = new vscode.ThemeColor("statusBarItem.errorForeground");
}

function setTranscribingState() {
  recordButton.text = "$(loading~spin) Transcribing...";
  recordButton.tooltip = "Sending to Whisper API...";
  recordButton.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.warningBackground"
  );
  recordButton.color = new vscode.ThemeColor(
    "statusBarItem.warningForeground"
  );
}

async function toggleRecording() {
  if (isRecording) {
    await stopAndTranscribe();
  } else {
    startRecording();
  }
}

function getRecordCommand(): { cmd: string; args: string[] } {
  if (os.platform() === "darwin") {
    return {
      cmd: "rec",
      args: ["-q", "-r", "16000", "-c", "1", "-b", "16", tempFilePath],
    };
  }
  return {
    cmd: "sox",
    args: ["-d", "-r", "16000", "-c", "1", "-b", "16", tempFilePath],
  };
}

function startRecording() {
  try {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    const { cmd, args } = getRecordCommand();
    recordingProcess = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });

    recordingProcess.on("error", (err) => {
      isRecording = false;
      setIdleState();
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const tool =
          os.platform() === "darwin"
            ? "sox (brew install sox)"
            : "sox (sudo apt install sox)";
        vscode.window.showErrorMessage(
          `VibeMic: ${cmd} not found. Install: ${tool}`
        );
      } else {
        vscode.window.showErrorMessage(
          `VibeMic: Recording error — ${err.message}`
        );
      }
    });

    recordingProcess.on("close", () => {
      recordingProcess = null;
    });

    isRecording = true;
    setRecordingState();
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `VibeMic: Failed to start — ${err.message}`
    );
    setIdleState();
  }
}

async function stopAndTranscribe() {
  if (!recordingProcess) {
    isRecording = false;
    setIdleState();
    return;
  }

  setTranscribingState();

  recordingProcess.kill("SIGINT");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (recordingProcess && !recordingProcess.killed) {
        recordingProcess.kill("SIGKILL");
      }
      resolve();
    }, 2000);
    if (recordingProcess) {
      recordingProcess.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    } else {
      clearTimeout(timeout);
      resolve();
    }
  });

  isRecording = false;
  recordingProcess = null;

  if (!fs.existsSync(tempFilePath)) {
    vscode.window.showErrorMessage("VibeMic: No audio recorded. Check mic.");
    setIdleState();
    return;
  }

  const stat = fs.statSync(tempFilePath);
  if (stat.size < 1000) {
    vscode.window.showWarningMessage("VibeMic: Too short, try again.");
    setIdleState();
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration("vibemic");
    const apiKey = config.get<string>("openaiApiKey");

    if (!apiKey) {
      vscode.window.showErrorMessage(
        'VibeMic: No API key. Settings → search "vibemic".'
      );
      setIdleState();
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
      return;
    }

    // Auto-copy to clipboard and paste
    await vscode.env.clipboard.writeText(text);
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    vscode.window.showInformationMessage(
      `VibeMic: Pasted! "${text.substring(0, 60)}${text.length > 60 ? "..." : ""}"`
    );
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("401") || msg.includes("Incorrect API key")) {
      vscode.window.showErrorMessage("VibeMic: Invalid API key.");
    } else if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
      vscode.window.showErrorMessage("VibeMic: Can't reach OpenAI.");
    } else {
      vscode.window.showErrorMessage(`VibeMic: Failed — ${msg}`);
    }
  }

  setIdleState();

  try {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  } catch {}
}

export function deactivate() {
  if (recordingProcess) {
    recordingProcess.kill("SIGKILL");
  }
}
