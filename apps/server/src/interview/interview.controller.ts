import { Body, Controller, Get, Param, Post, Logger, NotFoundException } from '@nestjs/common';
import { InterviewService } from './interview.service';

@Controller('interviews')
export class InterviewController {
  private readonly logger = new Logger(InterviewController.name);

  constructor(private readonly interviewService: InterviewService) {}

  @Post('start')
  async start(@Body() body: { name: string; idea?: string }) {
    return this.interviewService.startInterview(body.name, body.idea);
  }

  @Post(':id/answer')
  async answer(
    @Param('id') id: string,
    @Body() body: { answer: string },
  ) {
    return this.interviewService.answerQuestion(id, body.answer);
  }

  @Post(':id/continue')
  async continue(@Param('id') id: string) {
    try {
      const session = await this.interviewService.continueSession(id);
      return { session, history: session.history };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Failed to continue session ${id}: ${err}`);
      throw err;
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.interviewService.getSession(id);
  }
}
