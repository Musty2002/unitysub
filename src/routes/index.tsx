import { createFileRoute } from "@tanstack/react-router";

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
      <iframe
        title="UNITYSUB premium digital services app"
        src="/UNITYSUB_PHYSICAL_CARD_DISPLAY_FIXED.html?v=auth-refresh-2"
        className="h-full w-full border-0"
      />
    </main>
  );
}
