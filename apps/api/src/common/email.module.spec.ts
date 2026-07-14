import { EmailModule } from './email.module';

describe('EmailModule', () => {
  it('is a defined global module class', () => {
    expect(new EmailModule()).toBeDefined();
  });
});
