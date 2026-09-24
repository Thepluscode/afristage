import LoginForm from './LoginForm';

// Next 15 hands a page its query as a Promise. The form is a client component
// and takes plain values, so it stays testable without a request.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <LoginForm searchParams={await searchParams} />;
}
