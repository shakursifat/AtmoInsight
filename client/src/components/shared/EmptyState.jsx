import { AlertTriangle } from 'lucide-react';

export default function EmptyState({ message = "No data available", icon: Icon = AlertTriangle }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center text-text-muted h-full w-full gap-3">
      <Icon className="w-8 h-8 opacity-50" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
