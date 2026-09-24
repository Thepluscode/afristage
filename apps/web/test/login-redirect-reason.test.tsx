import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LoginPage from '../app/login/LoginForm';

describe('login page redirect reason', () => {
  it('says why a gated page sent you here', () => {
    render(<LoginPage searchParams={{ next: '/buy' }} />);
    expect(screen.getByText('Sign in to buy coins.')).toBeInTheDocument();
  });

  it('says nothing when arriving directly', () => {
    render(<LoginPage searchParams={{}} />);
    expect(screen.queryByText(/^Sign in to /)).not.toBeInTheDocument();
  });

  it('does not echo an attacker-supplied next back onto the page', () => {
    render(<LoginPage searchParams={{ next: '/evil?msg=Your account is suspended' }} />);
    expect(screen.queryByText(/suspended/)).not.toBeInTheDocument();
    expect(screen.queryByText(/evil/)).not.toBeInTheDocument();
  });
});
