import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminEmpty } from "@/components/admin-empty";
import { getAdminSection } from "@/lib/admin-sections";

export const Route = createFileRoute("/admin/$section")({
  loader: ({ params }) => { const section = getAdminSection(params.section); if (!section) throw notFound(); return { label: section.label }; },
  head: ({ loaderData }) => { const label = loaderData?.label ?? "Unavailable"; const description = `UNITYSUB administration: ${label.toLowerCase()}.`; return { meta: [
    { title: `${label} | UNITYSUB Admin` }, { name: "description", content: description },
    { property: "og:title", content: `${label} | UNITYSUB Admin` }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }; },
  component: AdminSection,
});

function AdminSection() {
  const { section: slug } = Route.useParams();
  const section = getAdminSection(slug);
  if (!section) return null;
  return <div key={slug}><h1 className="text-2xl font-bold">{section.label}</h1><p className="mt-1 text-sm text-muted-foreground">UNITYSUB Administration</p>{slug === "settings" ? <AdminSettings /> : <Records label={section.label} columns={section.columns ?? []} slug={slug} />}</div>;
}

function Records({ label, columns, slug }: { label: string; columns: string[]; slug: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const statuses = slug === "transactions" ? ["Completed", "Pending", "Failed"] : slug === "users" || slug === "wallets" ? ["Active", "Inactive"] : ["Active", "Pending"];
  return <section className="mt-6">
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 grow sm:max-w-sm"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input aria-label={`Search ${label.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="h-10 w-full rounded-md border border-input bg-card pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
      <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item.toLowerCase()}>{item}</option>)}</select>
      <Button variant="outline" disabled className="sm:ml-auto" title="No records available to export"><Download />Export</Button>
    </div>
    <div className="overflow-x-auto border-y border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-muted-foreground">{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length}><AdminEmpty title={search || status !== "all" ? "No matching records" : `No ${label.toLowerCase()} available`} /></td></tr></tbody></table></div>
    <p className="mt-4 text-xs text-muted-foreground">0 records</p>
  </section>;
}

function AdminSettings() {
  return <div className="mt-8 max-w-3xl space-y-8">{[
    { title: "Application", rows: [["Application name", "UNITYSUB"], ["Currency", "NGN · Nigerian Naira"], ["Customer app", "Original supplied application"]] },
    { title: "Connections", rows: [["Live records", "Not connected"], ["Admin sign-in", "Not configured"], ["Payment services", "Not connected"], ["Identity verification", "Not connected"]] },
  ].map((group) => <section key={group.title}><h2 className="mb-3 text-lg font-semibold">{group.title}</h2><dl className="divide-y divide-border border-y border-border">{group.rows.map(([name, value]) => <div key={name} className="flex flex-wrap justify-between gap-2 py-4 text-sm"><dt className="text-muted-foreground">{name}</dt><dd className="font-medium">{value}</dd></div>)}</dl></section>)}<div className="flex items-start gap-3 border-l-2 border-admin-warning pl-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-admin-warning" /><p className="text-sm leading-6 text-muted-foreground">Admin access is not configured. No private customer records or live financial actions are available.</p></div></div>;
}