import { IsOptional, IsString } from 'class-validator';

export class ConfirmDiscoveryDto {
  @IsOptional()
  @IsString()
  ideaInterpretation?: string;

  @IsOptional()
  @IsString()
  problemStatement?: string;

  @IsOptional()
  @IsString()
  proposedSolution?: string;

  @IsOptional()
  @IsString()
  initialScope?: string;
}
