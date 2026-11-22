import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronLeft, Menu, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminSections } from "@/lib/admin-sections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="admin-shell min-h-dvh bg-background font-sans text-foreground">
      {mobileOpen && <div className="admin-overlay fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 motion-reduce:transition-none", collapsed ? "w-20" : "w-64", mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><ShieldCheck className="size-6" /></div>
          {!collapsed && <div className="min-w-0"><p className="text-lg font-bold">UNITYSUB</p><p className="text-xs text-sidebar-muted">Admin Panel</p></div>}
          <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="ml-auto shrink-0 lg:hidden"><X /></Button>
        </div>
        <nav aria-label="Admin navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {adminSections.map((item) => {
            const active = item.slug ? pathname === `/admin/${item.slug}` : pathname === "/admin" || pathname === "/admin/";
            const classes = cn("h-11 w-full justify-start gap-3 px-3 font-normal", active ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground", collapsed && "justify-center px-0");
            return <Button key={item.slug} variant="ghost" asChild className={classes} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}>{item.slug ? <Link to="/admin/$section" params={{ section: item.slug }}><item.icon />{!collapsed && item.label}</Link> : <Link to="/admin"><item.icon />{!collapsed && item.label}</Link>}</Button>;
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3">
          <Button variant="ghost" className="hidden w-full justify-start text-sidebar-muted lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : undefined} onClick={() => setCollapsed(!collapsed)}><ChevronLeft className={cn(collapsed && "rotate-180")} />{!collapsed && "Collapse"}</Button>
          <Button variant="ghost" className="w-full justify-start text-sidebar-muted" asChild title="Back to app"><Link to="/"><ArrowLeft />{!collapsed && "Back to app"}</Link></Button>
        </div>
      </aside>
      <div className={cn("min-w-0 transition-[margin] duration-200 motion-reduce:transition-none", collapsed ? "lg:ml-20" : "lg:ml-64")}>
        <header className="flex h-20 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" aria-label="Open menu" className="lg:hidden" onClick={() => { setCollapsed(false); setMobileOpen(true); }}><Menu /></Button><span className="truncate text-sm font-semibold">UNITYSUB <span className="font-normal text-muted-foreground">/ Administration</span></span></div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-admin-warning" />Not connected</span>
        </header>
        <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}