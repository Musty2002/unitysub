import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Your Password | UNITYSUB" },
      { name: "description", content: "Choose a new password for your UNITYSUB account." },
      { property: "og:title", content: "Reset Your Password | UNITYSUB" },
      { property: "og:description", content: "Choose a new password for your UNITYSUB account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type ResetState = "checking" | "ready" | "invalid" | "saved";

function ResetPasswordPage() {
  const [resetState, setResetState] = useState<ResetState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const recoveryLink = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    if (!recoveryLink) {
      setResetState("invalid");
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setResetState("ready");
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active && !error && data.session) setResetState("ready");
      else if (active && error) setResetState("invalid");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage("Your password could not be updated. Request a new reset link and try again.");
      return;
    }
    setPassword("");
    setConfirmation("");
    setResetState("saved");
    setMessage("Your password has been updated.");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md space-y-6 border border-border bg-card p-6 sm:p-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">UNITYSUB</p>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
        </div>

        {resetState === "checking" && <p className="text-sm text-muted-foreground">Checking your reset link…</p>}
        {resetState === "invalid" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This reset link is invalid or expired. Request a new one from the app.</p>
            <Button asChild><Link to="/">Return to UNITYSUB</Link></Button>
          </div>
        )}
        {resetState === "saved" && (
          <div className="space-y-4">
            <p role="status" className="text-sm text-muted-foreground">{message}</p>
            <Button asChild><Link to="/">Return to UNITYSUB</Link></Button>
          </div>
        )}
        {resetState === "ready" && (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
              />
            </div>
            {message && <p role="status" className="text-sm text-destructive">{message}</p>}
            <Button className="w-full" type="submit" disabled={saving}>
              {saving ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}