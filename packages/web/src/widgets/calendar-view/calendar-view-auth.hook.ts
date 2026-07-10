import { useCallback, useState } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useMailStore } from "~/entities/mail/mail.model";

export function useCalendarViewAuth() {
  const instanceEmail = useInstancesStore((s) => s.getCurrentInstance()?.email ?? "");
  const instance = useInstancesStore((s) => s.getCurrentInstance());
  const session = useMailStore((s) => s.session);
  const signingIn = useMailStore((s) => s.signingIn);
  const mailError = useMailStore((s) => s.error);
  const signIn = useMailStore((s) => s.signIn);
  const signInWithZulip = useMailStore((s) => s.signInWithZulip);
  const signOut = useMailStore((s) => s.signOut);

  const [emailOverride, setEmailOverride] = useState("");
  const email = emailOverride.length > 0 ? emailOverride : instanceEmail;
  const canSignInWithZulip =
    instance != null && instance.apiKey.length > 0 && instance.email.length > 0;

  const handleAuthSubmit = useCallback(
    async (password: string) => {
      await signIn(email, password);
    },
    [email, signIn],
  );

  const handleZulipSignIn = useCallback(async () => {
    if (instance == null) return;
    await signInWithZulip(instance.email, instance.realm, instance.apiKey);
  }, [instance, signInWithZulip]);

  return {
    session,
    signingIn,
    mailError,
    email,
    canSignInWithZulip,
    setEmail: setEmailOverride,
    handleAuthSubmit,
    handleZulipSignIn,
    handleSignOut: signOut,
  };
}
