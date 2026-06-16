export interface MailSignInDialogProps {
  open: boolean;
  email: string;
  signingIn: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onSubmit: (password: string) => void;
}
