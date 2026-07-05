import { AgenciesController } from './agencies.controller';

describe('AgenciesController', () => {
  it('delegates every endpoint', async () => {
    const s: any = {
      create: jest.fn(), list: jest.fn(), detail: jest.fn(), update: jest.fn(),
      addCreator: jest.fn(), removeCreator: jest.fn()
    };
    const c = new AgenciesController(s);
    c.create({ name: 'N' } as any);
    c.list();
    c.detail('ag1');
    c.update('ag1', { commissionBps: 500 } as any);
    c.addCreator('ag1', 'c1');
    c.removeCreator('ag1', 'c1');
    expect(s.create).toHaveBeenCalledWith({ name: 'N' });
    expect(s.detail).toHaveBeenCalledWith('ag1');
    expect(s.update).toHaveBeenCalledWith('ag1', { commissionBps: 500 });
    expect(s.addCreator).toHaveBeenCalledWith('ag1', 'c1');
    expect(s.removeCreator).toHaveBeenCalledWith('ag1', 'c1');
  });
});
