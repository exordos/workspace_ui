export interface MailSignInDialogProps {
  open: boolean;
  email: string;
  signingIn: boolean;
  error: string | null;
  canSignInWithZulip?: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (password: string) => void;
  onZulipSignIn?: () => void;
}
