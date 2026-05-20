import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotesService } from './notes.service';

@ApiTags('notes')
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list() {
    return this.notes.list();
  }

  @Post()
  async create(@Body() body: { text: string; title?: string; tags?: string[] }) {
    if (!body?.text?.trim()) throw new BadRequestException('text requerido');
    return this.notes.create({
      text: body.text,
      title: body.title,
      tags: body.tags,
      source: 'dashboard',
    });
  }

  @Post('organize')
  async organize(@Body() body: { text?: string; id?: string }) {
    if (body.id) {
      const n = await this.notes.findById(body.id);
      if (!n) throw new BadRequestException('Nota no encontrada');
      const organized = await this.notes.organize({ id: n.id, text: n.text });
      return { organized };
    }
    if (!body.text) throw new BadRequestException('text o id requerido');
    const organized = await this.notes.organize(body.text);
    return { organized };
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.notes.deleteById(id);
  }
}
