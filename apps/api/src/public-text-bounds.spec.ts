import { validateSync } from 'class-validator';

import { ApplyCreatorDto } from './modules/creators/dto/apply-creator.dto';
import { CreateLiveRoomDto } from './modules/live-rooms/dto/create-live-room.dto';
import { CreateReportDto } from './modules/moderation/dto/create-report.dto';
import { AddMessageDto } from './modules/support/dto/add-message.dto';
import { CreateSupportTicketDto } from './modules/support/dto/create-support-ticket.dto';

// Free text shown to other people — a room title and a stage name to every
// viewer, reports and tickets to staff — was checked only with @IsString():
// blank, or megabytes, both accepted.
const bad = (C: any, fields: Record<string, unknown>) =>
  validateSync(Object.assign(new C(), fields)).map((e) => e.property);

describe('public free-text bounds', () => {
  const room = { title: 'Friday Night Afrobeats', category: 'MUSIC', country: 'NG', language: 'en' };
  const creator = { stageName: 'Nova', category: 'MUSIC', country: 'NG', language: 'en' };
  const ticket = { type: 'GENERAL', subject: 'Payout late', description: 'It has been a week.' };

  it('accepts ordinary values', () => {
    expect(bad(CreateLiveRoomDto, room)).toEqual([]);
    expect(bad(ApplyCreatorDto, creator)).toEqual([]);
    expect(bad(CreateReportDto, { reason: 'SCAM', details: 'x'.repeat(2000) })).toEqual([]);
    expect(bad(AddMessageDto, { message: 'Thanks' })).toEqual([]);
    expect(bad(CreateSupportTicketDto, ticket)).toEqual([]);
  });

  it.each([
    [CreateLiveRoomDto, room, 'title', ['   ', 'x'.repeat(101)]],
    [CreateLiveRoomDto, room, 'country', ['x'.repeat(81)]],
    [ApplyCreatorDto, creator, 'stageName', ['', ' ', 'x'.repeat(51)]],
    [ApplyCreatorDto, creator, 'language', ['x'.repeat(81)]],
    [CreateReportDto, { reason: 'SCAM' }, 'details', ['x'.repeat(2001)]],
    [AddMessageDto, {}, 'message', [' ', 'x'.repeat(5001)]],
    [CreateSupportTicketDto, ticket, 'subject', [' ', 'x'.repeat(201)]],
    [CreateSupportTicketDto, ticket, 'description', ['', 'x'.repeat(5001)]]
  ] as const)('%p rejects bad %s', (C, base, field, values) => {
    for (const v of values) expect(bad(C, { ...base, [field]: v })).toContain(field);
  });
});
