import { UploadsController } from './uploads.controller';
describe('UploadsController', () => {
  it('delegates presign', () => {
    const s = { presign: jest.fn() };
    new UploadsController(s as any).presign({ sub: 'u1' }, { contentType: 'image/png', kind: 'avatar' } as any);
    expect(s.presign).toHaveBeenCalledWith('u1', expect.objectContaining({ kind: 'avatar' }));
  });
});
