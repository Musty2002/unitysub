import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminEmpty } from "@/components/admin-empty";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [
    { title: "Admin Dashboard | UNITYSUB" },
    { name: "description", content: "UNITYSUB administration dashboard for users, wallets, transactions and digital services." },
    { property: "og:title", content: "Admin Dashboard | UNITYSUB" },
    { property: "og:description", content: "UNITYSUB users, wallet balances and transaction activity overview." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const stats = [
    { title: "Total Users", icon: Users, color: "bg-admin-blue-soft text-admin-blue", unit: "Registered accounts" },
    { title: "Total Wallet Balance", icon: Wallet, color: "bg-admin-green-soft text-primary", unit: "NGN wallet balances" },
    { title: "Total Transactions", icon: Receipt, color: "bg-admin-violet-soft text-admin-violet", unit: "All services" },
    { title: "24h Transaction Volume", icon: TrendingUp, color: "bg-admin-gold-soft text-admin-warning", unit: "Last 24 hours · NGN" },
  ];
  return <>
    <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Welcome to UNITYSUB Admin Panel</p></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <article key={stat.title} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-5"><div className="min-w-0"><p className="text-sm text-muted-foreground">{stat.title}</p><p className="my-3 text-3xl font-bold">—</p><p className="text-xs text-muted-foreground">{stat.unit}</p></div><div className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${stat.color}`}><stat.icon className="size-5" /></div></article>)}</div>
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="min-w-0"><h2 className="mb-4 text-lg font-semibold">Today’s Activity</h2><div className="divide-y divide-border border-y border-border">{["Transactions Today", "Successful Transactions", "Pending Transactions", "Failed Transactions"].map((label) => <div key={label} className="flex justify-between gap-3 py-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold">—</span></div>)}</div></section>
      <section className="min-w-0"><div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Recent Transactions</h2><Button asChild variant="ghost" size="sm"><Link to="/admin/$section" params={{ section: "transactions" }}>View all<ArrowRight /></Link></Button></div><div className="border-y border-border"><AdminEmpty title="No transactions available" /></div></section>
    </div>
    <section className="border-t border-border pt-6"><h2 className="mb-4 text-lg font-semibold">Management</h2><div className="grid gap-3 sm:grid-cols-3">{[{ slug: "users", label: "Users", icon: Users }, { slug: "wallets", label: "Wallets", icon: Wallet }, { slug: "data-pricing", label: "Data Pricing", icon: TrendingUp }].map((item) => <Button key={item.slug} variant="outline" asChild className="h-14 justify-start bg-card"><Link to="/admin/$section" params={{ section: item.slug }}><item.icon className="text-primary" />{item.label}<ArrowRight className="ml-auto text-muted-foreground" /></Link></Button>)}</div></section>
  </>;
}