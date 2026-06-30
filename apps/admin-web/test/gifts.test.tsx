import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet, adminPost, adminPatch } from '../lib/api';
import GiftsPage from '../app/gifts/page';

afterEach(() => vi.restoreAllMocks());

const gift = (over: Partial<any> = {}) => ({ id: 'g1', name: 'Rose', coinPrice: 10, isActive: true, animationUrl: null, ...over });

describe('GiftsPage', () => {
  it('renders error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('gifts-boom'));
    render(<GiftsPage />);
    expect(await screen.findByText('gifts-boom')).toBeInTheDocument();
  });

  it('empty -> empty state', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<GiftsPage />);
    expect(await screen.findByText('No gifts have been configured.')).toBeInTheDocument();
  });

  it('renders active gift (configured animation) and inactive gift (missing animation)', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      gift({ id: 'a', name: 'Active', isActive: true, animationUrl: 'http://cdn/x.gif' }),
      gift({ id: 'b', name: 'Inactive', isActive: false, animationUrl: null })
    ]);
    render(<GiftsPage />);
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getByText('Missing')).toBeInTheDocument();
    expect(screen.getByText('Replace Animation')).toBeInTheDocument(); // has animationUrl
    expect(screen.getByText('Upload Animation')).toBeInTheDocument(); // no animationUrl
    expect(screen.getByText('Enable Gift')).toBeInTheDocument(); // inactive -> enable button
  });

  it('create gift: early-return when fields empty, then real create', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    vi.mocked(adminPost).mockResolvedValue({});
    const { container } = render(<GiftsPage />);
    await screen.findByText('No gifts have been configured.');
    const form = container.querySelector('form.toolbar') as HTMLFormElement;
    // empty -> early return, no post
    fireEvent.submit(form);
    expect(adminPost).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Gift name'), { target: { value: 'NewGift' } });
    fireEvent.change(screen.getByPlaceholderText('Coins'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Gift' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/gifts', { name: 'NewGift', coinPrice: 25 }));
  });

  it('editPrice: cancel (prompt null) does nothing; confirm patches', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift({ name: 'Rose', coinPrice: 10 })]);
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<GiftsPage />);
    await screen.findByText('Rose');
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
    fireEvent.click(screen.getByText('Edit Price'));
    expect(adminPatch).not.toHaveBeenCalled();
    promptSpy.mockReturnValueOnce('42');
    fireEvent.click(screen.getByText('Edit Price'));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/gifts/g1', { coinPrice: 42 }));
  });

  it('toggle active gift (confirm true) disables it', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift({ isActive: true, name: 'Rose' })]);
    vi.mocked(adminPatch).mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GiftsPage />);
    await screen.findByText('Rose');
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/gifts/g1', { isActive: false }));
  });

  it('ConfirmDialog declined (confirm false) does not toggle', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift({ isActive: true, name: 'Rose' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GiftsPage />);
    await screen.findByText('Rose');
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(adminPatch).not.toHaveBeenCalled();
  });

  it('toggle inactive gift via Enable button', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift({ isActive: false, name: 'Rose' })]);
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<GiftsPage />);
    await screen.findByText('Rose');
    fireEvent.click(screen.getByRole('button', { name: 'Enable Gift' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/gifts/g1', { isActive: true }));
  });

  it('onAnimationPicked: no file selected -> early return', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift()]);
    const { container } = render(<GiftsPage />);
    await screen.findByText('Rose');
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    // fire change with no files
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(adminPost).not.toHaveBeenCalled();
  });

  it('upload flow: picks file, presign + PUT + patch success', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift({ id: 'g1', name: 'Rose' })]);
    vi.mocked(adminPost).mockResolvedValue({ uploadUrl: 'http://up', fileUrl: 'http://cdn/file' });
    vi.mocked(adminPatch).mockResolvedValue({});
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<GiftsPage />);
    await screen.findByText('Rose');
    fireEvent.click(screen.getByText('Upload Animation')); // sets pendingGift, clicks fileRef
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/gifts/g1', { animationUrl: 'http://cdn/file' }));
    expect(adminPost).toHaveBeenCalledWith('/uploads/presign', { contentType: 'image/png', kind: 'gift_animation' });
    expect(fetchMock).toHaveBeenCalledWith('http://up', expect.objectContaining({ method: 'PUT' }));
  });

  it('upload flow: PUT not ok -> error state', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift({ id: 'g1', name: 'Rose' })]);
    vi.mocked(adminPost).mockResolvedValue({ uploadUrl: 'http://up', fileUrl: 'http://cdn/file' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { container } = render(<GiftsPage />);
    await screen.findByText('Rose');
    fireEvent.click(screen.getByText('Upload Animation'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText('Upload failed (500)')).toBeInTheDocument();
  });

  it('shows "Uploading…" label and disables button while in flight', async () => {
    vi.mocked(adminGet).mockResolvedValue([gift({ id: 'g1', name: 'Rose' })]);
    let resolvePresign: (v: unknown) => void = () => {};
    vi.mocked(adminPost).mockReturnValue(new Promise((r) => { resolvePresign = r; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    vi.mocked(adminPatch).mockResolvedValue({});

    const { container } = render(<GiftsPage />);
    await screen.findByText('Rose');
    fireEvent.click(screen.getByText('Upload Animation'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
    resolvePresign({ uploadUrl: 'http://up', fileUrl: 'http://cdn/file' });
    await waitFor(() => expect(adminPatch).toHaveBeenCalled());
  });
});
