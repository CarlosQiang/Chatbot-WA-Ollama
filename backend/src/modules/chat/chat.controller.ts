import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';

@ApiTags('chats')
@Controller('chats')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list() {
    return this.chat.listChats();
  }

  @Get(':chatId/messages')
  messages(@Param('chatId') chatId: string, @Query('limit') limit?: string) {
    return this.chat.listMessages(chatId, limit ? parseInt(limit, 10) : 100);
  }

  @Post(':chatId/reset')
  reset(@Param('chatId') chatId: string) {
    return this.chat.resetContext(chatId);
  }

  @Post('send')
  send(@Body() body: { chatId: string; text: string; force?: boolean }) {
    return this.chat.handleIncomingText(body.chatId, body.text, {
      force: !!body.force,
      auditedBy: 'dashboard',
    });
  }
}
