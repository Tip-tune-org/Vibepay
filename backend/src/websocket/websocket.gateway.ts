import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Tip } from '../tips/entities/tip.entity';
import { EventStoreService } from './event-store.service';
import { TipVerifiedEvent } from '../tips/events/tip-verified.event';

export interface TipNotificationData {
  type: 'tip_received';
  sequenceId: number;
  data: {
    tipId: string;
    artistId: string;
    trackId?: string;
    amount: number;
    asset: string;
    message?: string;
    senderAddress?: string;
    isAnonymous: boolean;
    createdAt: Date;
    artist?: any;
    track?: any;
  };
}

@WSGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/tips',
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private connectedClients: Map<string, Socket> = new Map();

  constructor(private readonly eventStore: EventStoreService) {}

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, client);

    // Send welcome message
    client.emit('connected', {
      message: 'Connected to VibePay WebSocket',
      clientId: client.id,
      latestSequenceId: this.eventStore.getLatestSequenceId(),
    });

    // Handle initial catch-up if requested
    const lastSequenceId = parseInt(client.handshake.query.lastSequenceId as string);
    if (!isNaN(lastSequenceId)) {
      this.logger.log(`Client ${client.id} requested catch-up from sequence: ${lastSequenceId}`);
      // Replay missed events will be handled after rooms are joined or based on past rooms if stored
      // For now, we'll allow an explicit 'request_missed_events' message or handle it post-authentication
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('join_artist_room')
  handleJoinArtistRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { artistId: string; lastSequenceId?: number },
  ): void {
    const room = `artist_${data.artistId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
    
    client.emit('joined_room', { room, artistId: data.artistId });

    // Catch up if lastSequenceId provided
    if (data.lastSequenceId !== undefined) {
      this.replayMissedEvents(client, data.lastSequenceId, [room]);
    }
  }

  @SubscribeMessage('leave_artist_room')
  handleLeaveArtistRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { artistId: string },
  ): void {
    const room = `artist_${data.artistId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} left room: ${room}`);
    
    client.emit('left_room', { room, artistId: data.artistId });
  }

  @SubscribeMessage('join_track_room')
  handleJoinTrackRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { trackId: string; lastSequenceId?: number },
  ): void {
    const room = `track_${data.trackId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
    
    client.emit('joined_room', { room, trackId: data.trackId });

    // Catch up if lastSequenceId provided
    if (data.lastSequenceId !== undefined) {
      this.replayMissedEvents(client, data.lastSequenceId, [room]);
    }
  }

  @SubscribeMessage('leave_track_room')
  handleLeaveTrackRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { trackId: string },
  ): void {
    const room = `track_${data.trackId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} left room: ${room}`);
    
    client.emit('left_room', { room, trackId: data.trackId });
  }

  @SubscribeMessage('ack')
  handleAck(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sequenceId: number },
  ): void {
    this.logger.debug(`Client ${client.id} acknowledged sequence ID: ${data.sequenceId}`);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date() });
  }

  /**
   * Listen for tip.verified events from TipsService
   */
  @OnEvent('tip.verified')
  async handleTipVerifiedEvent(event: TipVerifiedEvent): Promise<void> {
    this.logger.log(`Received tip.verified event for tip ${event.tip.id}`);
    await this.sendTipNotification(event.tip);
  }

  /**
   * Send tip notification to relevant rooms and store it
   */
  async sendTipNotification(tip: Tip): Promise<void> {
    try {
      const artistRoom = `artist_${tip.artistId}`;
      const trackRoom = tip.trackId ? `track_${tip.trackId}` : null;
      const rooms = [artistRoom, 'global'];
      if (trackRoom) rooms.push(trackRoom);

      const payload = {
        tipId: tip.id,
        artistId: tip.artistId,
        trackId: tip.trackId,
        amount: tip.amount,
        asset: tip.asset,
        message: tip.message,
        senderAddress: tip.isAnonymous ? undefined : tip.senderAddress,
        isAnonymous: tip.isAnonymous,
        createdAt: tip.createdAt,
        artist: tip.artist,
        track: tip.track,
      };

      // Store event first to get sequence ID
      const storedEvent = this.eventStore.storeEvent('tip_received', payload, rooms);

      const notificationData: TipNotificationData = {
        type: 'tip_received',
        sequenceId: storedEvent.sequenceId,
        data: payload,
      };

      // Send to artist room
      this.server.to(artistRoom).emit('tip_notification', notificationData);
      this.logger.log(`Sent tip notification ${storedEvent.sequenceId} to room: ${artistRoom}`);

      // Send to track room if track is specified
      if (trackRoom) {
        this.server.to(trackRoom).emit('tip_notification', notificationData);
        this.logger.log(`Sent tip notification ${storedEvent.sequenceId} to room: ${trackRoom}`);
      }

      // Send to all connected clients for global notifications
      this.server.emit('global_tip_notification', notificationData);
      this.logger.log(`Sent global tip notification ${storedEvent.sequenceId}`);

    } catch (error) {
      this.logger.error(`Failed to send tip notification: ${error.message}`);
    }
  }

  /**
   * Replay missed events for a client
   */
  private replayMissedEvents(client: Socket, lastSequenceId: number, rooms: string[]): void {
    const missedEvents = this.eventStore.getEventsAfter(lastSequenceId, rooms);
    if (missedEvents.length > 0) {
      this.logger.log(`Replaying ${missedEvents.length} missed events for client ${client.id}`);
      for (const event of missedEvents) {
        const notificationData: TipNotificationData = {
          type: 'tip_received',
          sequenceId: event.sequenceId,
          data: event.data,
        };
        client.emit('tip_notification', notificationData);
      }
    }
  }

  /**
   * Send general notification
   */
  async sendNotification(event: string, data: any, room?: string): Promise<void> {
    try {
      if (room) {
        this.server.to(room).emit(event, data);
        this.logger.log(`Sent notification to room ${room}: ${event}`);
      } else {
        this.server.emit(event, data);
        this.logger.log(`Sent global notification: ${event}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`);
    }
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get room members count
   */
  getRoomMembersCount(room: string): number {
    const roomSockets = this.server.sockets.adapter.rooms.get(room);
    return roomSockets ? roomSockets.size : 0;
  }

  /**
   * Broadcast system message
   */
  async broadcastSystemMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
    const data = {
      type: 'system_message',
      message,
      messageType: type,
      timestamp: new Date(),
    };

    await this.sendNotification('system_message', data);
    this.logger.log(`Broadcast system message: ${message}`);
  }
}
