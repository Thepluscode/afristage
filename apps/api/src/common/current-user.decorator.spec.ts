import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';

// Extract the param-decorator factory so it can be invoked directly.
function factoryOf(decorator: any) {
  class T {
    run(@decorator() value: any) { return value; }
  }
  const args = Reflect.getMetadata('__routeArguments__', T, 'run');
  return args[Object.keys(args)[0]].factory;
}

describe('CurrentUser decorator', () => {
  it('returns request.user from the execution context', () => {
    const factory = factoryOf(CurrentUser);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u1' } }) }) } as unknown as ExecutionContext;
    expect(factory(null, ctx)).toEqual({ sub: 'u1' });
  });
});
