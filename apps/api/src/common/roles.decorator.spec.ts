import 'reflect-metadata';
import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles decorator', () => {
  it('attaches the roles metadata to the handler', () => {
    class C {
      @Roles('ADMIN' as any, 'MODERATOR' as any)
      handler() {}
    }
    expect(Reflect.getMetadata(ROLES_KEY, C.prototype.handler)).toEqual(['ADMIN', 'MODERATOR']);
  });
});
