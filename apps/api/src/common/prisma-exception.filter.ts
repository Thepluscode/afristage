import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

// There are ~108 create/update/upsert calls in this API and, before this filter,
// nine of them handled Prisma errors. The other ninety-nine turned a constraint
// violation into "500 Internal server error" — which is how signing up twice
// with the same email came to look like the site was down, on the first screen
// of the funnel, until a user's browser console found it.
//
// Handling it at each call site is better where the message can be specific
// (auth.register names WHICH field collided). This is the floor underneath that:
// a database rule the code forgot to anticipate degrades into an honest 4xx
// instead of an outage costume. It is deliberately vague, because a filter
// cannot know what the caller was trying to do — a call site that wants to say
// something useful should still catch its own error.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ method?: string; url?: string }>();

    const { status, message } = PrismaExceptionFilter.translate(exception.code);

    // The client never sees Prisma's text — it names tables, columns and
    // constraints. The server log keeps everything needed to debug.
    this.logger.error(
      `Prisma ${exception.code} on ${req?.method} ${req?.url} -> ${status}: ${exception.message.split('\n').pop()}`
    );

    res.status(status).json({
      statusCode: status,
      message,
      error: status === HttpStatus.CONFLICT ? 'Conflict' : status === HttpStatus.NOT_FOUND ? 'Not Found' : 'Bad Request'
    });
  }

  // https://www.prisma.io/docs/reference/api-reference/error-reference
  static translate(code: string): { status: number; message: string } {
    switch (code) {
      case 'P2002': // unique constraint
        return { status: HttpStatus.CONFLICT, message: 'Those details are already in use.' };
      case 'P2025': // record required by the operation was not found
        return { status: HttpStatus.NOT_FOUND, message: 'That record no longer exists.' };
      case 'P2003': // foreign key constraint
      case 'P2014': // change would violate a required relation
        return { status: HttpStatus.CONFLICT, message: 'That change conflicts with related records.' };
      case 'P2000': // value too long for the column
      case 'P2005': // invalid value for the field type
      case 'P2006':
      case 'P2011': // null constraint violation
        return { status: HttpStatus.BAD_REQUEST, message: 'Some of those details are not valid.' };
      default:
        // Anything unmapped stays a 500 on purpose: a genuine server fault must
        // not be dressed up as the user's mistake, or real outages hide.
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
    }
  }
}
