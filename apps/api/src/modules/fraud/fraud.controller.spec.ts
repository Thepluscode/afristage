import { FraudController } from './fraud.controller';
describe('FraudController', () => {
  it('delegates assessCreator and assessGroup', () => {
    const s = { assessCreator: jest.fn(), assessGroup: jest.fn() };
    const c = new FraudController(s as any);
    c.assessCreator('c1');
    c.assessGroup({ userIds: ['a', 'b'] });
    expect(s.assessCreator).toHaveBeenCalledWith('c1');
    expect(s.assessGroup).toHaveBeenCalledWith(['a', 'b']);
  });
});
