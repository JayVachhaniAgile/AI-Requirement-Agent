import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/projects',
})
export class ProjectsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ProjectsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId?: string },
  ): { ok: boolean; room?: string } {
    const projectId = body?.projectId?.trim();
    if (!projectId) return { ok: false };
    const room = this.room(projectId);
    void client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
    return { ok: true, room };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId?: string },
  ): { ok: boolean } {
    const projectId = body?.projectId?.trim();
    if (!projectId) return { ok: false };
    void client.leave(this.room(projectId));
    return { ok: true };
  }

  emitToProject(projectId: string, event: string, payload: unknown): void {
    this.server?.to(this.room(projectId)).emit(event, payload);
  }

  private room(projectId: string): string {
    return `project:${projectId}`;
  }
}
