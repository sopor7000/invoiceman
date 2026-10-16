export default function Spinner({ className = '' }) {
  return (
    <div className={`flex justify-center py-10 ${className}`} role="status" aria-label="Cargando">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-indigo-600" />
    </div>
  );
}