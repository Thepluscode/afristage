import { ChatController } from './chat.controller';
describe('ChatController', () => {
  function make() {
    const chat = { listMessages: jest.fn(), mute: jest.fn().mockResolvedValue({ durationSeconds: 600 }), unmute: jest.fn(), deleteMessage: jest.fn().mockResolvedValue({ messageId: 'm1' }) };
    const gateway = { emit: jest.fn() };
    return { c: new ChatController(chat as any, gateway as any), chat, gateway };
  }
  it('lists messages + unmutes', () => {
    const { c, chat } = make();
    c.messages('r1'); c.unmute({ sub: 'u1' }, 'r1', 'v1');
    expect(chat.listMessages).toHaveBeenCalledWith('r1'); expect(chat.unmute).toHaveBeenCalled();
  });
  it('mute emits user.muted', async () => {
    const { c, gateway } = make();
    await c.mute({ sub: 'u1' }, 'r1', 'v1', 300, 'spam');
    expect(gateway.emit).toHaveBeenCalledWith('r1', 'user.muted', expect.objectContaining({ userId: 'v1' }));
  });
  it('deleteMessage emits chat.deleted', async () => {
    const { c, gateway } = make();
    await c.deleteMessage({ sub: 'u1' }, 'r1', 'm1');
    expect(gateway.emit).toHaveBeenCalledWith('r1', 'chat.deleted', expect.objectContaining({ messageId: 'm1' }));
  });
});
