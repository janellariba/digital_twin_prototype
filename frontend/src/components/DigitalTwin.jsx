// Embeds the digital twin HTML (served from public/digital-twin/) in an iframe.
// Keep this component mounted: unmounting reloads the whole 8.6 MB twin.
const TWIN_URL =
  import.meta.env.VITE_TWIN_URL ?? `${import.meta.env.BASE_URL}digital-twin/Muntinlupa_Digital_Twin_offline.html`;

export default function DigitalTwin({ iframeRef, ready }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-line bg-bg">
      <iframe
        ref={iframeRef}
        src={TWIN_URL}
        title="Muntinlupa digital twin"
        className="h-full w-full border-0"
      />
      {!ready && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line bg-panel/90 px-3 py-1.5 text-xs text-muted">
          Connecting to digital twin...
        </div>
      )}
    </div>
  );
}
