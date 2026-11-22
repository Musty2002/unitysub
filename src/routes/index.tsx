import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UNITYSUB | Premium Digital Services" },
      { name: "description", content: "UNITYSUB digital services application." },
      { property: "og:title", content: "UNITYSUB | Premium Digital Services" },
      { property: "og:description", content: "UNITYSUB digital services application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-background">
      <Button asChild variant="outline" size="sm" className="fixed right-3 top-3 z-50" title="Open UNITYSUB admin panel"><Link to="/admin"><ShieldCheck />Admin</Link></Button>
      <iframe
        title="UNITYSUB premium digital services app"
        src="/UNITYSUB_PHYSICAL_CARD_DISPLAY_FIXED.html"
        className="h-full w-full border-0"
      />
    </main>
  );
}
