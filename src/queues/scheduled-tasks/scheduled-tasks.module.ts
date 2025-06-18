import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { OverdueTasksService } from './overdue-tasks.service';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    TasksModule,
    TypeOrmModule.forFeature([Task]),
  ],
  providers: [OverdueTasksService],
  exports: [OverdueTasksService],
})
export class ScheduledTasksModule { }
