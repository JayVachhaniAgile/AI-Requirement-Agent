import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

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
}
