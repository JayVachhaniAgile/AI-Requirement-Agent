import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  idea!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  domain?: string;
}
