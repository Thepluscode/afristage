import ResetPasswordForm from './ResetPasswordForm';

// Next 15 hands a page its query as a Promise. The form is a client component
// and takes plain values, so it stays testable without a request.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <ResetPasswordForm searchParams={await searchParams} />;
}
