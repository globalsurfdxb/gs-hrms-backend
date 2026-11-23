import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { SignedIn } from '../../../core/iam/access.decorators.js';
import { InterviewsService } from '../application/interviews.service.js';
import { MyInterviewsResponse, MyReferralsResponse } from './dto/interview.response.js';

/* Self-service hiring pages (My Space): any signed-in employee, always about themselves (@CurrentUser). */
@ApiTags('Hiring · My Space')
@ApiCookieAuth()
@Controller('me')
export class MyHiringController {
  constructor(private readonly hiring: InterviewsService) {}

  @SignedIn()
  @Get('interviews')
  @ApiOperation({
    summary: 'My interviews',
    description:
      'Any signed-in employee. The interviews you are on the panel for, whatever your role: candidate name, job ' +
      'title, round, local time, mode, link, notes and the rest of the panel. No candidate contact details, salary ' +
      'or stage history.',
  })
  @ApiOkResponse({ type: MyInterviewsResponse })
  @ApiErrors(401)
  interviews(@CurrentUser() user: AuthUser) {
    return this.hiring.mine(user);
  }

  @SignedIn()
  @Get('referrals')
  @ApiOperation({
    summary: 'My referrals',
    description:
      'Any signed-in employee. Candidates HR recorded with you as the referrer (source Employee Referral), one row ' +
      'per job with the status in plain words only (RECEIVED, IN_PROCESS, OFFER_STAGE, HIRED, NOT_SELECTED, ' +
      'CLOSED), and the open roles that take referrals. Nothing is public: tell HR about the person you refer.',
  })
  @ApiOkResponse({ type: MyReferralsResponse })
  @ApiErrors(401)
  referrals(@CurrentUser() user: AuthUser) {
    return this.hiring.referrals(user);
  }
}
