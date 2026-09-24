import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RegisterPage from '../app/register/RegisterForm';

describe('register error display', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows each validation message instead of gluing them together', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: ['Username bad.', 'Name bad.'] }), { status: 400 })));
    render(<RegisterPage searchParams={{}} />);
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);
    await waitFor(() => expect(screen.getByText('Username bad. Name bad.')).toBeInTheDocument());
  });
});
