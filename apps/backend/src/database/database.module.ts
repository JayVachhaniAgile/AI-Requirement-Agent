import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import {
  Project,
  KnowledgeItem,
  WorkflowStep,
  AgentExecution,
  ClarificationQuestion,
  ValidationIssue,
  Document,
  DocumentVersion,
  Settings,
  InterviewSessionEntity,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [
          Project,
          KnowledgeItem,
          WorkflowStep,
          AgentExecution,
          ClarificationQuestion,
          ValidationIssue,
          Document,
          DocumentVersion,
          Settings,
          InterviewSessionEntity,
        ],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        namingStrategy: new SnakeNamingStrategy(),
        ssl:
          config.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
        logging: false,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
