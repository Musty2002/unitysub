import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  const [showAdmin, setShowAdmin] = useState(false);
  const appFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = appFrameRef.current;
    if (!frame) return;

    let splashObserver: MutationObserver | undefined;
    const revealAdminWhenSplashEnds = () => {
      const appDocument = frame.contentDocument;
      if (!appDocument || appDocument.URL === "about:blank" || appDocument.readyState !== "complete") return;

      const splash = appDocument.getElementById("zumaSplash");
      if (!splash || splash.classList.contains("hide")) {
        setShowAdmin(true);
        splashObserver?.disconnect();
        return;
      }
      if (splashObserver) return;

      splashObserver = new MutationObserver(() => {
        if (!splash.classList.contains("hide")) return;
        setShowAdmin(true);
        splashObserver?.disconnect();
        splashObserver = undefined;
      });
      splashObserver.observe(splash, { attributes: true, attributeFilter: ["class"] });
    };

    frame.addEventListener("load", revealAdminWhenSplashEnds);
    revealAdminWhenSplashEnds();
    return () => {
      frame.removeEventListener("load", revealAdminWhenSplashEnds);
      splashObserver?.disconnect();
    };
  }, []);

  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-background">
      {showAdmin && <Button asChild variant="outline" size="sm" className="fixed right-3 top-3 z-50" title="Open UNITYSUB admin panel"><Link to="/admin"><ShieldCheck />Admin</Link></Button>}
      <iframe
        title="UNITYSUB premium digital services app"
        src="/UNITYSUB_PHYSICAL_CARD_DISPLAY_FIXED.html"
        className="h-full w-full border-0"
        ref={appFrameRef}
      />
    </main>
  );
}
