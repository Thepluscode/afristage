import RegisterForm from './RegisterForm';

// Next 15 hands a page its query as a Promise. The form is a client component
// and takes plain values, so it stays testable without a request.
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <RegisterForm searchParams={await searchParams} />;
}
