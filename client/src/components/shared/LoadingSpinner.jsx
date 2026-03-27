export default function LoadingSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-text-muted border-t-accent-gold" />
    </div>
  );
}
