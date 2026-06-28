import { PrismaService } from './prisma.service';

describe('PrismaService lifecycle', () => {
  it('connects on module init and disconnects on destroy', async () => {
    const svc = new PrismaService();
    const connect = jest.spyOn(svc, '$connect').mockResolvedValue(undefined as any);
    const disconnect = jest.spyOn(svc, '$disconnect').mockResolvedValue(undefined as any);
    await svc.onModuleInit();
    await svc.onModuleDestroy();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
