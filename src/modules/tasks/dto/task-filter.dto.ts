import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class TaskFilterDto {
  @ApiProperty({ required: false, enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({ required: false, enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiProperty({ required: false, description: 'Search keyword for task title or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter tasks created from this date' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiProperty({ required: false, description: 'Filter tasks created up to this date' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiProperty({ required: false, description: 'Filter tasks by user ID (admin use only)' })
  @IsOptional()
  @IsString()
  userId?: string;
}
