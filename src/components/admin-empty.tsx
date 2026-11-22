import { Database } from "lucide-react";

export function AdminEmpty({ title = "No records available" }: { title?: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Database className="size-5" /></div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-5 text-muted-foreground">UNITYSUB live data is not connected.</p>
    </div>
  );
}