import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanonicalItem, CanonicalItemVersion } from './canonical-item.entity';
import { CanonicalModelService } from './canonical-model.service';
import { CanonicalModelController } from './canonical-model.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CanonicalItem, CanonicalItemVersion])],
  controllers: [CanonicalModelController],
  providers: [CanonicalModelService],
  exports: [CanonicalModelService],
})
export class CanonicalModelModule {}
