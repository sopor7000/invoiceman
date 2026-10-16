// Franja tricolor + banner institucional gris
export default function Banner() {
  return (
    <div>
      <div
        className="h-1.5"
        style={{ background: 'linear-gradient(90deg,#b31942 0 33.3%,#ffffff 33.3% 66.6%,#0a3161 66.6% 100%)' }}
        aria-hidden="true"
      />
      <div className="bg-linear-to-r from-surface-alt to-surface text-xs text-ink shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5">
          <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-primary">
            <span className="h-2 w-2 rounded-full bg-flag shadow-[0_0_0_3px_rgb(179_25_66/0.25)]" aria-hidden="true" />
            Uso interno
          </span>
          <span className="text-muted">
            Esta aplicación procesa información tributaria y datos personales. Úsala solo para fines autorizados.
          </span>
        </div>
      </div>
    </div>
  );
}