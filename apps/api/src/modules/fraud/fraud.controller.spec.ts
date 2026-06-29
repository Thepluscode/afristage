import { FraudController } from './fraud.controller';
describe('FraudController', () => {
  it('delegates assessCreator', () => {
    const s = { assessCreator: jest.fn() };
    new FraudController(s as any).assessCreator('c1');
    expect(s.assessCreator).toHaveBeenCalledWith('c1');
  });
});
