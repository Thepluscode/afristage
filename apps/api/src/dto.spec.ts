import { validateSync } from 'class-validator';

import { LoginDto } from './modules/auth/dto/login.dto';
import { RefreshTokenDto } from './modules/auth/dto/refresh-token.dto';
import { RegisterDto } from './modules/auth/dto/register.dto';
import { AcceptBetaInviteDto } from './modules/beta/dto/accept-beta-invite.dto';
import { CreateBetaInviteDto } from './modules/beta/dto/create-beta-invite.dto';
import { RequestBetaInviteDto } from './modules/beta/dto/request-beta-invite.dto';
import { ApplyCreatorDto } from './modules/creators/dto/apply-creator.dto';
import { CreateGiftDto } from './modules/gifts/dto/create-gift.dto';
import { SendGiftDto } from './modules/gifts/dto/send-gift.dto';
import { UpdateGiftDto } from './modules/gifts/dto/update-gift.dto';
import { CreateLiveRoomDto } from './modules/live-rooms/dto/create-live-room.dto';
import { CreateReportDto } from './modules/moderation/dto/create-report.dto';
import { CreatePaymentIntentDto } from './modules/payments/dto/create-payment-intent.dto';
import { CreatePayoutMethodDto } from './modules/payouts/dto/create-payout-method.dto';
import { RequestPayoutDto } from './modules/payouts/dto/request-payout.dto';
import { AddMessageDto } from './modules/support/dto/add-message.dto';
import { CreateSupportTicketDto } from './modules/support/dto/create-support-ticket.dto';
import { ALLOWED_CONTENT_TYPES, PresignUploadDto } from './modules/uploads/dto/presign-upload.dto';
import { UpdateProfileDto } from './modules/users/dto/update-profile.dto';

// DTOs are class-validator schemas with no runtime logic; instantiating each one
// loads the module (executing its decorators) and exercises the class shape.
// validateSync confirms the decorators are wired (a blank DTO yields violations).
describe('DTOs instantiate and validate', () => {
  const dtoClasses = [
    LoginDto, RefreshTokenDto, RegisterDto,
    AcceptBetaInviteDto, CreateBetaInviteDto, RequestBetaInviteDto,
    ApplyCreatorDto, CreateGiftDto, SendGiftDto, UpdateGiftDto,
    CreateLiveRoomDto, CreateReportDto, CreatePaymentIntentDto,
    CreatePayoutMethodDto, RequestPayoutDto, AddMessageDto,
    CreateSupportTicketDto, PresignUploadDto, UpdateProfileDto
  ];

  it.each(dtoClasses.map((C) => [C.name, C] as const))('%s constructs and runs validators', (_name, C) => {
    const instance = new (C as any)();
    expect(instance).toBeInstanceOf(C);
    expect(() => validateSync(instance)).not.toThrow();
  });

  it('exposes the upload content-type allowlist', () => {
    expect(ALLOWED_CONTENT_TYPES['image/png']).toBe('png');
    expect(Object.keys(ALLOWED_CONTENT_TYPES)).toContain('image/webp');
  });
});
