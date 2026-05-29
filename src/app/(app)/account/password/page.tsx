import ChangePasswordForm from "@/components/ChangePasswordForm";

// The (app) layout already guards this — unauthenticated users are sent to
// /login by the proxy and by the server-side layout check.
export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
