"use client";

import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID, identityFromCredential, loadGsi, saveIdentity } from "@/lib/google-identity";

/**
 * Google's own "Sign in with Google" button, rendered by Google Identity Services into this box.
 * On success the token's name, email and photo are kept in this browser only; nothing goes to the API.
 */
export function GoogleSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const signedIn = useRef(onSignedIn);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    signedIn.current = onSignedIn;
  }, [onSignedIn]);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then((id) => {
        const el = box.current;
        if (cancelled || !el) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: ({ credential }) => {
            const identity = credential ? identityFromCredential(credential) : null;
            if (!identity) return setProblem("Google did not return a name. Try again, or continue as Dr. Rowan.");
            if (!saveIdentity(identity)) return setProblem("This browser blocks storage, so the sign-in cannot be kept. Continue as Dr. Rowan instead.");
            signedIn.current();
          },
        });
        el.replaceChildren();
        id.renderButton(el, {
          type: "standard",
          theme: "filled_black",
          shape: "pill",
          size: "large",
          text: "signin_with",
          logo_alignment: "left",
          width: Math.round(Math.min(400, Math.max(200, el.clientWidth))),
        });
      })
      .catch(() => {
        if (!cancelled) setProblem("Google sign-in could not load here. The demo seat still works.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div ref={box} className="flex min-h-[44px] w-full items-center justify-center" />
      {problem && <p role="alert" className="mt-2 text-center font-mono text-[11px] text-spectrum-amber">{problem}</p>}
    </div>
  );
}
