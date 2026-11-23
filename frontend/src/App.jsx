// Step 1 page: header + digital twin + test panel.
// Camera feeds and incident panels are added in later steps.
import { useRef } from "react";
import DigitalTwin from "./components/DigitalTwin.jsx";
import TwinControls from "./components/TwinControls.jsx";
import MessageLog from "./components/MessageLog.jsx";
import { useTwinBridge } from "./services/useTwinBridge.js";

export default function App() {
  const iframeRef = useRef(null);
  const bridge = useTwinBridge(iframeRef);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold uppercase tracking-wide">
            AI-SUNOG <span className="text-accent">Monitoring Prototype</span>
          </h1>
          <p className="text-xs text-muted">Step 1: Digital twin integration</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-xs ${
            bridge.ready ? "border-emerald-500 text-emerald-400" : "border-line text-muted"
          }`}
        >
          {bridge.ready ? "TWIN CONNECTED" : "TWIN LOADING"}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="min-w-0 flex-1">
          <DigitalTwin iframeRef={iframeRef} ready={bridge.ready} />
        </div>
        <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
          <TwinControls bridge={bridge} />
          <MessageLog log={bridge.log} />
        </aside>
      </main>
    </div>
  );
}
