"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

export function GoogleSignInButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // The callback only honours paths inside this app.
        redirectTo: `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`,
      },
    });
    // On success the browser leaves for Google, so only failure returns here.
    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={signIn} disabled={pending} className="w-full">
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {failed ? (
        <p role="alert" className="text-body-sm text-danger">
          Could not reach Google sign-in. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
