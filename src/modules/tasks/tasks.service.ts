import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) { }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(task);

      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      });

      await queryRunner.commitTransaction();
      return savedTask;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Failed to enqueue task status update:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    userId: string,
    currentPage: number,
    pageSize: number,
    filter: TaskFilterDto,
  ): Promise<Task[]> {
    const whereClause: any = { user: { id: userId } };

    if (filter.status) whereClause.status = filter.status;
    if (filter.priority) whereClause.priority = filter.priority;

    if (filter.fromDate || filter.toDate) {
      whereClause.createdAt = {};
      if (filter.fromDate) whereClause.createdAt['$gte'] = new Date(filter.fromDate);
      if (filter.toDate) whereClause.createdAt['$lte'] = new Date(filter.toDate);
    }

    const query = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.userId = :userId', { userId })
      .skip((currentPage - 1) * pageSize)
      .take(pageSize);

    if (filter.status) {
      query.andWhere('task.status = :status', { status: filter.status });
    }

    if (filter.priority) {
      query.andWhere('task.priority = :priority', { priority: filter.priority });
    }

    if (filter.fromDate) {
      query.andWhere('task.createdAt >= :fromDate', { fromDate: filter.fromDate });
    }

    if (filter.toDate) {
      query.andWhere('task.createdAt <= :toDate', { toDate: filter.toDate });
    }

    if (filter.search) {
      query.andWhere('(task.title ILIKE :search OR task.description ILIKE :search)', {
        search: `%${filter.search}%`,
      });
    }

    return query.getMany();
  }

  async getAllTasks(): Promise<Task[]> {
    return this.tasksRepository.find();
  }

  async getTaskStats() {
    return this.tasksRepository
      .createQueryBuilder('task')
      .select([
        'COUNT(*) as total',
        `COUNT(*) FILTER (WHERE task.status = 'COMPLETED') as completed`,
        `COUNT(*) FILTER (WHERE task.status = 'IN_PROGRESS') as inProgress`,
        `COUNT(*) FILTER (WHERE task.status = 'PENDING') as pending`,
        `COUNT(*) FILTER (WHERE task.priority = 'HIGH') as highPriority`,
      ])
      .getRawOne();
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({ where: { id }, relations: ['user'] });
    if (!task) {
      throw new NotFoundException(`Task not found`);
    }
    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task not found`);
      }

      const originalStatus = task.status;
      Object.assign(task, updateTaskDto);
      const updatedTask = await queryRunner.manager.save(task);

      if (originalStatus !== updatedTask.status) {
        await this.taskQueue.add('task-status-update', {
          taskId: updatedTask.id,
          status: updatedTask.status,
        });
      }

      await queryRunner.commitTransaction();
      return updatedTask;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Failed to update task or enqueue status update:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async bulkUpdateStatus(ids: string[], status: string): Promise<Task[]> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.update(Task, ids, { status: status as TaskStatus });

      const updatedTasks = await queryRunner.manager.find(Task, {
        where: { id: In(ids) },
        relations: ['user'],
      });

      for (const task of updatedTasks) {
        await this.taskQueue.add('task-status-update', {
          taskId: task.id,
          status: task.status,
        });
      }

      await queryRunner.commitTransaction();
      return updatedTasks;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Failed to bulk update task statuses:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
    await this.tasksRepository.delete({ id });
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.delete(Task, ids);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Failed to bulk delete tasks:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository.find({
      where: { status },
    });
  }

  async applyStatusUpdateFromQueue(id: string, status: string): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
  }
}
