import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunLogService } from './run-log.service';
import { RunLog } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([RunLog])],
  providers: [RunLogService],
  exports: [RunLogService],
})
export class RunLogModule {}
